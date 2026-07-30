import { describe, it, expect } from 'bun:test';

import {
  canonicalStringify,
  planIdenticalDedupe,
  ELEMENT_BUNDLE_ARRAYS,
} from '../src/utils/yjs-element-dedupe';

describe('canonicalStringify', () => {
  it('treats object key order as irrelevant', () => {
    const a = canonicalStringify({ id: 'x', name: 'A', order: 1 });
    const b = canonicalStringify({ order: 1, id: 'x', name: 'A' });
    expect(a).toBe(b);
  });

  it('keeps array order significant', () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it('recurses into nested objects and arrays', () => {
    const a = canonicalStringify({ id: 'x', tags: [{ b: 2, a: 1 }] });
    const b = canonicalStringify({ id: 'x', tags: [{ a: 1, b: 2 }] });
    expect(a).toBe(b);
  });

  it('distinguishes differing content', () => {
    expect(canonicalStringify({ id: 'x', name: 'A' })).not.toBe(
      canonicalStringify({ id: 'x', name: 'B' })
    );
  });
});

describe('planIdenticalDedupe', () => {
  it('returns an empty plan when there are no duplicates', () => {
    const plan = planIdenticalDedupe([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(plan).toEqual({ deleteIndices: [], collapsedIds: [], conflictingIds: [] });
  });

  it('collapses content-identical duplicates, keeping the first occurrence', () => {
    // The double-seed case: same element twice, key order may differ between
    // the two CRDT-merged copies — must still be recognised as identical.
    const rows = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { name: 'A', id: 'a' }, // identical content, different key order
      { id: 'b', name: 'B' },
    ];
    const plan = planIdenticalDedupe(rows);
    expect(plan.collapsedIds.sort()).toEqual(['a', 'b']);
    expect(plan.conflictingIds).toEqual([]);
    // Keeps index 0 and 1, deletes the duplicate extras at 2 and 3.
    expect(plan.deleteIndices.sort((x, y) => x - y)).toEqual([2, 3]);
  });

  it('reports but never deletes differing-content duplicates', () => {
    const rows = [
      { id: 'a', name: 'edited-on-laptop' },
      { id: 'a', name: 'edited-on-phone' },
    ];
    const plan = planIdenticalDedupe(rows);
    expect(plan.conflictingIds).toEqual(['a']);
    expect(plan.collapsedIds).toEqual([]);
    expect(plan.deleteIndices).toEqual([]);
  });

  it('handles a mix of identical and conflicting groups independently', () => {
    const rows = [
      { id: 'a', n: 1 },
      { id: 'a', n: 1 }, // identical → collapse
      { id: 'b', n: 1 },
      { id: 'b', n: 2 }, // conflicting → keep both
    ];
    const plan = planIdenticalDedupe(rows);
    expect(plan.collapsedIds).toEqual(['a']);
    expect(plan.conflictingIds).toEqual(['b']);
    expect(plan.deleteIndices).toEqual([1]);
  });

  it('skips rows without a usable string id (never deletes them)', () => {
    const rows = [{ id: 'a' }, null, { nope: true }, { id: 'a' }];
    const plan = planIdenticalDedupe(rows);
    expect(plan.collapsedIds).toEqual(['a']);
    expect(plan.deleteIndices).toEqual([3]);
  });

  it('collapses tripled rows down to one (deletes two extras)', () => {
    const rows = [{ id: 'a' }, { id: 'a' }, { id: 'a' }];
    const plan = planIdenticalDedupe(rows);
    expect(plan.deleteIndices.sort((x, y) => x - y)).toEqual([1, 2]);
    expect(plan.collapsedIds).toEqual(['a']);
  });
});

describe('ELEMENT_BUNDLE_ARRAYS', () => {
  it('includes the elements tree and every id-bearing top-level array', () => {
    expect(ELEMENT_BUNDLE_ARRAYS).toContain('elements');
    expect(ELEMENT_BUNDLE_ARRAYS).toContain('relationships');
    expect(ELEMENT_BUNDLE_ARRAYS).toContain('publishPlans');
    // projectMeta is a Y.Map, not an id-array — must NOT be in the bundle.
    expect(ELEMENT_BUNDLE_ARRAYS).not.toContain('projectMeta');
  });
});
