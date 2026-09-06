import { djb2Hex, stableStringify } from '../utils/schema-hash';
import type { CanvasFrame, CanvasObject } from './canvas.model';
import type { CanvasContents } from './canvas-edit';

/**
 * Where the project cover is rendered from.
 *
 * The cover every consumer displays (home cards, EPUB, website export, other
 * devices) is still the rasterised image identified by `coverMediaId`. A
 * cover *source* records that this raster is generated from a canvas frame,
 * so the app can regenerate it whenever the frame's contents change.
 */
export interface CanvasCoverSource {
  type: 'canvas';
  /** The CANVAS element whose frame is the cover. */
  elementId: string;
  /** The frame (crop region) within that canvas. */
  frameId: string;
  /**
   * {@link coverSourceHash} of the frame and contents the current raster was
   * rendered from. Absent until the first successful render.
   */
  renderedHash?: string;
  /** ISO timestamp of the last successful render. */
  renderedAt?: string;
}

export type CoverSource = CanvasCoverSource;

/** Parse a persisted cover source, tolerating garbage from older clients. */
export function parseCoverSource(raw: unknown): CoverSource | undefined {
  let value = raw;
  if (typeof raw === 'string') {
    if (!raw) return undefined;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate['type'] !== 'canvas' ||
    typeof candidate['elementId'] !== 'string' ||
    typeof candidate['frameId'] !== 'string'
  ) {
    return undefined;
  }
  const source: CanvasCoverSource = {
    type: 'canvas',
    elementId: candidate['elementId'],
    frameId: candidate['frameId'],
  };
  if (typeof candidate['renderedHash'] === 'string') {
    source.renderedHash = candidate['renderedHash'];
  }
  if (typeof candidate['renderedAt'] === 'string') {
    source.renderedAt = candidate['renderedAt'];
  }
  return source;
}

/** Serialise a cover source for a string-valued Yjs map. */
export function serializeCoverSource(source: CoverSource): string {
  return JSON.stringify(source);
}

/** Whether `frame` on `elementId` is the frame the cover renders from. */
export function isCoverSourceFrame(
  source: CoverSource | undefined,
  elementId: string,
  frameId: string
): boolean {
  return (
    source?.type === 'canvas' &&
    source.elementId === elementId &&
    source.frameId === frameId
  );
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Change-detection hash of everything that affects how a frame renders: the
 * frame's rectangle, and every visible object on a visible layer together
 * with its layer's opacity. Objects are ordered by id so the hash is stable
 * regardless of the order objects arrive from the sync provider.
 *
 * Hidden objects and layers are excluded so toggling something that is
 * already invisible does not trigger a re-render. Objects outside the frame
 * are included: measuring exact bounds for rotated ink strokes is costlier
 * than the occasional redundant render.
 */
export function coverSourceHash(
  contents: CanvasContents,
  frame: CanvasFrame
): string {
  const layerOpacity = new Map<string, number>();
  const layerOrder = new Map<string, number>();
  for (const layer of contents.layers) {
    if (!layer.visible) continue;
    layerOpacity.set(layer.id, layer.opacity);
    layerOrder.set(layer.id, layer.order);
  }

  const visible = contents.objects
    .filter(
      obj =>
        obj.visible && (obj.type === 'pin' || layerOpacity.has(obj.layerId))
    )
    .sort((a, b) => compareIds(a.id, b.id))
    .map((obj: CanvasObject) => ({
      o: obj,
      lo: layerOpacity.get(obj.layerId) ?? 1,
      lz: layerOrder.get(obj.layerId) ?? 0,
    }));

  // Object order within a layer matters for overlapping shapes.
  const visibleIds = new Set(visible.map(v => v.o.id));
  const order = contents.objects
    .map(obj => obj.id)
    .filter(id => visibleIds.has(id));

  return djb2Hex(
    stableStringify({
      rect: {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      },
      order,
      visible,
    })
  );
}

/** The frame a cover source points at, if it still exists. */
export function coverSourceFrame(
  source: CoverSource | undefined,
  contents: CanvasContents | null | undefined
): CanvasFrame | undefined {
  if (!source || !contents?.frames) return undefined;
  return contents.frames.find(f => f.id === source.frameId);
}
