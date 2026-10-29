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
  const deleteCalls: number[] = [];

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
    async delete(keys: string | string[]) {
      const batch = Array.isArray(keys) ? keys : [keys];
      deleteCalls.push(batch.length);
      for (const key of batch) {
        store.delete(key);
      }
    },
  };

  return { bucket: bucket as unknown as R2Bucket, store, listCalls, deleteCalls };
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
    const { bucket, store, deleteCalls } = createPagingBucket(
      [...keysFor('alice/novel/', 1500), ...keysFor('alice/other/', 5)],
      1000
    );
    const service = new R2StorageService(bucket);

    await service.deleteProjectDirectory('alice', 'novel');

    // Batched: 1500 keys in two calls, never one call per key
    expect(deleteCalls).toEqual([1000, 500]);

    expect([...store.keys()].filter((key) => key.startsWith('alice/novel/'))).toHaveLength(0);
    expect([...store.keys()].filter((key) => key.startsWith('alice/other/'))).toHaveLength(5);
  });
});

interface StoredObject {
  body: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

/**
 * In-memory bucket with object bodies and metadata, for moves. `failPut`
 * makes `put` reject for matching keys.
 */
function createObjectBucket(
  objects: Record<string, StoredObject>,
  failPut: (key: string) => boolean = () => false
) {
  const store = new Map(Object.entries(objects));
  const bucket = {
    async list(opts: { prefix?: string; cursor?: string }) {
      const keys = [...store.keys()].filter((key) => key.startsWith(opts.prefix ?? '')).sort();
      return {
        objects: keys.map((key) => ({ key, size: store.get(key)?.body.length ?? 0 })),
        truncated: false,
      };
    },
    async get(key: string) {
      const object = store.get(key);
      return object ? { ...object } : null;
    },
    async put(key: string, body: string, options: Omit<StoredObject, 'body'>) {
      if (failPut(key)) throw new Error(`put failed: ${key}`);
      store.set(key, { body, ...options });
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, store };
}

describe('R2StorageService.moveProjectDirectory', () => {
  const png = { contentType: 'image/png' };

  it('moves every object, with its metadata, to the new slug', async () => {
    const { bucket, store } = createObjectBucket({
      'alice/old/media/a.png': { body: 'A', httpMetadata: png, customMetadata: { k: 'v' } },
      'alice/old/cover.jpg': { body: 'C' },
      'alice/old-two/media/keep.png': { body: 'K' },
    });

    await new R2StorageService(bucket).moveProjectDirectory('alice', 'old', 'new');

    expect([...store.keys()].sort()).toEqual([
      'alice/new/cover.jpg',
      'alice/new/media/a.png',
      'alice/old-two/media/keep.png',
    ]);
    expect(store.get('alice/new/media/a.png')).toEqual({
      body: 'A',
      httpMetadata: png,
      customMetadata: { k: 'v' },
    });
  });

  it('clears files a project left under the new slug before moving in', async () => {
    const { bucket, store } = createObjectBucket({
      'alice/old/media/a.png': { body: 'A' },
      'alice/new/media/stale.png': { body: 'S' },
    });

    await new R2StorageService(bucket).moveProjectDirectory('alice', 'old', 'new');

    expect([...store.keys()]).toEqual(['alice/new/media/a.png']);
  });

  it('removes its partial copy and keeps the originals when a copy fails', async () => {
    const { bucket, store } = createObjectBucket(
      {
        'alice/old/media/a.png': { body: 'A' },
        'alice/old/media/b.png': { body: 'B' },
        'alice/old/media/c.png': { body: 'C' },
      },
      (key) => key === 'alice/new/media/b.png'
    );

    await expect(
      new R2StorageService(bucket).moveProjectDirectory('alice', 'old', 'new')
    ).rejects.toThrow('put failed: alice/new/media/b.png');

    expect([...store.keys()].sort()).toEqual([
      'alice/old/media/a.png',
      'alice/old/media/b.png',
      'alice/old/media/c.png',
    ]);
  });

  it('rejects slugs that would escape the project namespace', async () => {
    const { bucket } = createObjectBucket({});
    await expect(
      new R2StorageService(bucket).moveProjectDirectory('alice', 'old', '../bob')
    ).rejects.toThrow('path traversal');
  });
});
