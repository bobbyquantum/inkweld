import type Konva from 'konva';

/** A rectangle in canvas world coordinates. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Union of the rendered content on the given layers, in world coordinates.
 * Uses Konva's client rects, so rotation, auto-sized text, stroke widths and
 * hidden nodes are all accounted for. Returns null when nothing renders.
 */
export function layersContentBounds(
  layers: Iterable<Konva.Layer | null | undefined>
): WorldRect | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const layer of layers) {
    if (!layer?.visible()) continue;
    const rect = layer.getClientRect({ skipTransform: true });
    if (rect.width === 0 && rect.height === 0) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
