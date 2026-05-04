/**
 * Timeline view-math helpers
 *
 * Pure functions for converting between {@link TimePoint} and screen
 * coordinates on a horizontal timeline. Kept separate so they are easy to
 * unit-test without a DOM.
 */

import {
  compareTimePoints,
  isValidTimePointFor,
  type TimePoint,
  timePointToAbsolute,
  type TimeSystem,
} from '@models/time-system';
import type { TimelineEra, TimelineEvent } from '@models/timeline.model';

/** Absolute viewport bounds, in "smallest-unit" ticks. */
export interface TimelineBounds {
  minTick: bigint;
  maxTick: bigint;
}

function collectPoints(
  system: TimeSystem,
  events: readonly TimelineEvent[],
  eras: readonly TimelineEra[]
): TimePoint[] {
  const points: TimePoint[] = [];
  for (const e of events) {
    if (isValidTimePointFor(e.start, system)) points.push(e.start);
    if (e.end && isValidTimePointFor(e.end, system)) points.push(e.end);
  }
  for (const era of eras) {
    if (isValidTimePointFor(era.start, system)) points.push(era.start);
    if (isValidTimePointFor(era.end, system)) points.push(era.end);
  }
  return points;
}

/**
 * Compute default bounds that fit all events and eras, with 10% padding
 * on each side. Falls back to `[0, 100]` if there is no data.
 */
export function computeDefaultBounds(
  system: TimeSystem,
  events: readonly TimelineEvent[],
  eras: readonly TimelineEra[]
): TimelineBounds {
  const points = collectPoints(system, events, eras);
  if (points.length === 0) {
    return { minTick: 0n, maxTick: 100n };
  }
  let min = timePointToAbsolute(points[0], system);
  let max = min;
  for (const p of points) {
    const v = timePointToAbsolute(p, system);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) max = min + 1n;
  const pad = (max - min) / 10n || 1n;
  return { minTick: min - pad, maxTick: max + pad };
}

/** Convert an absolute tick value to a screen x-coordinate. */
export function tickToX(
  tick: bigint,
  bounds: TimelineBounds,
  width: number
): number {
  const span = Number(bounds.maxTick - bounds.minTick);
  if (span <= 0) return 0;
  const offset = Number(tick - bounds.minTick);
  return (offset / span) * width;
}

/** Convert a screen x-coordinate back to an absolute tick value. */
export function xToTick(
  x: number,
  bounds: TimelineBounds,
  width: number
): bigint {
  if (width <= 0) return bounds.minTick;
  const span = Number(bounds.maxTick - bounds.minTick);
  const tickSpan = span * (x / width);
  return bounds.minTick + BigInt(Math.round(tickSpan));
}

/** Zoom in/out around a pivot fraction (0–1) across the width. */
export function zoomBounds(
  bounds: TimelineBounds,
  factor: number,
  pivotFraction: number
): TimelineBounds {
  const span = bounds.maxTick - bounds.minTick;
  const pivotTick =
    bounds.minTick + BigInt(Math.round(Number(span) * pivotFraction));
  const newSpan = BigInt(Math.max(1, Math.round(Number(span) * factor)));
  const left = BigInt(Math.round(Number(newSpan) * pivotFraction));
  const right = newSpan - left;
  return { minTick: pivotTick - left, maxTick: pivotTick + right };
}

/** Pan bounds horizontally by a pixel delta. */
export function panBounds(
  bounds: TimelineBounds,
  pixelDelta: number,
  width: number
): TimelineBounds {
  if (width <= 0) return bounds;
  const span = bounds.maxTick - bounds.minTick;
  const tickDelta = BigInt(Math.round((pixelDelta / width) * Number(span)));
  return {
    minTick: bounds.minTick - tickDelta,
    maxTick: bounds.maxTick - tickDelta,
  };
}

/**
 * Pick a subdivision stride for tick marks. Returns tick values that fall
 * inside `bounds`, aiming for roughly `targetCount` marks.
 */
export function computeTickMarks(
  bounds: TimelineBounds,
  targetCount: number
): bigint[] {
  const span = bounds.maxTick - bounds.minTick;
  if (span <= 0n) return [];
  const rawStep = Number(span) / Math.max(1, targetCount);
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const choices = [1, 2, 5, 10].map(c => c * pow);
  let step = choices[0];
  for (const c of choices) {
    if (Math.abs(c - rawStep) < Math.abs(step - rawStep)) step = c;
  }
  const bigStep = BigInt(Math.max(1, Math.round(step)));
  const first =
    (bounds.minTick / bigStep) * bigStep +
    (bounds.minTick >= 0n ? 0n : -bigStep);
  const marks: bigint[] = [];
  for (let t = first; t <= bounds.maxTick; t += bigStep) {
    if (t >= bounds.minTick) marks.push(t);
    if (marks.length > 500) break; // guard
  }
  return marks;
}

/**
 * Greedy lane assignment for a horizontal "stalk + label" layout.
 *
 * Given items positioned at horizontal centres `x` with text widths
 * `labelWidth`, assign each item to the lowest lane index in which its
 * label rectangle (centred on `x`, expanded by `minGap / 2` on each side)
 * does not horizontally overlap any previously placed label in that lane.
 *
 * Items are processed in input order. Pre-sort by `x` for the most natural
 * stacking (left-to-right wins lower lanes when conflicting).
 *
 * @param items   Items to place. Each provides its centre `x` and the
 *                visual width of its label in pixels.
 * @param minGap  Minimum horizontal gap (px) required between adjacent
 *                labels in the same lane.
 * @returns       Array parallel to `items` with the assigned `laneIndex`
 *                (0 = closest to anchor) plus the total `laneCount`
 *                (i.e. `max(laneIndex) + 1`, or 0 when `items` is empty).
 */
export function assignLabelLanes(
  items: readonly { x: number; labelWidth: number }[],
  minGap: number
): { assignments: number[]; laneCount: number } {
  if (items.length === 0) return { assignments: [], laneCount: 0 };
  // For each lane, store the right edge of the last label placed.
  const laneRightEdges: number[] = [];
  const assignments: number[] = new Array<number>(items.length);
  // Process in left-to-right order to make stacking deterministic. We map
  // back to original indices so the caller can pair lanes to its inputs.
  const order = items
    .map((it, i) => ({ i, x: it.x, w: it.labelWidth }))
    .sort((a, b) => a.x - b.x || a.i - b.i);
  for (const { i, x, w } of order) {
    const halfPad = minGap / 2;
    const left = x - w / 2 - halfPad;
    const right = x + w / 2 + halfPad;
    let placed = -1;
    for (let lane = 0; lane < laneRightEdges.length; lane++) {
      if (laneRightEdges[lane] <= left) {
        laneRightEdges[lane] = right;
        placed = lane;
        break;
      }
    }
    if (placed === -1) {
      laneRightEdges.push(right);
      placed = laneRightEdges.length - 1;
    }
    assignments[i] = placed;
  }
  return { assignments, laneCount: laneRightEdges.length };
}

/** Stable sort events by start, then by end (events with no end last). */
export function sortEventsByStart(
  events: readonly TimelineEvent[],
  system: TimeSystem
): TimelineEvent[] {
  return [...events]
    .filter(e => isValidTimePointFor(e.start, system))
    .sort((a, b) => {
      const byStart = compareTimePoints(a.start, b.start, system);
      if (byStart !== 0) return byStart;
      if (a.end && b.end) return compareTimePoints(a.end, b.end, system);
      if (a.end) return -1;
      if (b.end) return 1;
      return 0;
    });
}
