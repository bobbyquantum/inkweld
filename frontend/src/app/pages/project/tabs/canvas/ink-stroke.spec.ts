import { describe, expect, it } from 'vitest';

import {
  buildInkOutline,
  buildPathData,
  normalizeToOrigin,
  pickAt,
  rawWidthFactor,
  refineByValue,
  roundCoords,
  sampleWidthFactor,
  simplifyIndices,
  simplifyPath,
} from './ink-stroke';

/** Pull [x, y] pairs out of a flat coordinate array. */
function pairs(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < flat.length - 1; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

describe('simplifyIndices', () => {
  it('returns every index for short paths', () => {
    expect(simplifyIndices([0, 0, 1, 1], 5)).toEqual([0, 1]);
    expect(simplifyIndices([], 5)).toEqual([]);
  });

  it('returns every index when epsilon is zero', () => {
    expect(simplifyIndices([0, 0, 1, 0.4, 2, 0], 0)).toEqual([0, 1, 2]);
  });

  it('drops points that lie within epsilon of the chord', () => {
    // A straight line with a tiny wobble in the middle.
    const points = [0, 0, 5, 0.1, 10, 0];
    expect(simplifyIndices(points, 1)).toEqual([0, 2]);
  });

  it('keeps points that deviate beyond epsilon', () => {
    const points = [0, 0, 5, 4, 10, 0];
    expect(simplifyIndices(points, 1)).toEqual([0, 1, 2]);
  });

  it('always keeps the first and last point', () => {
    const points = [0, 0, 1, 0, 2, 0, 3, 0, 4, 0];
    const indices = simplifyIndices(points, 2);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(4);
  });

  it('handles very long strokes without overflowing the stack', () => {
    const points: number[] = [];
    for (let i = 0; i < 60000; i++) points.push(i, Math.sin(i / 50) * 40);
    expect(() => simplifyIndices(points, 0.5)).not.toThrow();
    expect(simplifyIndices(points, 0.5).length).toBeLessThan(60000);
  });

  it('simplifyPath maps indices back to coordinates', () => {
    expect(simplifyPath([0, 0, 5, 0.1, 10, 0], 1)).toEqual([0, 0, 10, 0]);
  });
});

describe('pickAt', () => {
  it('selects parallel values by index', () => {
    expect(pickAt([1, 2, 3, 4], [0, 2])).toEqual([1, 3]);
  });

  it('drops out-of-range indices', () => {
    expect(pickAt([1, 2], [0, 9])).toEqual([1]);
  });
});

describe('refineByValue', () => {
  it('passes through when fewer than two points are kept', () => {
    expect(refineByValue([0], [1, 2, 3], 0.1)).toEqual([0]);
  });

  it('passes through when the tolerance is disabled', () => {
    expect(refineByValue([0, 4], [1, 1, 0, 1, 1], 0)).toEqual([0, 4]);
  });

  it('keeps a straight run when the signal is linear', () => {
    expect(refineByValue([0, 4], [0, 0.25, 0.5, 0.75, 1], 0.1)).toEqual([0, 4]);
  });

  it('restores the peak of a swelling signal', () => {
    const refined = refineByValue([0, 4], [0.2, 0.5, 1, 0.5, 0.2], 0.1);
    expect(refined).toContain(2);
    expect(refined[0]).toBe(0);
    expect(refined.at(-1)).toBe(4);
  });

  it('recurses into both halves', () => {
    const values = [0, 1, 0, 1, 0, 1, 0];
    const refined = refineByValue([0, 6], values, 0.1);
    expect(refined.length).toBeGreaterThan(3);
    expect(refined).toEqual([...refined].sort((a, b) => a - b));
  });

  it('never drops an index that was already kept', () => {
    const refined = refineByValue([0, 2, 5], [0, 0, 0, 0, 0, 0], 0.1);
    expect(refined).toEqual([0, 2, 5]);
  });
});

describe('roundCoords', () => {
  it('rounds to two decimals by default', () => {
    expect(roundCoords([1.23456, 9.87654])).toEqual([1.23, 9.88]);
  });

  it('honours an explicit precision', () => {
    expect(roundCoords([1.23456], 3)).toEqual([1.235]);
  });
});

describe('normalizeToOrigin', () => {
  it('moves the bounding box to the origin and reports the offset', () => {
    const result = normalizeToOrigin([100, 50, 110, 70]);
    expect(result.offsetX).toBe(100);
    expect(result.offsetY).toBe(50);
    expect(result.points).toEqual([0, 0, 10, 20]);
  });

  it('passes through degenerate input', () => {
    expect(normalizeToOrigin([])).toEqual({
      points: [],
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe('rawWidthFactor', () => {
  it('uses stylus pressure directly', () => {
    expect(rawWidthFactor(0.42, 'pen', 0)).toBeCloseTo(0.42, 6);
  });

  it('falls back to speed for mouse input', () => {
    expect(rawWidthFactor(0.5, 'mouse', 0)).toBe(1);
    expect(rawWidthFactor(0.5, 'mouse', 100)).toBeCloseTo(0.35, 6);
  });

  it('ignores a zero pressure reading from a pen', () => {
    expect(rawWidthFactor(0, 'pen', 0)).toBe(1);
  });

  it('clamps into the usable range', () => {
    expect(rawWidthFactor(9, 'pen', 0)).toBe(1);
    expect(rawWidthFactor(0.001, 'pen', 0)).toBe(0.05);
  });
});

describe('sampleWidthFactor', () => {
  it('follows stylus pressure for pen input', () => {
    const heavy = sampleWidthFactor(1, 'pen', 0, 1);
    const light = sampleWidthFactor(0.1, 'pen', 0, 0.1);
    expect(heavy).toBeGreaterThan(light);
  });

  it('thins the stroke as mouse speed rises', () => {
    const slow = sampleWidthFactor(0.5, 'mouse', 0, 1);
    const fast = sampleWidthFactor(0.5, 'mouse', 10, 1);
    expect(fast).toBeLessThan(slow);
  });

  it('stays within 0 and 1', () => {
    expect(sampleWidthFactor(5, 'pen', 0, 1)).toBeLessThanOrEqual(1);
    expect(sampleWidthFactor(0, 'mouse', 1000, 0)).toBeGreaterThan(0);
  });

  it('smooths towards the previous value', () => {
    const jump = sampleWidthFactor(1, 'pen', 0, 0);
    expect(jump).toBeLessThan(1);
    expect(jump).toBeGreaterThan(0);
  });
});

describe('buildInkOutline', () => {
  it('returns an empty outline for no points', () => {
    expect(buildInkOutline([], [], 4)).toEqual([]);
  });

  it('produces a closed dot for a single point', () => {
    const outline = buildInkOutline([10, 10], [1], 4);
    const pts = pairs(outline);
    expect(pts.length).toBeGreaterThan(8);
    for (const [x, y] of pts) {
      expect(Math.hypot(x - 10, y - 10)).toBeCloseTo(2, 5);
    }
  });

  it('wraps a horizontal stroke at half the stroke width', () => {
    const outline = buildInkOutline([0, 0, 10, 0, 20, 0], [1, 1, 1], 4);
    const ys = pairs(outline).map(([, y]) => y);
    expect(Math.max(...ys)).toBeCloseTo(2, 5);
    expect(Math.min(...ys)).toBeCloseTo(-2, 5);
  });

  it('narrows where the width factor is smaller', () => {
    const outline = buildInkOutline([0, 0, 10, 0, 20, 0], [1, 0.3, 1], 10);
    const middle = pairs(outline).filter(([x]) => Math.abs(x - 10) < 0.001);
    expect(middle.length).toBeGreaterThan(0);
    for (const [, y] of middle) {
      expect(Math.abs(y)).toBeLessThan(5);
    }
  });

  it('never collapses to zero width', () => {
    const outline = buildInkOutline([0, 0, 10, 0], [0, 0], 8);
    const ys = pairs(outline).map(([, y]) => Math.abs(y));
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });

  it('survives duplicate points', () => {
    const outline = buildInkOutline([5, 5, 5, 5, 5, 5], [1, 1, 1], 4);
    expect(outline.length).toBeGreaterThan(0);
    expect(outline.every(Number.isFinite)).toBe(true);
  });

  it('produces finite geometry for a curved stroke', () => {
    const points: number[] = [];
    const factors: number[] = [];
    for (let i = 0; i < 40; i++) {
      points.push(i * 3, Math.sin(i / 4) * 20);
      factors.push(0.4 + (i % 5) / 10);
    }
    const outline = buildInkOutline(points, factors, 6);
    expect(outline.every(Number.isFinite)).toBe(true);
    expect(outline.length).toBeGreaterThan(points.length);
  });
});

describe('buildPathData', () => {
  it('returns an empty string for degenerate input', () => {
    expect(buildPathData([1, 2], 0, false)).toBe('');
  });

  it('emits straight segments when tension is zero', () => {
    expect(buildPathData([0, 0, 10, 0, 10, 10], 0, false)).toBe(
      'M 0,0 L 10,0 L 10,10'
    );
  });

  it('closes the path when asked', () => {
    expect(buildPathData([0, 0, 10, 0, 10, 10], 0, true)).toBe(
      'M 0,0 L 10,0 L 10,10 Z'
    );
  });

  it('emits cubic curves when tension is applied', () => {
    const d = buildPathData([0, 0, 10, 10, 20, 0], 0.5, false);
    expect(d.startsWith('M 0,0')).toBe(true);
    expect(d).toContain('C ');
    expect(d).toContain('20,0');
  });

  it('falls back to straight segments for two points even with tension', () => {
    expect(buildPathData([0, 0, 10, 0], 0.5, false)).toBe('M 0,0 L 10,0');
  });

  it('handles coincident points without emitting NaN', () => {
    const d = buildPathData([0, 0, 0, 0, 10, 10], 0.5, false);
    expect(d).not.toContain('NaN');
  });
});
