import { GREGORIAN_SYSTEM, type TimePoint } from '@models/time-system';
import type { TimelineEra, TimelineEvent } from '@models/timeline.model';
import { describe, expect, it } from 'vitest';

import {
  computeDefaultBounds,
  computeTickMarks,
  panBounds,
  sortEventsByStart,
  tickToX,
  type TimelineBounds,
  xToTick,
  zoomBounds,
} from './timeline-view-math';

const SYS = GREGORIAN_SYSTEM;

function tp(units: string[]): TimePoint {
  return { systemId: SYS.id, units };
}

function evt(
  id: string,
  startUnits: string[],
  endUnits?: string[]
): TimelineEvent {
  return {
    id,
    trackId: 'track-1',
    start: tp(startUnits),
    end: endUnits ? tp(endUnits) : undefined,
    title: id,
  };
}

function era(
  id: string,
  startUnits: string[],
  endUnits: string[]
): TimelineEra {
  return {
    id,
    name: id,
    start: tp(startUnits),
    end: tp(endUnits),
    color: '#fff',
  };
}

describe('timeline-view-math', () => {
  // ─── computeDefaultBounds ───────────────────────────────────────────

  describe('computeDefaultBounds', () => {
    it('returns [0,100] when there are no events or eras', () => {
      const b = computeDefaultBounds(SYS, [], []);
      expect(b.minTick).toBe(0n);
      expect(b.maxTick).toBe(100n);
    });

    it('pads 10% on each side around events', () => {
      // Two events spread apart so we get a meaningful range
      const events = [evt('e1', ['1', '1', '1']), evt('e2', ['2', '1', '1'])];
      const b = computeDefaultBounds(SYS, events, []);
      // The bounds should extend beyond the raw min/max of events
      const rawMin = 391n; // 1y + 1m + 1d in simplified Gregorian
      expect(b.minTick).toBeLessThan(rawMin);
    });

    it('handles a single-point event (min === max)', () => {
      const events = [evt('e1', ['1', '1', '1'])];
      const b = computeDefaultBounds(SYS, events, []);
      // When min === max the function bumps max to min+1, then pads
      expect(b.maxTick).toBeGreaterThan(b.minTick);
    });

    it('includes era boundaries in bounds', () => {
      const eras = [era('era1', ['1', '1', '1'], ['10', '1', '1'])];
      const b = computeDefaultBounds(SYS, [], eras);
      expect(b.minTick).toBeLessThan(391n);
      expect(b.maxTick).toBeGreaterThan(0n);
    });

    it('ignores events/eras from a different system', () => {
      const otherEvent: TimelineEvent = {
        id: 'x',
        trackId: 't',
        start: { systemId: 'other', units: ['5'] },
        title: 'x',
      };
      const b = computeDefaultBounds(SYS, [otherEvent], []);
      expect(b).toEqual({ minTick: 0n, maxTick: 100n });
    });
  });

  // ─── tickToX / xToTick ─────────────────────────────────────────────

  describe('tickToX', () => {
    const bounds: TimelineBounds = { minTick: 0n, maxTick: 100n };

    it('maps minTick to 0', () => {
      expect(tickToX(0n, bounds, 500)).toBe(0);
    });

    it('maps maxTick to width', () => {
      expect(tickToX(100n, bounds, 500)).toBe(500);
    });

    it('maps midpoint to half width', () => {
      expect(tickToX(50n, bounds, 500)).toBe(250);
    });

    it('returns 0 when span is zero', () => {
      const collapsed: TimelineBounds = { minTick: 5n, maxTick: 5n };
      expect(tickToX(5n, collapsed, 500)).toBe(0);
    });
  });

  describe('xToTick', () => {
    const bounds: TimelineBounds = { minTick: 0n, maxTick: 100n };

    it('maps x=0 to minTick', () => {
      expect(xToTick(0, bounds, 500)).toBe(0n);
    });

    it('maps x=width to maxTick', () => {
      expect(xToTick(500, bounds, 500)).toBe(100n);
    });

    it('maps midpoint x to midpoint tick', () => {
      expect(xToTick(250, bounds, 500)).toBe(50n);
    });

    it('returns minTick when width is 0', () => {
      expect(xToTick(100, bounds, 0)).toBe(0n);
    });

    it('round-trips with tickToX', () => {
      const tick = 37n;
      const x = tickToX(tick, bounds, 1000);
      expect(xToTick(x, bounds, 1000)).toBe(tick);
    });
  });

  // ─── zoomBounds ────────────────────────────────────────────────────

  describe('zoomBounds', () => {
    const bounds: TimelineBounds = { minTick: 0n, maxTick: 100n };

    it('zooming in (factor < 1) narrows the span', () => {
      const zoomed = zoomBounds(bounds, 0.5, 0.5);
      const newSpan = zoomed.maxTick - zoomed.minTick;
      expect(newSpan).toBeLessThan(100n);
    });

    it('zooming out (factor > 1) widens the span', () => {
      const zoomed = zoomBounds(bounds, 2, 0.5);
      const newSpan = zoomed.maxTick - zoomed.minTick;
      expect(newSpan).toBeGreaterThan(100n);
    });

    it('pivot at 0 zooms from the left edge', () => {
      const zoomed = zoomBounds(bounds, 0.5, 0);
      expect(zoomed.minTick).toBe(0n);
      expect(zoomed.maxTick).toBe(50n);
    });

    it('pivot at 1 zooms from the right edge', () => {
      const zoomed = zoomBounds(bounds, 0.5, 1);
      expect(zoomed.minTick).toBe(50n);
      expect(zoomed.maxTick).toBe(100n);
    });

    it('enforces minimum span of 1', () => {
      const zoomed = zoomBounds(bounds, 0, 0.5);
      expect(zoomed.maxTick - zoomed.minTick).toBeGreaterThanOrEqual(1n);
    });
  });

  // ─── panBounds ─────────────────────────────────────────────────────

  describe('panBounds', () => {
    const bounds: TimelineBounds = { minTick: 0n, maxTick: 100n };

    it('panning right shifts bounds left (negative delta inverts)', () => {
      const panned = panBounds(bounds, -50, 500);
      expect(panned.minTick).toBeGreaterThan(0n);
      expect(panned.maxTick).toBeGreaterThan(100n);
    });

    it('panning left shifts bounds right', () => {
      const panned = panBounds(bounds, 50, 500);
      expect(panned.minTick).toBeLessThan(0n);
      expect(panned.maxTick).toBeLessThan(100n);
    });

    it('preserves span', () => {
      const panned = panBounds(bounds, 100, 500);
      const span = panned.maxTick - panned.minTick;
      expect(span).toBe(100n);
    });

    it('returns original bounds when width is 0', () => {
      expect(panBounds(bounds, 100, 0)).toEqual(bounds);
    });
  });

  // ─── computeTickMarks ─────────────────────────────────────────────

  describe('computeTickMarks', () => {
    it('returns empty for zero-span bounds', () => {
      expect(computeTickMarks({ minTick: 5n, maxTick: 5n }, 10)).toEqual([]);
    });

    it('produces marks within bounds', () => {
      const bounds: TimelineBounds = { minTick: 0n, maxTick: 100n };
      const marks = computeTickMarks(bounds, 10);
      expect(marks.length).toBeGreaterThan(0);
      for (const m of marks) {
        expect(m).toBeGreaterThanOrEqual(0n);
        expect(m).toBeLessThanOrEqual(100n);
      }
    });

    it('respects targetCount approximately', () => {
      const bounds: TimelineBounds = { minTick: 0n, maxTick: 1000n };
      const marks = computeTickMarks(bounds, 10);
      // Should be in a reasonable range (within ~3x of target)
      expect(marks.length).toBeGreaterThan(3);
      expect(marks.length).toBeLessThan(30);
    });

    it('handles negative bounds', () => {
      const bounds: TimelineBounds = { minTick: -50n, maxTick: 50n };
      const marks = computeTickMarks(bounds, 10);
      expect(marks.length).toBeGreaterThan(0);
      expect(marks.some(m => m < 0n)).toBe(true);
      expect(marks.some(m => m >= 0n)).toBe(true);
    });

    it('does not exceed guard limit of 500 marks', () => {
      const bounds: TimelineBounds = { minTick: 0n, maxTick: 1000000n };
      const marks = computeTickMarks(bounds, 1000000);
      expect(marks.length).toBeLessThanOrEqual(501);
    });
  });

  // ─── sortEventsByStart ─────────────────────────────────────────────

  describe('sortEventsByStart', () => {
    it('sorts events by start time', () => {
      const events = [
        evt('b', ['1', '1', '2']),
        evt('a', ['1', '1', '1']),
        evt('c', ['2', '1', '1']),
      ];
      const sorted = sortEventsByStart(events, SYS);
      expect(sorted.map(e => e.id)).toEqual(['a', 'b', 'c']);
    });

    it('filters out events from other systems', () => {
      const otherEvent: TimelineEvent = {
        id: 'other',
        trackId: 't',
        start: { systemId: 'other-sys', units: ['1'] },
        title: 'other',
      };
      const events = [evt('a', ['1', '1', '1']), otherEvent];
      const sorted = sortEventsByStart(events, SYS);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe('a');
    });

    it('sorts by end when starts are equal', () => {
      const events = [
        evt('long', ['1', '1', '1'], ['5', '1', '1']),
        evt('short', ['1', '1', '1'], ['2', '1', '1']),
      ];
      const sorted = sortEventsByStart(events, SYS);
      expect(sorted[0].id).toBe('short');
      expect(sorted[1].id).toBe('long');
    });

    it('ranks events with end before those without when starts equal', () => {
      const events = [
        evt('no-end', ['1', '1', '1']),
        evt('has-end', ['1', '1', '1'], ['2', '1', '1']),
      ];
      const sorted = sortEventsByStart(events, SYS);
      expect(sorted[0].id).toBe('has-end');
      expect(sorted[1].id).toBe('no-end');
    });

    it('returns empty array for no events', () => {
      expect(sortEventsByStart([], SYS)).toEqual([]);
    });
  });
});
