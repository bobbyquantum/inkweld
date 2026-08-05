import { describe, expect, it } from 'bun:test';

import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('maps all items preserving input order', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, (n) => Promise.resolve(n * 2));
    expect(result).toEqual([2, 4, 6]);
  });

  it('handles empty input', async () => {
    const result = await mapWithConcurrency([], 3, (n) => Promise.resolve(n));
    expect(result).toEqual([]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n;
    });
    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('throws for a non-positive-integer limit', async () => {
    await expect(mapWithConcurrency([1], 0, (n) => Promise.resolve(n))).rejects.toThrow(
      'Concurrency limit must be a positive integer'
    );
    await expect(mapWithConcurrency([1], 1.5, (n) => Promise.resolve(n))).rejects.toThrow();
    await expect(mapWithConcurrency([1], Number.NaN, (n) => Promise.resolve(n))).rejects.toThrow();
  });

  it('propagates mapper errors', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');
  });
});
