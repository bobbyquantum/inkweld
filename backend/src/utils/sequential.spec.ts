import { describe, expect, it } from 'bun:test';

import { firstResultSequential, forEachPage, forEachSequential, mapSequential } from './sequential';

describe('sequential helpers', () => {
  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  describe('forEachSequential', () => {
    it('runs one item at a time, in order', async () => {
      const log: string[] = [];
      await forEachSequential([1, 2, 3], async (n) => {
        log.push(`start ${n}`);
        await delay(n === 1 ? 10 : 1);
        log.push(`end ${n}`);
      });
      expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
    });

    it('passes the index and accepts sync callbacks and iterables', async () => {
      const seen: [string, number][] = [];
      await forEachSequential(new Set(['a', 'b']), (item, index) => {
        seen.push([item, index]);
      });
      expect(seen).toEqual([
        ['a', 0],
        ['b', 1],
      ]);
    });

    it('resolves for empty input', async () => {
      await expect(forEachSequential([], () => undefined)).resolves.toBeUndefined();
    });

    it('stops at the first rejection and propagates it', async () => {
      const calls: number[] = [];
      await expect(
        forEachSequential([1, 2, 3], (n) => {
          calls.push(n);
          if (n === 2) throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect(calls).toEqual([1, 2]);
    });
  });

  describe('mapSequential', () => {
    it('collects results in input order', async () => {
      const result = await mapSequential([3, 1, 2], async (n) => {
        await delay(n);
        return n * 2;
      });
      expect(result).toEqual([6, 2, 4]);
    });
  });

  describe('firstResultSequential', () => {
    it('returns the first defined result and skips later items', async () => {
      const calls: number[] = [];
      const result = await firstResultSequential([1, 2, 3], async (n) => {
        calls.push(n);
        return n === 2 ? 'hit' : undefined;
      });
      expect(result).toBe('hit');
      expect(calls).toEqual([1, 2]);
    });

    it('returns undefined when nothing matches', async () => {
      const result = await firstResultSequential([1, 2], () => undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('forEachPage', () => {
    it('follows the cursor until the last page', async () => {
      const pages: Record<string, { page: number[]; next: string | undefined }> = {
        first: { page: [1, 2], next: 'second' },
        second: { page: [3], next: undefined },
      };
      const requested: (string | undefined)[] = [];
      const seen: number[][] = [];
      await forEachPage(
        async (cursor: string | undefined) => {
          requested.push(cursor);
          return pages[cursor ?? 'first'];
        },
        (page) => {
          seen.push(page);
        }
      );
      expect(requested).toEqual([undefined, 'second']);
      expect(seen).toEqual([[1, 2], [3]]);
    });

    it('propagates fetch errors', async () => {
      await expect(
        forEachPage(
          () => Promise.reject(new Error('nope')),
          () => undefined
        )
      ).rejects.toThrow('nope');
    });
  });
});
