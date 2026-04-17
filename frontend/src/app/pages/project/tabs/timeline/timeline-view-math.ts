/**
 * Timeline view-math helpers
 *
 * Pure functions for converting between {@link TimePoint} and screen
 * coordinates on a horizontal timeline. Kept separate so they are easy to
 * unit-test without a DOM.
 */

import {
  compareTimePoints,
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
    if (e.start.systemId === system.id) points.push(e.start);
    if (e.end?.systemId === system.id) points.push(e.end);
  }
  for (const era of eras) {
    if (era.start.systemId === system.id) points.push(era.start);
    if (era.end.systemId === system.id) points.push(era.end);
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

/** Stable sort events by start, then by end (events with no end last). */
export function sortEventsByStart(
  events: readonly TimelineEvent[],
  system: TimeSystem
): TimelineEvent[] {
  return [...events]
    .filter(e => e.start.systemId === system.id)
    .sort((a, b) => {
      const byStart = compareTimePoints(a.start, b.start, system);
      if (byStart !== 0) return byStart;
      if (a.end && b.end) return compareTimePoints(a.end, b.end, system);
      if (a.end) return -1;
      if (b.end) return 1;
      return 0;
    });
}
