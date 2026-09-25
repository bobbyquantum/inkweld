import { describe, it, expect } from 'bun:test';
import type { R2Bucket } from '@cloudflare/workers-types';

import { R2StorageService } from '../src/services/r2-storage.service';

/**
 * Minimal in-memory R2 bucket that pages `list()` like the real one: at most
 * `pageSize` objects per call, with `truncated` + `cursor` for the rest.
 */
function createPagingBucket(keys: string[], pageSize = 1000) {
  const store = new Map(keys.map((key) => [key, 10]));
  const listCalls: Array<{ prefix?: string; cursor?: string }> = [];

  const bucket = {
    async list(opts: { prefix?: string; cursor?: string }) {
      listCalls.push(opts);
      const matching = [...store.keys()].filter((key) => key.startsWith(opts.prefix ?? '')).sort();
      const start = opts.cursor ? Number(opts.cursor) : 0;
      const page = matching.slice(start, start + pageSize);
      const end = start + page.length;
      const truncated = end < matching.length;
      return {
        objects: page.map((key) => ({
          key,
          size: store.get(key) ?? 0,
          uploaded: new Date(0),
          httpMetadata: { contentType: 'image/png' },
        })),
        truncated,
        cursor: truncated ? String(end) : undefined,
      };
    },
    async delete(key: string) {
      store.delete(key);
    },
  };

  return { bucket: bucket as unknown as R2Bucket, store, listCalls };
}

const keysFor = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}img-${String(i).padStart(4, '0')}.png`);

describe('R2StorageService listing', () => {
  it('lists every project file across multiple pages', async () => {
    const { bucket, listCalls } = createPagingBucket(
      [...keysFor('alice/novel/', 2500), ...keysFor('alice/other/', 5)],
      1000
    );
    const service = new R2StorageService(bucket);

    const files = await service.listProjectFiles('alice', 'novel');

    expect(files).toHaveLength(2500);
    expect(files[0].filename).toBe('img-0000.png');
    expect(files[2499].filename).toBe('img-2499.png');
    expect(listCalls).toHaveLength(3);
  });

  it('makes a single call when the listing fits in one page', async () => {
    const { bucket, listCalls } = createPagingBucket(keysFor('alice/novel/', 3));
    const service = new R2StorageService(bucket);

    const files = await service.listProjectFiles('alice', 'novel');

    expect(files).toHaveLength(3);
    expect(listCalls).toHaveLength(1);
  });

  it('deletes every object in a project directory, not just the first page', async () => {
    const { bucket, store } = createPagingBucket(
      [...keysFor('alice/novel/', 1500), ...keysFor('alice/other/', 5)],
      1000
    );
    const service = new R2StorageService(bucket);

    await service.deleteProjectDirectory('alice', 'novel');

    expect([...store.keys()].filter((key) => key.startsWith('alice/novel/'))).toHaveLength(0);
    expect([...store.keys()].filter((key) => key.startsWith('alice/other/'))).toHaveLength(5);
  });
});
