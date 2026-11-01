/**
 * Prepares a canvas's images for the rasteriser, which can only read an image
 * embedded in the SVG and can only decode PNG, JPEG, GIF and SVG.
 */

import { type CanvasObject, isMediaReference, MAX_RENDER_SIZE } from '@inkweld/canvas';
import { Resvg } from '@resvg/resvg-wasm';
import { imageService, readImageSize, sniffImageType } from '../image.service';
import { logger } from '../logger.service';
import { mapWithConcurrency } from '../../utils/concurrency';

const imageLog = logger.child('CanvasRenderImages');

/** Project media, as the renderer can reach it. */
export interface CanvasMediaSource {
  /** The file at this name, or null when there is none. */
  read(filename: string): Promise<Uint8Array | null>;
  /** The name of the file with this media id and any extension, if any. */
  findByMediaId(mediaId: string): Promise<string | null>;
}

/** Beyond these a render could run out of memory on Workers. */
export const MAX_RENDER_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_RENDER_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;

/**
 * A file's size says little about the image in it: a 1.5 MB PNG of one colour
 * can hold 400 million pixels. Each takes 4 bytes once decoded, in WebAssembly
 * memory that never shrinks, so one such image would keep a server process at
 * gigabytes until it restarts, and hold its thread for seconds.
 */
export const MAX_RENDER_IMAGE_PIXELS = 16 * 1024 * 1024;
export const MAX_RENDER_TOTAL_IMAGE_PIXELS = 100 * 1024 * 1024;

/** resvg's GIF decoder refuses a frame past 50 MB, and leaves a gap with no error. */
const MAX_RENDER_GIF_PIXELS = 12_500_000;

const DIRECT_FORMATS = new Set(['image/png', 'image/jpeg', 'image/gif']);
const READ_CONCURRENCY = 4;

function isSvg(filename: string): boolean {
  return /\.svg$/i.test(filename);
}

function dataUri(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** The media file a reference names, or null when it names nothing there. */
async function findFile(src: string, media: CanvasMediaSource): Promise<string | null> {
  if (src.startsWith('media://')) return src.substring('media://'.length);
  return media.findByMediaId(src.substring('media:'.length));
}

/** A placed image, in a form the rasteriser can draw. */
type PreparedImage = { mimeType: string; data: Uint8Array; pixels: number } | { problem: string };

const TOO_LARGE: PreparedImage = { problem: 'is too large to draw here' };
const PAST_THE_BUDGET = 'is past what one render can hold';

/** resvg leaves a gap for an embedded SVG it cannot parse, and says nothing. */
function parsesAsSvg(data: Uint8Array): boolean {
  try {
    new Resvg(data).free();
    return true;
  } catch {
    return false;
  }
}

function pixelsIn(data: Buffer, type: string): number {
  const size = readImageSize(data, type);
  return size ? size.width * size.height : 0;
}

async function prepareBytes(data: Buffer, svg: boolean): Promise<PreparedImage> {
  if (data.byteLength > MAX_RENDER_IMAGE_BYTES) return TOO_LARGE;
  if (svg) {
    return parsesAsSvg(data)
      ? { mimeType: 'image/svg+xml', data, pixels: 0 }
      : { problem: 'is not an SVG that can be read' };
  }

  const type = sniffImageType(data);
  const direct = type !== null && DIRECT_FORMATS.has(type);
  if (direct) {
    const pixels = pixelsIn(data, type);
    if (pixels === 0) return { problem: 'is a damaged image file' };
    const limit = type === 'image/gif' ? MAX_RENDER_GIF_PIXELS : MAX_RENDER_IMAGE_PIXELS;
    if (pixels <= limit) return { mimeType: type, data, pixels };
  }
  // WebP and AVIF, or too many pixels to decode here. Sharp can convert them
  // where it runs, which is not Workers. No render shows more than this.
  const converted = await imageService.convertToPng(data, MAX_RENDER_SIZE);
  if (converted) {
    return {
      mimeType: 'image/png',
      data: converted,
      pixels: pixelsIn(converted, 'image/png'),
    };
  }
  return direct
    ? TOO_LARGE
    : { problem: `is ${type ?? 'an unknown format'}, which cannot be drawn here` };
}

async function prepareMediaImage(src: string, media: CanvasMediaSource): Promise<PreparedImage> {
  // Anyone who can edit the project can store any reference, through the sync
  // socket as well as the tools, so a stored one must not reach outside it.
  if (!isMediaReference(src)) return { problem: 'is not a valid media reference' };
  let filename: string | null;
  let data: Uint8Array | null;
  try {
    filename = await findFile(src, media);
    data = filename ? await media.read(filename) : null;
  } catch (error) {
    imageLog.warn(`Could not read canvas image ${src}`, { error });
    return { problem: 'could not be read' };
  }
  if (!filename || !data) return { problem: "is not in the project's media" };
  return prepareBytes(Buffer.from(data), isSvg(filename));
}

function inlineBytes(body: string, isBase64: boolean): Buffer | null {
  if (isBase64) return Buffer.from(body, 'base64');
  try {
    return Buffer.from(decodeURIComponent(body));
  } catch {
    return null;
  }
}

function prepareInlineImage(src: string): Promise<PreparedImage> | PreparedImage {
  const header = /^data:image\/(png|jpeg|gif|svg\+xml)(;[^,]*)?,/.exec(src);
  if (!header) return { problem: 'is an inline format that cannot be drawn here' };
  const isBase64 = header[2]?.endsWith(';base64') ?? false;
  const body = src.substring(header[0].length);
  // The fewest bytes this could decode to. A stored image can be any length.
  if ((isBase64 ? body.length * 0.75 - 2 : body.length / 3) > MAX_RENDER_IMAGE_BYTES) {
    return TOO_LARGE;
  }
  const data = inlineBytes(body, isBase64);
  if (!data) return { problem: 'cannot be read' };
  return prepareBytes(data, header[1] === 'svg+xml');
}

function prepareImage(
  src: string,
  media: CanvasMediaSource
): Promise<PreparedImage> | PreparedImage {
  if (src.startsWith('media:')) return prepareMediaImage(src, media);
  if (src.startsWith('data:')) return prepareInlineImage(src);
  // The server fetches nothing on a canvas's say-so: that would let anyone
  // with edit access make it request any address it can reach.
  return { problem: 'is an external URL, which the server does not fetch' };
}

export interface CanvasImageSources {
  /** What to draw for an image source, or null for a placeholder. */
  resolve(src: string): string | null;
  warnings: string[];
}

/**
 * Load the images among the objects a render draws. A failure costs a
 * placeholder, not the render.
 */
export async function loadCanvasImages(
  objects: readonly CanvasObject[],
  media: CanvasMediaSource
): Promise<CanvasImageSources> {
  // Each place an image is drawn embeds and decodes a copy of its own.
  const placements = new Map<string, number>();
  for (const obj of objects) {
    if (obj.type === 'image') placements.set(obj.src, (placements.get(obj.src) ?? 0) + 1);
  }
  const sources = [...placements.keys()];

  const uris = new Map<string, string>();
  let totalBytes = 0;
  let totalPixels = 0;
  let full = false;

  // Decided as each one arrives, so a canvas of large images only ever holds what
  // fits. Once one does not, the rest are not read, even any small enough to fit.
  const problems = await mapWithConcurrency(sources, READ_CONCURRENCY, async (src) => {
    if (full) return PAST_THE_BUDGET;
    const image = await prepareImage(src, media);
    if ('problem' in image) return image.problem;
    const copies = placements.get(src) ?? 1;
    const bytes = totalBytes + image.data.byteLength * copies;
    const pixels = totalPixels + image.pixels * copies;
    if (bytes > MAX_RENDER_TOTAL_IMAGE_BYTES || pixels > MAX_RENDER_TOTAL_IMAGE_PIXELS) {
      full = true;
      return PAST_THE_BUDGET;
    }
    totalBytes = bytes;
    totalPixels = pixels;
    uris.set(src, dataUri(image.mimeType, image.data));
    return null;
  });

  const warnings = sources.flatMap((src, index) => {
    const problem = problems[index];
    if (!problem) return [];
    const label = src.startsWith('data:') ? 'An inline image' : `Image ${src}`;
    return [`${label} ${problem}, so it shows as a grey box.`];
  });

  return { resolve: (src) => uris.get(src) ?? null, warnings };
}
