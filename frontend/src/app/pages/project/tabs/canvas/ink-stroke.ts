/**
 * Ink geometry helpers for freehand canvas strokes.
 *
 * Raw pointer samples are noisy, dense and full-precision — persisting them
 * verbatim makes canvases huge and strokes visibly faceted. These pure
 * helpers turn a captured sample stream into something worth storing:
 * simplified, rounded, and (when pressure is enabled) expanded into a filled
 * outline whose width follows stylus pressure or drawing speed.
 *
 * All functions operate on flat `[x0, y0, x1, y1, …]` coordinate arrays, the
 * same representation used by `CanvasPath.points` and Konva's `Line`.
 */

/** Minimum canvas-space distance between two captured samples. */
export const MIN_SAMPLE_DISTANCE = 1.2;

/** Half-width floor as a fraction of the base radius, so ink never vanishes. */
const MIN_RADIUS_RATIO = 0.25;

/** Points used to approximate each round cap. */
const CAP_SEGMENTS = 8;

/** Smoothing applied to the pressure signal (0 = none, 1 = frozen). */
const PRESSURE_SMOOTHING = 0.55;

/** Speed (canvas units per ms) at which a velocity-driven stroke is thinnest. */
const MAX_SPEED = 2.2;

/** Squared perpendicular distance from (px,py) to the segment (ax,ay)-(bx,by). */
function perpDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.min(Math.max(t, 0), 1);
  }

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Ramer–Douglas–Peucker simplification, returning the indices of the points
 * worth keeping. Returning indices (rather than points) lets callers thin a
 * parallel array — pressures — with exactly the same decision.
 *
 * Iterative on purpose: a long stroke can be tens of thousands of samples,
 * which is enough to blow a recursive implementation's stack.
 */
export function simplifyIndices(points: number[], epsilon: number): number[] {
  const count = Math.floor(points.length / 2);
  if (count <= 2 || epsilon <= 0) {
    return Array.from({ length: count }, (_, i) => i);
  }

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  const epsilonSq = epsilon * epsilon;
  const stack: [number, number][] = [[0, count - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    if (last <= first + 1) continue;

    const ax = points[first * 2];
    const ay = points[first * 2 + 1];
    const bx = points[last * 2];
    const by = points[last * 2 + 1];

    let farthest = -1;
    let farthestDistSq = 0;
    for (let i = first + 1; i < last; i++) {
      const distSq = perpDistanceSq(
        points[i * 2],
        points[i * 2 + 1],
        ax,
        ay,
        bx,
        by
      );
      if (distSq > farthestDistSq) {
        farthestDistSq = distSq;
        farthest = i;
      }
    }

    if (farthest > 0 && farthestDistSq > epsilonSq) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    if (keep[i]) indices.push(i);
  }
  return indices;
}

/** Simplify a flat coordinate array with {@link simplifyIndices}. */
export function simplifyPath(points: number[], epsilon: number): number[] {
  const indices = simplifyIndices(points, epsilon);
  const out: number[] = [];
  for (const i of indices) out.push(points[i * 2], points[i * 2 + 1]);
  return out;
}

/** Pick the values at `indices` from a parallel per-point array. */
export function pickAt(values: number[], indices: number[]): number[] {
  return indices.map(i => values[i]).filter(v => v !== undefined);
}

/**
 * Add back points where a parallel signal — stroke width — strays from the
 * straight line between the points geometry alone chose to keep.
 *
 * Geometric simplification looks only at position, so a *straight* stroke
 * collapses to its two endpoints and takes the pressure swell in the middle
 * with it. This restores the samples that carry that shape.
 */
export function refineByValue(
  kept: number[],
  values: number[],
  tolerance: number
): number[] {
  if (kept.length < 2 || tolerance <= 0) return kept;

  const result = new Set(kept);
  const stack: [number, number][] = [];
  for (let i = 0; i < kept.length - 1; i++) stack.push([kept[i], kept[i + 1]]);

  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    if (to <= from + 1) continue;

    const start = values[from];
    const end = values[to];
    let worst = -1;
    let worstDeviation = tolerance;

    for (let i = from + 1; i < to; i++) {
      const expected = start + ((end - start) * (i - from)) / (to - from);
      const deviation = Math.abs((values[i] ?? expected) - expected);
      if (deviation > worstDeviation) {
        worstDeviation = deviation;
        worst = i;
      }
    }

    if (worst >= 0) {
      result.add(worst);
      stack.push([from, worst], [worst, to]);
    }
  }

  return [...result].sort((a, b) => a - b);
}

/** Round every coordinate to `decimals` places to keep persisted JSON small. */
export function roundCoords(points: number[], decimals = 2): number[] {
  const factor = 10 ** decimals;
  return points.map(v => Math.round(v * factor) / factor);
}

/**
 * Translate a flat coordinate array so its bounding box starts at the origin,
 * returning the offset that was removed. `CanvasPath.points` are documented as
 * object-relative; normalizing here keeps drag, paste and duplicate honest and
 * stops far-from-origin strokes from storing huge coordinates.
 */
export function normalizeToOrigin(points: number[]): {
  points: number[];
  offsetX: number;
  offsetY: number;
} {
  if (points.length < 2) return { points: [...points], offsetX: 0, offsetY: 0 };

  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i < points.length - 1; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
  }

  const out = new Array<number>(points.length);
  for (let i = 0; i < points.length - 1; i += 2) {
    out[i] = points[i] - minX;
    out[i + 1] = points[i + 1] - minY;
  }
  return { points: out, offsetX: minX, offsetY: minY };
}

/**
 * Map a pointer sample to a width multiplier in the 0–1 range.
 *
 * Stylus input reports real pressure. Mouse and trackpad input always reports
 * `0.5`, so speed stands in for pressure instead: fast strokes thin out the
 * way a real pen does, which is what makes mouse ink stop looking like wire.
 */
export function rawWidthFactor(
  pressure: number | undefined,
  pointerType: string | undefined,
  speed: number
): number {
  const raw =
    pointerType === 'pen' && typeof pressure === 'number' && pressure > 0
      ? pressure
      : 1 - Math.min(speed / MAX_SPEED, 1) * 0.65;

  return Math.min(Math.max(raw, 0.05), 1);
}

/**
 * {@link rawWidthFactor} eased towards the previous sample, so jitter in the
 * pressure signal doesn't show up as lumps in the ink.
 */
export function sampleWidthFactor(
  pressure: number | undefined,
  pointerType: string | undefined,
  speed: number,
  previous: number
): number {
  const raw = rawWidthFactor(pressure, pointerType, speed);
  return previous * PRESSURE_SMOOTHING + raw * (1 - PRESSURE_SMOOTHING);
}

/** Unit tangent at point `i`, falling back to the previous usable direction. */
function tangentAt(
  points: number[],
  i: number,
  count: number,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  const prev = Math.max(i - 1, 0);
  const next = Math.min(i + 1, count - 1);
  const dx = points[next * 2] - points[prev * 2];
  const dy = points[next * 2 + 1] - points[prev * 2 + 1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return fallback;
  return { x: dx / len, y: dy / len };
}

/** Append a semicircular cap around `cx,cy` to `out`. */
function appendCap(
  out: number[],
  cx: number,
  cy: number,
  normal: { x: number; y: number },
  tangent: { x: number; y: number },
  radius: number,
  sign: number
): void {
  for (let s = 1; s < CAP_SEGMENTS; s++) {
    const theta = (Math.PI * s) / CAP_SEGMENTS;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    out.push(
      cx + sign * normal.x * radius * cos + sign * tangent.x * radius * sin,
      cy + sign * normal.y * radius * cos + sign * tangent.y * radius * sin
    );
  }
}

/**
 * Expand a centreline plus per-point width factors into a closed outline
 * polygon, rendered as a filled shape. The polygon may self-intersect on tight
 * corners; both Konva and SVG use non-zero winding, so it still fills solidly.
 */
export function buildInkOutline(
  points: number[],
  widthFactors: number[],
  strokeWidth: number
): number[] {
  const count = Math.floor(points.length / 2);
  const baseRadius = Math.max(strokeWidth, 0.1) / 2;
  if (count === 0) return [];

  const radiusAt = (i: number): number =>
    baseRadius *
    Math.min(Math.max(widthFactors[i] ?? 1, MIN_RADIUS_RATIO), 1.4);

  if (count === 1) {
    const [cx, cy] = points;
    const r = radiusAt(0);
    const dot: number[] = [];
    for (let s = 0; s < CAP_SEGMENTS * 2; s++) {
      const theta = (Math.PI * 2 * s) / (CAP_SEGMENTS * 2);
      dot.push(cx + r * Math.cos(theta), cy + r * Math.sin(theta));
    }
    return dot;
  }

  const left: number[] = [];
  const right: number[] = [];
  let lastTangent = { x: 1, y: 0 };
  let startNormal = { x: 0, y: 1 };
  let endNormal = { x: 0, y: 1 };

  for (let i = 0; i < count; i++) {
    const tangent = tangentAt(points, i, count, lastTangent);
    lastTangent = tangent;
    const normal = { x: -tangent.y, y: tangent.x };
    const r = radiusAt(i);
    const x = points[i * 2];
    const y = points[i * 2 + 1];

    left.push(x + normal.x * r, y + normal.y * r);
    right.push(x - normal.x * r, y - normal.y * r);

    if (i === 0) startNormal = normal;
    if (i === count - 1) endNormal = normal;
  }

  const outline = [...left];

  const endX = points[(count - 1) * 2];
  const endY = points[(count - 1) * 2 + 1];
  appendCap(
    outline,
    endX,
    endY,
    endNormal,
    lastTangent,
    radiusAt(count - 1),
    1
  );

  for (let i = count - 1; i >= 0; i--) {
    outline.push(right[i * 2], right[i * 2 + 1]);
  }

  const startTangent = tangentAt(points, 0, count, lastTangent);
  appendCap(
    outline,
    points[0],
    points[1],
    startNormal,
    { x: -startTangent.x, y: -startTangent.y },
    radiusAt(0),
    -1
  );

  return outline;
}

/**
 * Catmull-Rom control points, matching the formula Konva uses for `tension`
 * so exported SVG curves follow the same path as the on-screen stroke.
 */
function controlPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tension: number
): [number, number, number, number] {
  const d01 = Math.hypot(x1 - x0, y1 - y0);
  const d12 = Math.hypot(x2 - x1, y2 - y1);
  const total = d01 + d12;
  if (total === 0) return [x1, y1, x1, y1];

  const fa = (tension * d01) / total;
  const fb = (tension * d12) / total;
  return [
    x1 - fa * (x2 - x0),
    y1 - fa * (y2 - y0),
    x1 + fb * (x2 - x0),
    y1 + fb * (y2 - y0),
  ];
}

/**
 * Build an SVG path `d` string for a polyline, optionally smoothed with the
 * same tension model Konva applies on the canvas.
 */
export function buildPathData(
  points: number[],
  tension: number,
  closed: boolean
): string {
  const count = Math.floor(points.length / 2);
  if (count < 2) return '';

  const px = (i: number) => points[i * 2];
  const py = (i: number) => points[i * 2 + 1];

  if (tension <= 0 || count < 3) {
    const segments = [`M ${px(0)},${py(0)}`];
    for (let i = 1; i < count; i++) segments.push(`L ${px(i)},${py(i)}`);
    if (closed) segments.push('Z');
    return segments.join(' ');
  }

  // Control point pairs per interior point; endpoints anchor to themselves.
  const after: [number, number][] = [[px(0), py(0)]];
  const before: [number, number][] = [[px(0), py(0)]];
  for (let i = 1; i < count - 1; i++) {
    const [b1x, b1y, a1x, a1y] = controlPoints(
      px(i - 1),
      py(i - 1),
      px(i),
      py(i),
      px(i + 1),
      py(i + 1),
      tension
    );
    before.push([b1x, b1y]);
    after.push([a1x, a1y]);
  }
  before.push([px(count - 1), py(count - 1)]);
  after.push([px(count - 1), py(count - 1)]);

  const segments = [`M ${px(0)},${py(0)}`];
  for (let i = 0; i < count - 1; i++) {
    const [c1x, c1y] = after[i];
    const [c2x, c2y] = before[i + 1];
    segments.push(`C ${c1x},${c1y} ${c2x},${c2y} ${px(i + 1)},${py(i + 1)}`);
  }
  if (closed) segments.push('Z');
  return segments.join(' ');
}
