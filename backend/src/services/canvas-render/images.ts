/**
 * Prepares a canvas's images for the rasteriser, which can only read an image
 * embedded in the SVG and can only decode PNG, JPEG, GIF and SVG.
 */

import { type CanvasContents, type CanvasImage, isMediaReference } from '@inkweld/canvas';
import { imageService, sniffImageType } from '../image.service';
import { mapWithConcurrency } from '../../utils/concurrency';

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
type PreparedImage = { uri: string; bytes: number } | { problem: string };

async function prepareMediaImage(src: string, media: CanvasMediaSource): Promise<PreparedImage> {
  // Anyone who can edit the project can store any reference, through the sync
  // socket as well as the tools, so a stored one must not reach outside it.
  if (!isMediaReference(src)) return { problem: 'is not a valid media reference' };
  const filename = await findFile(src, media);
  const data = filename ? await media.read(filename) : null;
  if (!filename || !data) return { problem: "is not in the project's media" };
  if (data.byteLength > MAX_RENDER_IMAGE_BYTES) {
    return { problem: 'is too large to draw here' };
  }

  if (isSvg(filename)) {
    return { uri: dataUri('image/svg+xml', data), bytes: data.byteLength };
  }
  const buffer = Buffer.from(data);
  const type = sniffImageType(buffer);
  if (type && DIRECT_FORMATS.has(type)) {
    return { uri: dataUri(type, data), bytes: data.byteLength };
  }
  // WebP and AVIF. Sharp can convert them where it runs, which is not Workers.
  const converted = await imageService.convertToPng(buffer);
  if (converted) {
    return { uri: dataUri('image/png', converted), bytes: converted.byteLength };
  }
  return { problem: `is ${type ?? 'an unknown format'}, which cannot be drawn here` };
}

function prepareImage(
  src: string,
  media: CanvasMediaSource
): Promise<PreparedImage> | PreparedImage {
  if (src.startsWith('media:')) return prepareMediaImage(src, media);
  if (/^data:image\/(png|jpeg|gif|svg\+xml)[;,]/.test(src)) {
    return { uri: src, bytes: src.length };
  }
  if (src.startsWith('data:')) {
    return { problem: 'is an inline format that cannot be drawn here' };
  }
  // The server fetches nothing on a canvas's say-so: that would let anyone
  // with edit access make it request any address it can reach.
  return { problem: 'is an external URL, which the server does not fetch' };
}

export interface CanvasImageSources {
  /** What to draw for an image source, or null for a placeholder. */
  resolve(src: string): string | null;
  warnings: string[];
}

/** Load every image the canvas shows. A failure costs a placeholder, not the render. */
export async function loadCanvasImages(
  contents: CanvasContents,
  media: CanvasMediaSource
): Promise<CanvasImageSources> {
  const visibleLayers = new Set(contents.layers.filter((l) => l.visible).map((l) => l.id));
  const images = contents.objects.filter(
    (o): o is CanvasImage => o.type === 'image' && o.visible && visibleLayers.has(o.layerId)
  );
  const sources = [...new Set(images.map((image) => image.src))];

  const prepared = await mapWithConcurrency(sources, READ_CONCURRENCY, async (src) =>
    prepareImage(src, media)
  );

  const uris = new Map<string, string>();
  const warnings: string[] = [];
  let total = 0;
  const note = (src: string, problem: string): void => {
    const label = src.startsWith('data:') ? 'An inline image' : `Image ${src}`;
    warnings.push(`${label} ${problem}, so it shows as a grey box.`);
  };
  sources.forEach((src, index) => {
    const image = prepared[index];
    if ('problem' in image) {
      note(src, image.problem);
    } else if (total + image.bytes > MAX_RENDER_TOTAL_IMAGE_BYTES) {
      note(src, 'is past what one render can hold');
    } else {
      total += image.bytes;
      uris.set(src, image.uri);
    }
  });

  return { resolve: (src) => uris.get(src) ?? null, warnings };
}
