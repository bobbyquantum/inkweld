import { describe, expect, it } from 'vitest';

import {
  computeOverflowGroups,
  horizontalPadding,
  measuredWidth,
  sameOverflow,
  type ToolbarOverflowInput,
} from './toolbar-overflow';

/** Three 100px groups, highest priority first. */
function input(
  overrides: Partial<ToolbarOverflowInput> = {}
): ToolbarOverflowInput {
  return {
    availableWidth: 1000,
    gapPx: 4,
    priority: ['a', 'b', 'c'],
    widths: new Map([
      ['a', 100],
      ['b', 100],
      ['c', 100],
    ]),
    ...overrides,
  };
}

describe('computeOverflowGroups', () => {
  it('overflows nothing when everything fits', () => {
    expect(computeOverflowGroups(input()).size).toBe(0);
  });

  it('overflows nothing when no widths have been measured yet', () => {
    const result = computeOverflowGroups(
      input({ availableWidth: 1, widths: new Map() })
    );
    expect(result.size).toBe(0);
  });

  it('treats a zero total as unmeasured rather than as a tight fit', () => {
    const widths = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);
    expect(
      computeOverflowGroups(input({ availableWidth: 0, widths })).size
    ).toBe(0);
  });

  it('drops the lowest-priority group first', () => {
    // 300 of groups + 20 of gaps = 320; only 250 available.
    const result = computeOverflowGroups(input({ availableWidth: 250 }));
    expect([...result]).toEqual(['c']);
  });

  it('keeps dropping until the row fits', () => {
    const result = computeOverflowGroups(input({ availableWidth: 120 }));
    expect([...result].sort()).toEqual(['b', 'c']);
  });

  it('can overflow every group', () => {
    const result = computeOverflowGroups(input({ availableWidth: 10 }));
    expect([...result].sort()).toEqual(['a', 'b', 'c']);
  });

  it('accounts for the gaps between children', () => {
    // Groups alone are 300; with 5 gaps of 20 the row needs 400.
    const tight = computeOverflowGroups(
      input({ availableWidth: 350, gapPx: 20 })
    );
    expect(tight.size).toBeGreaterThan(0);

    const roomy = computeOverflowGroups(
      input({ availableWidth: 350, gapPx: 0 })
    );
    expect(roomy.size).toBe(0);
  });

  it('respects the given priority order', () => {
    const result = computeOverflowGroups(
      input({ availableWidth: 250, priority: ['c', 'b', 'a'] })
    );
    expect([...result]).toEqual(['a']);
  });

  it('ignores groups it has no width for', () => {
    const widths = new Map([['a', 300]]);
    const result = computeOverflowGroups(
      input({ availableWidth: 100, widths })
    );
    expect(result.has('a')).toBe(true);
  });

  it('handles an empty priority list', () => {
    expect(
      computeOverflowGroups(input({ priority: [], widths: new Map() })).size
    ).toBe(0);
  });

  it('is stable: recomputing with the same inputs gives the same answer', () => {
    const args = input({ availableWidth: 250 });
    expect([...computeOverflowGroups(args)]).toEqual([
      ...computeOverflowGroups(args),
    ]);
  });
});

describe('sameOverflow', () => {
  it('is true for equal sets', () => {
    expect(sameOverflow(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameOverflow(new Set(), new Set())).toBe(true);
  });

  it('is false when the contents differ', () => {
    expect(sameOverflow(new Set(['a']), new Set(['b']))).toBe(false);
    expect(sameOverflow(new Set(['a']), new Set(['a', 'b']))).toBe(false);
  });
});

describe('measuredWidth', () => {
  it('is zero for a missing element', () => {
    expect(measuredWidth(null)).toBe(0);
  });

  it('adds horizontal margins to the offset width', () => {
    const el = document.createElement('div');
    el.style.marginLeft = '5px';
    el.style.marginRight = '7px';
    document.body.append(el);

    // jsdom reports offsetWidth as 0, so this isolates the margin arithmetic.
    expect(measuredWidth(el)).toBe(12);
    el.remove();
  });
});

describe('horizontalPadding', () => {
  it('sums left and right padding', () => {
    const el = document.createElement('div');
    el.style.paddingLeft = '8px';
    el.style.paddingRight = '4px';
    document.body.append(el);

    expect(horizontalPadding(el)).toBe(12);
    el.remove();
  });

  it('is zero when no padding is set', () => {
    const el = document.createElement('div');
    document.body.append(el);
    expect(horizontalPadding(el)).toBe(0);
    el.remove();
  });
});
