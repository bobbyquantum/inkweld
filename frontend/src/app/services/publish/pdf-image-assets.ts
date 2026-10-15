import { mediaIdFromSrc } from './html-generator.service';
import { shrinkImageToJpeg } from './publish-image-shrink';

/** An image registered with the Typst compiler for one PDF run. */
export interface PdfImageAsset {
  /**
   * Absolute virtual path the Typst markup refers to (`#image("…")`).
   * It must be absolute: typst.ts compiles `mainContent` from a file in
   * `/tmp`, so a relative path would resolve under `/tmp` and miss the
   * shadow file.
   */
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

/** Turn an image blob into bytes Typst can decode, or null when it can't. */
export async function prepareImageForTypst(
  blob: Blob
): Promise<PreparedImage | null> {
  const shrunk = await shrinkImageToJpeg(blob);
  if (shrunk) {
    return {
      bytes: new Uint8Array(await shrunk.blob.arrayBuffer()),
      ext: 'jpg',
      width: shrunk.width,
      height: shrunk.height,
    };
  }
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
      const path = `/images/img-${this.counter}.${image.ext}`;
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
