import Konva from 'konva';

import { base64ToBlob } from '../../utils/base64-utils';

/** A rectangular region in canvas world coordinates. */
export interface RasterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RasterMimeType = 'image/png' | 'image/jpeg';

export interface RasterOptions {
  /** Device pixels per canvas unit; clamped by {@link clampPixelRatio}. */
  pixelRatio?: number;
  /** Output encoding. JPEG needs a `background` — it has no alpha channel. */
  mimeType?: RasterMimeType;
  /** JPEG quality 0..1 (ignored for PNG). */
  quality?: number;
  /** Solid fill painted beneath the content, e.g. `#ffffff` for JPEG. */
  background?: string;
  /** Receives the exception when the browser refuses to render. */
  onError?: (error: unknown) => void;
}

/**
 * Browser canvases fail (throw, or hand back an empty data URL) beyond a
 * per-side and a total-pixel limit. The export pixel ratio is scaled down to
 * stay under both rather than silently producing a blank file.
 */
export const MAX_EXPORT_SIDE_PX = 16_384;
export const MAX_EXPORT_PIXELS = 100_000_000;

/** What `toDataURL` returns for a canvas the browser refused to render. */
const EMPTY_DATA_URL = 'data:,';

/** Largest pixel ratio (≤ requested) that keeps the output renderable. */
export function clampPixelRatio(rect: RasterRect, requested: number): number {
  const bySide = MAX_EXPORT_SIDE_PX / Math.max(rect.width, rect.height, 1);
  const byArea = Math.sqrt(
    MAX_EXPORT_PIXELS / Math.max(rect.width * rect.height, 1)
  );
  return Math.min(requested, bySide, byArea);
}

/** Treat the browser's "refused to render" result as no image at all. */
function rendered(dataUrl: string): string | null {
  return dataUrl && dataUrl !== EMPTY_DATA_URL ? dataUrl : null;
}

/**
 * Render a world-space region of a stage to a data URL.
 *
 * The stage is temporarily resized and re-positioned so the region fills it
 * exactly at scale 1: Konva composites layer canvases sized to the viewport,
 * so cropping the current view could never capture content outside it (or
 * at a different zoom). `chrome` layers (selection handles, frame borders…)
 * are hidden for the duration. Everything is restored afterwards.
 *
 * Returns null when the browser refuses to render (oversized or tainted
 * canvas); callers report that rather than saving a blank file.
 */
export function renderStageRegion(
  stage: Konva.Stage,
  rect: RasterRect,
  options: RasterOptions = {},
  chrome: (Konva.Layer | null)[] = []
): string | null {
  const ratio = clampPixelRatio(rect, options.pixelRatio ?? 1);

  const saved = {
    width: stage.width(),
    height: stage.height(),
    x: stage.x(),
    y: stage.y(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
  };
  const hiddenChrome = chrome.filter(
    (layer): layer is Konva.Layer => !!layer && layer.visible()
  );
  let backgroundLayer: Konva.Layer | null = null;

  try {
    for (const layer of hiddenChrome) layer.visible(false);
    stage.size({ width: rect.width, height: rect.height });
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: -rect.x, y: -rect.y });

    if (options.background) {
      backgroundLayer = new Konva.Layer({ listening: false });
      backgroundLayer.add(
        new Konva.Rect({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fill: options.background,
        })
      );
      stage.add(backgroundLayer);
      backgroundLayer.moveToBottom();
    }

    stage.batchDraw();
    return rendered(
      stage.toDataURL({
        pixelRatio: ratio,
        mimeType: options.mimeType ?? 'image/png',
        quality: options.quality,
      })
    );
  } catch (error) {
    // Oversized or tainted canvases throw; the caller reports failure.
    options.onError?.(error);
    return null;
  } finally {
    backgroundLayer?.destroy();
    for (const layer of hiddenChrome) layer.visible(true);
    stage.size({ width: saved.width, height: saved.height });
    stage.scale({ x: saved.scaleX, y: saved.scaleY });
    stage.position({ x: saved.x, y: saved.y });
    stage.batchDraw();
  }
}

/**
 * Decode a data URL into a Blob.
 *
 * Decoded locally rather than via `fetch(dataUrl)`: the Cloudflare Pages CSP
 * (`connect-src 'self' https: wss:`) blocks data: fetches, which silently
 * broke cover rendering there.
 */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  try {
    return Promise.resolve(base64ToBlob(dataUrl));
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
