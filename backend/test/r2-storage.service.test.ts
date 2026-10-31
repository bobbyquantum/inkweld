import { describe, it, expect } from 'bun:test';
import type { R2Bucket } from '@cloudflare/workers-types';

import { R2StorageService } from '../src/services/r2-storage.service';
import { createObjectBucket } from './r2-bucket-mock';

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

describe('R2StorageService.moveProjectDirectory', () => {
  it('moves media, covers and published files with their metadata', async () => {
    const r2 = createObjectBucket();
    r2.seed('alice/novel/media/img.png', 'png', 'image/png');
    r2.seed('alice/novel/cover-1.jpg', 'jpg', 'image/jpeg');
    r2.seed('alice/novel/published/file-1', 'epub', 'application/epub+zip');
    r2.seed('alice/novel-two/media/keep.png', 'other project', 'image/png');
    const service = new R2StorageService(r2.bucket);

    await service.moveProjectDirectory('alice', 'novel', 'saga');

    expect([...r2.store.keys()].sort()).toEqual([
      'alice/novel-two/media/keep.png',
      'alice/saga/cover-1.jpg',
      'alice/saga/media/img.png',
      'alice/saga/published/file-1',
    ]);
    expect(r2.text('alice/saga/media/img.png')).toBe('png');
    expect(r2.store.get('alice/saga/cover-1.jpg')?.httpMetadata?.contentType).toBe('image/jpeg');
    expect(r2.store.get('alice/saga/published/file-1')?.customMetadata).toEqual({
      origin: 'upload',
    });
    expect(await service.readProjectFile('alice', 'saga', 'cover-1.jpg')).not.toBeNull();
  });

  it('moves every object when the listing spans several pages', async () => {
    const r2 = createObjectBucket(100);
    for (let i = 0; i < 250; i++) r2.seed(`alice/novel/media/${i}.png`, `img-${i}`);
    const service = new R2StorageService(r2.bucket);

    await service.moveProjectDirectory('alice', 'novel', 'saga');

    expect(await service.listProjectFiles('alice', 'saga')).toHaveLength(250);
    expect(await service.listProjectFiles('alice', 'novel')).toHaveLength(0);
    expect(r2.text('alice/saga/media/249.png')).toBe('img-249');
  });

  it('keeps every original when a copy fails, and a retry finishes the move', async () => {
    const r2 = createObjectBucket();
    for (let i = 0; i < 10; i++) r2.seed(`alice/novel/media/${i}.png`, `img-${i}`);
    const service = new R2StorageService(r2.bucket);

    r2.options.failPutAfter = 4;
    await expect(service.moveProjectDirectory('alice', 'novel', 'saga')).rejects.toThrow(
      'Too many subrequests'
    );
    expect(await service.listProjectFiles('alice', 'novel')).toHaveLength(10);
    const copiedFirstTime = r2.putCount();

    r2.options.failPutAfter = Infinity;
    await service.moveProjectDirectory('alice', 'novel', 'saga');

    // The retry copied only what the first attempt had not.
    expect(r2.putCount()).toBe(10);
    expect(copiedFirstTime).toBeGreaterThan(0);
    expect(await service.listProjectFiles('alice', 'saga')).toHaveLength(10);
    expect(await service.listProjectFiles('alice', 'novel')).toHaveLength(0);
  });

  it('copies again an object that changed after an earlier partial copy', async () => {
    const r2 = createObjectBucket();
    r2.seed('alice/novel/media/a.png', 'new content');
    r2.seed('alice/saga/media/a.png', 'stale copy');
    const service = new R2StorageService(r2.bucket);

    await service.moveProjectDirectory('alice', 'novel', 'saga');

    expect(r2.text('alice/saga/media/a.png')).toBe('new content');
  });

  it('completes the move when removing the originals fails', async () => {
    const r2 = createObjectBucket();
    r2.seed('alice/novel/media/a.png', 'a');
    r2.options.failDelete = true;
    const service = new R2StorageService(r2.bucket);

    await service.moveProjectDirectory('alice', 'novel', 'saga');

    expect(r2.text('alice/saga/media/a.png')).toBe('a');
  });

  it('does nothing for an empty project or an unchanged slug', async () => {
    const r2 = createObjectBucket();
    r2.seed('alice/novel/media/a.png', 'a');
    const service = new R2StorageService(r2.bucket);

    await service.moveProjectDirectory('alice', 'empty', 'saga');
    await service.moveProjectDirectory('alice', 'novel', 'novel');

    expect([...r2.store.keys()]).toEqual(['alice/novel/media/a.png']);
    expect(r2.putCount()).toBe(0);
  });

  it('rejects slugs that would escape the project namespace', async () => {
    const service = new R2StorageService(createObjectBucket().bucket);
    await expect(service.moveProjectDirectory('alice', 'novel', '../bob')).rejects.toThrow(
      'path traversal'
    );
  });
});

describe('R2StorageService.createProjectFile', () => {
  it('stores a file that is not there, with its content type', async () => {
    const r2 = createObjectBucket();
    const service = new R2StorageService(r2.bucket);

    const first = new TextEncoder().encode('first');
    expect(await service.createProjectFile('alice', 'novel', 'a.png', first, 'image/png')).toBe(
      true
    );

    const stored = await r2.bucket.head('alice/novel/a.png');
    expect(stored?.httpMetadata?.contentType).toBe('image/png');
    expect(r2.text('alice/novel/a.png')).toBe('first');
  });

  it('leaves a file that is there alone', async () => {
    const r2 = createObjectBucket();
    const service = new R2StorageService(r2.bucket);
    r2.seed('alice/novel/a.png', 'first');

    const second = new TextEncoder().encode('second');
    expect(await service.createProjectFile('alice', 'novel', 'a.png', second)).toBe(false);

    expect(r2.text('alice/novel/a.png')).toBe('first');
  });
});
