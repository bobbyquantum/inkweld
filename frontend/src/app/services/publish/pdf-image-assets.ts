import { mediaIdFromSrc } from './html-generator.service';

/** An image registered with the Typst compiler for one PDF run. */
export interface PdfImageAsset {
  /** Virtual path the Typst markup refers to (`#image("…")`). */
  path: string;
  /** Pixel size, when known, so the layout can size portraits sensibly. */
  width?: number;
  height?: number;
}

/** Bytes Typst can decode, plus what we know about them. */
export interface PreparedImage {
  bytes: Uint8Array;
  ext: 'png' | 'jpg' | 'gif' | 'svg';
  width?: number;
  height?: number;
}

/** Longest side, in pixels, images are scaled down to before embedding. */
export const PDF_IMAGE_MAX_SIDE = 1600;

/** JPEG quality used when re-encoding images for the PDF. */
const PDF_IMAGE_JPEG_QUALITY = 0.86;

/** Image types Typst can decode directly. */
const TYPST_IMAGE_TYPES: Record<string, PreparedImage['ext']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * Width for an image in document flow, as a Typst relative length. A tall
 * image at full column width would run past the bottom of the page, so
 * squares and portraits are set narrower than landscapes.
 */
export function typstImageWidth(asset: PdfImageAsset): string {
  const { width, height } = asset;
  if (!width || !height) return '80%';
  const ratio = width / height;
  if (ratio >= 1.2) return '100%';
  if (ratio >= 0.9) return '70%';
  return '55%';
}

/** Every image `src` in a ProseMirror document, in document order. */
export function collectImageSources(
  node: unknown,
  out: string[] = []
): string[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectImageSources(child, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  const rawName = record['nodeName'] ?? record['type'];
  const name = typeof rawName === 'string' ? rawName : '';
  if (name.toLowerCase() === 'image') {
    const attrs = record['attrs'] as Record<string, unknown> | undefined;
    const src = attrs?.['src'];
    if (typeof src === 'string' && src) out.push(src);
  }
  const children = record['content'] ?? record['children'];
  if (children) collectImageSources(children, out);
  return out;
}

/**
 * Re-encode an image as a JPEG no larger than {@link PDF_IMAGE_MAX_SIDE} on
 * its longest side. Generated art is often a multi-megabyte PNG; embedded
 * as-is, a dozen of them make a PDF of tens of megabytes. Returns null when
 * the browser cannot decode or re-encode it (SVG, no OffscreenCanvas), so
 * the caller can fall back to the original bytes.
 */
async function reencodeAsJpeg(blob: Blob): Promise<PreparedImage | null> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined' ||
    blob.type === 'image/svg+xml'
  ) {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(
      1,
      PDF_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    // JPEG has no alpha: paint transparent areas white, like the page.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const jpeg = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: PDF_IMAGE_JPEG_QUALITY,
    });
    return {
      bytes: new Uint8Array(await jpeg.arrayBuffer()),
      ext: 'jpg',
      width,
      height,
    };
  } catch {
    return null;
  }
}

/** Turn an image blob into bytes Typst can decode, or null when it can't. */
export async function prepareImageForTypst(
  blob: Blob
): Promise<PreparedImage | null> {
  const reencoded = await reencodeAsJpeg(blob);
  if (reencoded) return reencoded;
  const ext = TYPST_IMAGE_TYPES[blob.type.toLowerCase()];
  if (!ext) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ext };
}

/**
 * Registers the images a PDF needs with the Typst compiler. Each distinct
 * source is loaded and mapped once per run, and markup refers to the
 * returned virtual path. A source that cannot be loaded resolves to null
 * and is left out of the PDF rather than failing compilation.
 */
export class PdfImageAssets {
  private readonly assets = new Map<string, Promise<PdfImageAsset | null>>();
  private counter = 0;

  constructor(
    /** Load a project media file by id. */
    private readonly loadMedia: (mediaId: string) => Promise<Blob | null>,
    /** Make bytes available to the Typst compiler at a virtual path. */
    private readonly mapShadow: (
      path: string,
      bytes: Uint8Array
    ) => Promise<void>,
    /** Turn a blob into bytes Typst can decode. */
    private readonly prepare: (
      blob: Blob
    ) => Promise<PreparedImage | null> = prepareImageForTypst
  ) {}

  /** Register a `media:` / `media://` reference or a `data:image` URL. */
  register(src: unknown): Promise<PdfImageAsset | null> {
    if (typeof src !== 'string' || !src) return Promise.resolve(null);
    let pending = this.assets.get(src);
    if (!pending) {
      pending = this.load(src);
      this.assets.set(src, pending);
    }
    return pending;
  }

  private async load(src: string): Promise<PdfImageAsset | null> {
    try {
      const blob = await this.loadBlob(src);
      if (!blob) return null;
      const image = await this.prepare(blob);
      if (!image) return null;
      this.counter += 1;
      const path = `images/img-${this.counter}.${image.ext}`;
      await this.mapShadow(path, image.bytes);
      return { path, width: image.width, height: image.height };
    } catch {
      return null;
    }
  }

  private async loadBlob(src: string): Promise<Blob | null> {
    const mediaId = mediaIdFromSrc(src);
    if (mediaId) return this.loadMedia(mediaId);
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(src)) {
      const response = await fetch(src);
      return response.blob();
    }
    return null;
  }
}
