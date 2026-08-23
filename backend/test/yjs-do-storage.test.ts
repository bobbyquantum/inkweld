import { describe, it, expect, mock } from 'bun:test';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
  YjsDocStorage,
  persistUpdateKey,
  partitionPersistedFrames,
  chunkKeysForDelete,
  snapshotKey,
  describeDocStorage,
  COMPACT_THRESHOLD,
  LIST_PAGE_SIZE,
  SNAPSHOT_VALUE_LIMIT,
  type DoStorage,
  type StorageLogger,
  type SnapshotDecoder,
} from '../src/durable-objects/yjs-do-storage';
import { Y_MESSAGE_SYNC, Y_MESSAGE_AWARENESS } from '../src/utils/yjs-document-utils';

/**
 * applySnapshot stand-in for tests whose storage holds no snapshot. Throwing
 * here surfaces as `hadSnapshot === false` + a corrupted-key entry, so the
 * tests' existing assertions fail loudly if the router ever misdirects.
 */
const noSnapshotExpected = (): void => {
  throw new Error('applySnapshot must not be called: storage holds no snapshot');
};

/** Build an in-memory DoStorage that records calls and honours list paging. */
function makeStorage(entries: Map<string, number[]> = new Map()): DoStorage & {
  puts: Array<{ key: string; value: unknown }>;
  deletes: string[][];
} {
  const puts: Array<{ key: string; value: unknown }> = [];
  const deletes: string[][] = [];
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return entries.get(key) as unknown as T | undefined;
    },
    async list<T>(opts: {
      prefix: string;
      limit?: number;
      startAfter?: string;
    }): Promise<Map<string, T>> {
      const keys = [...entries.keys()]
        .filter(
          (k) => k.startsWith(opts.prefix) && (opts.startAfter === undefined || k > opts.startAfter)
        )
        .sort();
      const sliced = opts.limit !== undefined ? keys.slice(0, opts.limit) : keys;
      const out = new Map<string, T>();
      for (const k of sliced) out.set(k, entries.get(k) as unknown as T);
      return out;
    },
    async put<T>(key: string, value: T): Promise<void> {
      puts.push({ key, value });
      // Mirror structured-clone-ish storage: keep the value shape as written
      // so tests can assert raw-bytes vs number[] storage.
      entries.set(key, value as unknown as number[]);
    },
    async delete(keys: string | string[]): Promise<void> {
      const arr = Array.isArray(keys) ? keys : [keys];
      deletes.push(arr);
      for (const k of arr) entries.delete(k);
    },
    puts,
    deletes,
  };
}

const noopLogger: StorageLogger = {
  debug: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
};

describe('persistUpdateKey', () => {
  it('embeds prefix, timestamp, and zero-padded sequence', () => {
    expect(persistUpdateKey('doc:foo:bar:', 1_700_000_000_000, 5)).toBe(
      'doc:foo:bar:update:1700000000000:00000005'
    );
  });

  it('is unique per sequence even at the same millisecond', () => {
    const a = persistUpdateKey('p:', 1000, 0);
    const b = persistUpdateKey('p:', 1000, 1);
    expect(a).not.toBe(b);
    expect(a).toBe('p:update:1000:00000000');
    expect(b).toBe('p:update:1000:00000001');
  });

  it('preserves lexicographic ordering of timestamps', () => {
    const older = persistUpdateKey('p:', 1, 0);
    const newer = persistUpdateKey('p:', 2, 0);
    expect(older < newer).toBe(true);
  });
});

describe('partitionPersistedFrames', () => {
  it('keeps sync frames and routes awareness frames to stale keys', () => {
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0, 1]);
    const awareness = new Uint8Array([Y_MESSAGE_AWARENESS, 1, 2]);
    const entries = new Map<string, number[]>([
      ['doc:d:update:1:00000000', Array.from(sync)],
      ['doc:d:update:1:00000001', Array.from(awareness)],
    ]);

    const { syncFrames, staleKeys } = partitionPersistedFrames(entries);
    expect(syncFrames).toHaveLength(1);
    expect(syncFrames[0]).toEqual(sync);
    expect(staleKeys).toEqual(['doc:d:update:1:00000001']);
  });

  it('returns empty arrays for an empty listing', () => {
    const { syncFrames, staleKeys } = partitionPersistedFrames(new Map());
    expect(syncFrames).toEqual([]);
    expect(staleKeys).toEqual([]);
  });

  it('preserves insertion order of sync frames', () => {
    const a = new Uint8Array([Y_MESSAGE_SYNC, 0]);
    const b = new Uint8Array([Y_MESSAGE_SYNC, 1]);
    const c = new Uint8Array([Y_MESSAGE_SYNC, 2]);
    const entries = new Map<string, number[]>([
      ['k1', Array.from(a)],
      ['k2', Array.from(b)],
      ['k3', Array.from(c)],
    ]);
    const { syncFrames } = partitionPersistedFrames(entries);
    expect(syncFrames).toEqual([a, b, c]);
  });
});

describe('chunkKeysForDelete', () => {
  it('returns no batches for an empty list', () => {
    expect(chunkKeysForDelete([])).toEqual([]);
  });

  it('returns a single batch under the limit', () => {
    expect(chunkKeysForDelete(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('chunks at the default 128-key limit', () => {
    const keys = Array.from({ length: 300 }, (_, i) => `k${i}`);
    const batches = chunkKeysForDelete(keys);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(128);
    expect(batches[1]).toHaveLength(128);
    expect(batches[2]).toHaveLength(44);
    expect(batches.flat()).toEqual(keys);
  });

  it('respects a custom batch size', () => {
    const keys = ['a', 'b', 'c', 'd', 'e'];
    const batches = chunkKeysForDelete(keys, 2);
    expect(batches).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('falls back to the default limit for a non-positive batch size (no infinite loop)', () => {
    const keys = Array.from({ length: 130 }, (_, i) => `k${i}`);
    for (const bad of [0, -1, -100]) {
      const batches = chunkKeysForDelete(keys, bad);
      expect(batches).toHaveLength(2); // 128 + 2, same as default
      expect(batches.flat()).toEqual(keys);
    }
  });
});

describe('YjsDocStorage.loadAndReplay', () => {
  it('applies sync frames in order and purges stale keys', async () => {
    const sync1 = new Uint8Array([Y_MESSAGE_SYNC, 0]);
    const sync2 = new Uint8Array([Y_MESSAGE_SYNC, 1]);
    const awareness = new Uint8Array([Y_MESSAGE_AWARENESS, 1]);
    const storage = makeStorage(
      new Map([
        ['doc:d:update:1:00000000', Array.from(sync1)],
        ['doc:d:update:1:00000001', Array.from(awareness)],
        ['doc:d:update:1:00000002', Array.from(sync2)],
      ])
    );
    const applied: Uint8Array[] = [];
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.loadAndReplay('d', {
      applyFrame: (frame) => applied.push(frame),
      applySnapshot: noSnapshotExpected,
    });

    expect(applied).toEqual([sync1, sync2]);
    expect(storage.deletes).toEqual([['doc:d:update:1:00000001']]);
    expect(result.hadSnapshot).toBe(false);
    expect(result.totalRowsRead).toBe(3);
    expect(result.incrementalKeys).toEqual(['doc:d:update:1:00000000', 'doc:d:update:1:00000002']);
    expect(result.corruptedKeys).toEqual([]);
  });

  it('skips corrupted frames and purges them without aborting the load', async () => {
    const good1 = new Uint8Array([Y_MESSAGE_SYNC, 0]);
    const good2 = new Uint8Array([Y_MESSAGE_SYNC, 1]);
    const storage = makeStorage(
      new Map([
        ['doc:d:update:1:00000000', Array.from(good1)],
        ['doc:d:update:1:00000001', Array.from(good1)],
        ['doc:d:update:1:00000002', Array.from(good2)],
      ])
    );
    const applied: Uint8Array[] = [];
    const ds = new YjsDocStorage(storage, noopLogger);

    // applyFrame throws on the second frame (simulating a corrupted sync
    // sub-type that readSyncMessage rejects with "Unknown message type").
    let callCount = 0;
    const result = await ds.loadAndReplay('d', {
      applyFrame: (frame) => {
        callCount++;
        if (callCount === 2) throw new Error('Unknown message type');
        applied.push(frame);
      },
      applySnapshot: noSnapshotExpected,
    });

    // Good frames applied; corrupted one skipped.
    expect(applied).toEqual([good1, good2]);
    expect(result.corruptedKeys).toEqual(['doc:d:update:1:00000001']);
    // Corrupted key purged alongside stale keys.
    expect(storage.deletes).toEqual([['doc:d:update:1:00000001']]);
    // incrementalKeys excludes the corrupted key.
    expect(result.incrementalKeys).toEqual(['doc:d:update:1:00000000', 'doc:d:update:1:00000002']);
  });

  it('skips a corrupted snapshot and still loads incrementals', async () => {
    const snapshot = new Uint8Array([Y_MESSAGE_SYNC, 99]);
    const incremental = new Uint8Array([Y_MESSAGE_SYNC, 0]);
    const storage = makeStorage(
      new Map([
        ['doc:d:snapshot', Array.from(snapshot)],
        ['doc:d:update:2:00000000', Array.from(incremental)],
      ])
    );
    const applied: Uint8Array[] = [];
    const ds = new YjsDocStorage(storage, noopLogger);

    // Snapshot decode throws; incremental succeeds.
    const result = await ds.loadAndReplay('d', {
      applySnapshot: () => {
        throw new Error('Unexpected end of array');
      },
      applyFrame: (frame) => applied.push(frame),
    });

    expect(applied).toEqual([incremental]);
    expect(result.hadSnapshot).toBe(false);
    expect(result.corruptedKeys).toEqual(['doc:d:snapshot']);
    expect(result.incrementalKeys).toEqual(['doc:d:update:2:00000000']);
  });

  it('does nothing when no persisted updates exist', async () => {
    const storage = makeStorage(new Map());
    const applied = mock(() => {});
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.loadAndReplay('d', {
      applyFrame: applied,
      applySnapshot: noSnapshotExpected,
    });

    expect(applied).not.toHaveBeenCalled();
    expect(storage.deletes).toHaveLength(0);
    expect(result.totalRowsRead).toBe(0);
    expect(result.hadSnapshot).toBe(false);
    expect(result.incrementalKeys).toEqual([]);
  });

  it('routes the snapshot to applySnapshot and incrementals to applyFrame, snapshot first', async () => {
    const snapshotBytes = new Uint8Array([Y_MESSAGE_SYNC, 10]);
    const incremental = new Uint8Array([Y_MESSAGE_SYNC, 20]);
    const storage = makeStorage(
      new Map([
        ['doc:d:snapshot', Array.from(snapshotBytes)],
        ['doc:d:update:2:00000000', Array.from(incremental)],
      ])
    );
    const applied: Array<{ via: 'snapshot' | 'frame'; bytes: Uint8Array }> = [];
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.loadAndReplay('d', {
      applySnapshot: (bytes) => applied.push({ via: 'snapshot', bytes }),
      applyFrame: (bytes) => applied.push({ via: 'frame', bytes }),
    });

    expect(applied).toEqual([
      { via: 'snapshot', bytes: snapshotBytes },
      { via: 'frame', bytes: incremental },
    ]);
    expect(result.hadSnapshot).toBe(true);
    expect(result.totalRowsRead).toBe(2);
    expect(result.incrementalKeys).toEqual(['doc:d:update:2:00000000']);
  });

  it('loads snapshot-only storage with zero incremental rows', async () => {
    const snapshotBytes = new Uint8Array([Y_MESSAGE_SYNC, 42]);
    const storage = makeStorage(new Map([['doc:d:snapshot', Array.from(snapshotBytes)]]));
    const applied: Uint8Array[] = [];
    const frameApplied = mock(() => {});
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.loadAndReplay('d', {
      applySnapshot: (bytes) => applied.push(bytes),
      applyFrame: frameApplied,
    });

    expect(applied).toEqual([snapshotBytes]);
    expect(frameApplied).not.toHaveBeenCalled();
    expect(result.hadSnapshot).toBe(true);
    expect(result.totalRowsRead).toBe(1);
    expect(result.incrementalKeys).toEqual([]);
  });

  it('propagates storage list failures (so the caller can retry)', async () => {
    const storage: DoStorage = {
      get: async () => undefined,
      list: async () => {
        throw new Error('storage unavailable');
      },
      put: async () => {},
      delete: async () => {},
    };
    const ds = new YjsDocStorage(storage, noopLogger);

    await expect(
      ds.loadAndReplay('d', { applyFrame: () => {}, applySnapshot: () => {} })
    ).rejects.toThrow('storage unavailable');
  });

  it('chunks the purge when stale keys exceed the 128-key delete limit', async () => {
    const entries = new Map<string, number[]>();
    // 200 stale (awareness) frames + 1 sync frame.
    for (let i = 0; i < 200; i++) {
      entries.set(`doc:d:update:1:${String(i).padStart(8, '0')}`, [Y_MESSAGE_AWARENESS, 1]);
    }
    entries.set('doc:d:update:1:00000200', [Y_MESSAGE_SYNC, 0]);
    const storage = makeStorage(entries);
    const ds = new YjsDocStorage(storage, noopLogger);

    await ds.loadAndReplay('d', { applyFrame: () => {}, applySnapshot: noSnapshotExpected });

    // 200 stale keys → 2 batches (128 + 72).
    expect(storage.deletes).toHaveLength(2);
    expect(storage.deletes[0]).toHaveLength(128);
    expect(storage.deletes[1]).toHaveLength(72);
    // Stale keys removed; the sync key remains (it was replayed, not purged).
    // Await the list() Promise — Array.from(promise) would silently yield [].
    const remaining = await storage.list({ prefix: 'doc:d:update:' });
    expect(Array.from(remaining.keys())).toHaveLength(1);
  });

  it('swallows individual delete failures and continues purging remaining batches', async () => {
    // 300 stale keys → 3 batches (128 + 128 + 44). Make the MIDDLE batch fail
    // so we prove the final batch still runs after a failed one.
    const entries = new Map<string, number[]>();
    for (let i = 0; i < 300; i++) {
      entries.set(`doc:d:update:1:${String(i).padStart(8, '0')}`, [Y_MESSAGE_AWARENESS, 1]);
    }
    const storage = makeStorage(entries);
    let call = 0;
    const originalDelete = storage.delete.bind(storage);
    storage.delete = async (keys: string | string[]) => {
      call++;
      if (call === 2) throw new Error('transient');
      return originalDelete(keys);
    };
    const warnLog = mock(() => {});
    const ds = new YjsDocStorage(storage, {
      ...noopLogger,
      warn: warnLog,
    });

    await ds.loadAndReplay('d', { applyFrame: () => {}, applySnapshot: noSnapshotExpected });

    // All 3 batches were attempted (the middle one failed but didn't abort).
    expect(call).toBe(3);
    expect(warnLog).toHaveBeenCalledTimes(1);
    // Batches 1 and 3 succeeded → 128 + 44 = 172 keys deleted; batch 2's 128
    // remain because the mock threw before delegating.
    const remaining = await storage.list({ prefix: 'doc:d:update:' });
    expect(remaining.size).toBe(128);
  });
});

describe('YjsDocStorage.persist', () => {
  it('persists sync frames under a collision-free timestamp:sequence:suffix key', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0, 1]);

    const key = await ds.persist('d', sync);

    expect(key).not.toBeNull();
    expect(storage.puts).toHaveLength(1);
    // Stored as a compact Uint8Array BLOB, NOT Array.from(frame) (which would
    // box every byte as a JS number and inflate storage ~8x).
    expect(storage.puts[0]?.value).toBeInstanceOf(Uint8Array);
    expect(storage.puts[0]?.value).toEqual(sync);
    // timestamp:zero-padded-seq:32-hex (128-bit) suffix
    expect(key).toMatch(/^doc:d:update:\d+:00000000:[0-9a-f]{32}$/);
  });

  it('increments the sequence across calls within the same millisecond', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0]);

    const a = await ds.persist('d', sync);
    const b = await ds.persist('d', sync);

    expect(a).not.toBe(b);
    expect(a).toMatch(/:00000000:[0-9a-f]{32}$/);
    expect(b).toMatch(/:00000001:[0-9a-f]{32}$/);
  });

  it('filters out awareness frames (returns null, writes nothing)', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);
    const awareness = new Uint8Array([Y_MESSAGE_AWARENESS, 1]);

    const key = await ds.persist('d', awareness);

    expect(key).toBeNull();
    expect(storage.puts).toHaveLength(0);
  });

  it('filters out presence frames (tag 100)', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);
    const presence = new Uint8Array([100, 0]);

    const key = await ds.persist('d', presence);

    expect(key).toBeNull();
    expect(storage.puts).toHaveLength(0);
  });

  it('filters out empty frames', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);

    const key = await ds.persist('d', new Uint8Array([]));

    expect(key).toBeNull();
    expect(storage.puts).toHaveLength(0);
  });

  it('produces distinct keys across instances with a reset sequence (cross-restart collision guard)', async () => {
    // Two YjsDocStorage instances represent the same DO before and after a
    // restart (sequence resets to 0). With the random suffix, two frames
    // persisted at the same millisecond + same sequence must still get
    // distinct keys.
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0]);
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const storage = makeStorage();
      const ds = new YjsDocStorage(storage, noopLogger);
      keys.add((await ds.persist('d', sync)) as string);
    }
    // 50 distinct keys despite all being seq=0.
    expect(keys.size).toBe(50);
  });

  it('logs and does not throw when storage.put rejects', async () => {
    const storage: DoStorage = {
      get: async () => undefined,
      list: async () => new Map(),
      put: async () => {
        throw new Error('disk full');
      },
      delete: async () => {},
    };
    const errorLog = mock(() => {});
    const ds = new YjsDocStorage(storage, { ...noopLogger, error: errorLog });
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0]);

    // Should not reject — the caller invokes this fire-and-forget.
    const key = await ds.persist('d', sync);

    expect(key).not.toBeNull();
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});

describe('snapshotKey', () => {
  it('appends "snapshot" to the storage prefix', () => {
    expect(snapshotKey('doc:alice:proj:')).toBe('doc:alice:proj:snapshot');
  });
});

describe('COMPACT_THRESHOLD', () => {
  it('is a positive integer', () => {
    expect(COMPACT_THRESHOLD).toBeGreaterThan(0);
    expect(Number.isInteger(COMPACT_THRESHOLD)).toBe(true);
  });
});

describe('YjsDocStorage.compact', () => {
  it('writes snapshot and deletes known update keys', async () => {
    const storage = makeStorage(
      new Map([
        ['doc:d:update:1:00000000', [Y_MESSAGE_SYNC, 0]],
        ['doc:d:update:1:00000001', [Y_MESSAGE_SYNC, 1]],
      ])
    );
    const ds = new YjsDocStorage(storage, noopLogger);
    const encoded = new Uint8Array([Y_MESSAGE_SYNC, 99]);

    const result = await ds.compact('d', encoded, [
      'doc:d:update:1:00000000',
      'doc:d:update:1:00000001',
    ]);

    expect(result).toEqual({ snapshotWritten: true, rowsDeleted: 2 });
    const snap = await storage.get<Uint8Array>('doc:d:snapshot');
    expect(snap).toEqual(encoded);
    const remaining = await storage.list({ prefix: 'doc:d:update:' });
    expect(remaining.size).toBe(0);
  });

  it('lists and deletes update keys when knownKeys is omitted', async () => {
    const storage = makeStorage(
      new Map([
        ['doc:d:update:1:00000000', [Y_MESSAGE_SYNC, 0]],
        ['doc:d:update:2:00000000', [Y_MESSAGE_SYNC, 1]],
        ['doc:d:snapshot', [Y_MESSAGE_SYNC, 50]],
      ])
    );
    const ds = new YjsDocStorage(storage, noopLogger);
    const encoded = new Uint8Array([Y_MESSAGE_SYNC, 99]);

    const result = await ds.compact('d', encoded);

    expect(result.snapshotWritten).toBe(true);
    expect(result.rowsDeleted).toBe(2);
    const snap = await storage.get<Uint8Array>('doc:d:snapshot');
    expect(snap).toEqual(encoded);
    const remaining = await storage.list({ prefix: 'doc:d:update:' });
    expect(remaining.size).toBe(0);
  });

  it('is a no-op when there are no update keys to delete', async () => {
    const storage = makeStorage(new Map());
    const ds = new YjsDocStorage(storage, noopLogger);
    const encoded = new Uint8Array([Y_MESSAGE_SYNC, 0]);

    const result = await ds.compact('d', encoded, []);

    expect(result).toEqual({ snapshotWritten: true, rowsDeleted: 0 });
    const snap = await storage.get<Uint8Array>('doc:d:snapshot');
    expect(snap).toEqual(encoded);
    expect(storage.deletes).toHaveLength(0);
  });

  it('chunks deletes when update keys exceed the 128-key limit', async () => {
    const entries = new Map<string, number[]>();
    const keys: string[] = [];
    for (let i = 0; i < 200; i++) {
      const key = `doc:d:update:1:${String(i).padStart(8, '0')}`;
      entries.set(key, [Y_MESSAGE_SYNC, 0]);
      keys.push(key);
    }
    const storage = makeStorage(entries);
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.compact('d', new Uint8Array([Y_MESSAGE_SYNC, 99]), keys);

    expect(result.rowsDeleted).toBe(200);
    expect(storage.deletes).toHaveLength(2);
    expect(storage.deletes[0]).toHaveLength(128);
    expect(storage.deletes[1]).toHaveLength(72);
  });

  it('skips snapshot write AND row deletes when state exceeds the value limit', async () => {
    const storage = makeStorage(
      new Map([
        ['doc:d:update:1:00000000', [Y_MESSAGE_SYNC, 0]],
        ['doc:d:update:1:00000001', [Y_MESSAGE_SYNC, 1]],
      ])
    );
    const ds = new YjsDocStorage(storage, noopLogger);
    // A state larger than the per-value cap must NOT be written (would throw
    // RangeError) and the rows must NOT be deleted (that would lose history).
    const oversized = new Uint8Array(SNAPSHOT_VALUE_LIMIT + 1);

    const result = await ds.compact('d', oversized, [
      'doc:d:update:1:00000000',
      'doc:d:update:1:00000001',
    ]);

    expect(result).toEqual({ snapshotWritten: false, rowsDeleted: 0 });
    expect(storage.puts).toHaveLength(0);
    expect(storage.deletes).toHaveLength(0);
    const remaining = await storage.list({ prefix: 'doc:d:update:' });
    expect(remaining.size).toBe(2);
  });

  it('survives a crash between snapshot write and key deletion (idempotent reload)', async () => {
    const sync1 = new Uint8Array([Y_MESSAGE_SYNC, 1]);
    const sync2 = new Uint8Array([Y_MESSAGE_SYNC, 2]);
    const snapshot = new Uint8Array([Y_MESSAGE_SYNC, 99]);
    const storage = makeStorage(
      new Map([
        ['doc:d:snapshot', Array.from(snapshot)],
        ['doc:d:update:1:00000000', Array.from(sync1)],
        ['doc:d:update:1:00000001', Array.from(sync2)],
      ])
    );
    const applied: Uint8Array[] = [];
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.loadAndReplay('d', {
      applySnapshot: (bytes) => applied.push(bytes),
      applyFrame: (frame) => applied.push(frame),
    });

    expect(applied).toEqual([snapshot, sync1, sync2]);
    expect(result.hadSnapshot).toBe(true);
    expect(result.incrementalKeys).toHaveLength(2);
  });
});

describe('YjsDocStorage.loadAndReplay paging', () => {
  it('pages through more rows than LIST_PAGE_SIZE without losing any', async () => {
    const entries = new Map<string, number[]>();
    const total = LIST_PAGE_SIZE + 7;
    for (let i = 0; i < total; i++) {
      entries.set(`doc:d:update:1:${String(i).padStart(8, '0')}`, [Y_MESSAGE_SYNC, i & 0xff]);
    }
    const storage = makeStorage(entries);
    const applied: Uint8Array[] = [];
    const ds = new YjsDocStorage(storage, noopLogger);

    const result = await ds.loadAndReplay('d', {
      applyFrame: (frame) => applied.push(frame),
      applySnapshot: noSnapshotExpected,
    });

    expect(applied).toHaveLength(total);
    expect(result.incrementalKeys).toHaveLength(total);
    expect(result.totalRowsRead).toBe(total);
  });
});

describe('YjsDocStorage.compact regression guard', () => {
  it('reads the existing snapshot and skips write+delete when the guard vetoes', async () => {
    const storage = makeStorage(
      new Map([
        ['doc:d:snapshot', [Y_MESSAGE_SYNC, 50]],
        ['doc:d:update:1:00000000', [Y_MESSAGE_SYNC, 0]],
      ])
    );
    const ds = new YjsDocStorage(storage, noopLogger);
    const next = new Uint8Array([Y_MESSAGE_SYNC, 1]);
    let seenExisting: Uint8Array | undefined = new Uint8Array([9, 9, 9]);
    let seenNext: Uint8Array | undefined;

    const result = await ds.compact('d', next, ['doc:d:update:1:00000000'], {
      skipCompaction: (existing, n) => {
        seenExisting = existing;
        seenNext = n;
        return true;
      },
    });

    expect(result).toEqual({
      snapshotWritten: false,
      rowsDeleted: 0,
      skippedReason: 'regression-guard',
    });
    // The guard saw the stored snapshot bytes and the state we tried to write.
    expect(seenExisting).toEqual(new Uint8Array([Y_MESSAGE_SYNC, 50]));
    expect(seenNext).toEqual(next);
    // Nothing written, nothing deleted — the existing state is retained intact.
    expect(storage.puts).toHaveLength(0);
    expect(storage.deletes).toHaveLength(0);
    expect(await storage.get('doc:d:snapshot')).toEqual([Y_MESSAGE_SYNC, 50]);
    expect((await storage.list({ prefix: 'doc:d:update:' })).size).toBe(1);
  });

  it('proceeds normally when the guard allows it', async () => {
    const storage = makeStorage(
      new Map([
        ['doc:d:snapshot', [Y_MESSAGE_SYNC, 50]],
        ['doc:d:update:1:00000000', [Y_MESSAGE_SYNC, 0]],
      ])
    );
    const ds = new YjsDocStorage(storage, noopLogger);
    const next = new Uint8Array([Y_MESSAGE_SYNC, 1]);

    const result = await ds.compact('d', next, ['doc:d:update:1:00000000'], {
      skipCompaction: () => false,
    });

    expect(result.snapshotWritten).toBe(true);
    expect(result.rowsDeleted).toBe(1);
    expect(result.skippedReason).toBeUndefined();
    expect(await storage.get('doc:d:snapshot')).toEqual(next);
  });

  it('passes undefined existing when no snapshot is stored', async () => {
    const storage = makeStorage(new Map([['doc:d:update:1:00000000', [Y_MESSAGE_SYNC, 0]]]));
    const ds = new YjsDocStorage(storage, noopLogger);
    let seenExisting: Uint8Array | undefined | 'unset' = 'unset';

    const result = await ds.compact(
      'd',
      new Uint8Array([Y_MESSAGE_SYNC, 1]),
      ['doc:d:update:1:00000000'],
      {
        skipCompaction: (existing) => {
          seenExisting = existing;
          return false;
        },
      }
    );

    expect(seenExisting).toBeUndefined();
    expect(result.snapshotWritten).toBe(true);
  });
});

describe('describeDocStorage', () => {
  // Mock decoder: last byte is the element count; 0xfe means "undecodable".
  const decode: SnapshotDecoder = (bytes) => {
    if (bytes[0] === 0xfe) throw new Error('bad frame');
    const count = bytes[bytes.length - 1];
    return { elementCount: count, topLevel: { elements: count } };
  };

  it('scans canonical + ghost prefixes and decodes each snapshot', async () => {
    const storage = makeStorage(
      new Map<string, number[]>([
        ['doc:d:snapshot', [1, 7]],
        ['doc:d:update:1:00000000', [0, 1, 2]],
        ['doc:d:update:1:00000001', [0, 1]],
        ['doc:d/:snapshot', [2, 9]],
        ['doc:d/:update:1:00000000', [0, 1, 2, 3, 4]],
      ])
    );

    const desc = await describeDocStorage(storage, 'd', decode);

    expect(desc.rawDocumentId).toBe('d');
    expect(desc.prefixesScanned).toEqual(['doc:d:', 'doc:d/:']);
    expect(desc.canonical.snapshot?.elementCount).toBe(7);
    expect(desc.canonical.snapshot?.bytes).toBe(2);
    expect(desc.canonical.snapshot?.decodeError).toBeUndefined();
    expect(desc.canonical.updateRows).toBe(2);
    expect(desc.canonical.updateBytes).toBe(5);
    expect(desc.ghost.snapshot?.elementCount).toBe(9);
    expect(desc.ghost.updateRows).toBe(1);
    expect(desc.ghost.updateBytes).toBe(5);
    expect(desc.keys).toHaveLength(5);
    expect(desc.keysTruncated).toBe(false);
  });

  it('strips a trailing slash off the raw id before deriving prefixes', async () => {
    const storage = makeStorage(new Map<string, number[]>([['doc:d:snapshot', [1, 3]]]));
    const desc = await describeDocStorage(storage, 'd/', decode);
    expect(desc.prefixesScanned).toEqual(['doc:d:', 'doc:d/:']);
    expect(desc.canonical.snapshot?.elementCount).toBe(3);
  });

  it('records a decodeError when a snapshot cannot be decoded', async () => {
    const storage = makeStorage(new Map<string, number[]>([['doc:d:snapshot', [0xfe, 0]]]));
    const desc = await describeDocStorage(storage, 'd', decode);
    expect(desc.canonical.snapshot?.elementCount).toBeNull();
    expect(desc.canonical.snapshot?.decodeError).toContain('bad frame');
  });

  it('caps the key list and flags truncation', async () => {
    const entries = new Map<string, number[]>();
    for (let i = 0; i < 10; i++) {
      entries.set(`doc:d:update:1:${String(i).padStart(8, '0')}`, [0, 1]);
    }
    const storage = makeStorage(entries);
    const desc = await describeDocStorage(storage, 'd', decode, { maxKeys: 3 });
    expect(desc.keys).toHaveLength(3);
    expect(desc.keysTruncated).toBe(true);
    expect(desc.canonical.updateRows).toBe(10);
  });

  it('is exposed as a thin wrapper on YjsDocStorage', async () => {
    const storage = makeStorage(new Map<string, number[]>([['doc:d:snapshot', [1, 4]]]));
    const ds = new YjsDocStorage(storage, noopLogger);
    const desc = await ds.describeStorage('d', decode);
    expect(desc.canonical.snapshot?.elementCount).toBe(4);
  });
});

describe('snapshot + wire-frame round trip (production format contract)', () => {
  /** Wrap a raw Yjs update as the wire frame WSSharedDoc broadcasts/persists. */
  function toWireFrame(update: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    return encoding.toUint8Array(encoder);
  }

  /**
   * Faithful replica of y-durableobjects `WSSharedDoc.update()` (which can't
   * be imported under Bun — its package entry pulls `cloudflare:workers`):
   * read the varuint message-type header, apply sync messages via
   * `readSyncMessage`, treat type 1 as an awareness payload, and silently
   * ignore any other type — exactly the production switch.
   */
  function applyWireFrame(doc: Y.Doc, frame: Uint8Array): void {
    const decoder = decoding.createDecoder(frame);
    const type = decoding.readVarUint(decoder);
    if (type === Y_MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      syncProtocol.readSyncMessage(decoder, encoder, doc, null);
    } else if (type === Y_MESSAGE_AWARENESS) {
      // Production hands this to applyAwarenessUpdate; reading the
      // length-prefixed payload is where garbage bytes overrun and throw
      // lib0's "Unexpected end of array".
      decoding.readVarUint8Array(decoder);
    }
  }

  it('replays a compacted snapshot plus later incrementals into a fresh doc', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);

    // Writer doc: capture every Yjs update exactly as the DO persists it —
    // wrapped as a wire frame by the notify stream.
    const writer = new Y.Doc();
    const frames: Uint8Array[] = [];
    writer.on('update', (u: Uint8Array) => frames.push(toWireFrame(u)));
    writer.getArray('elements').insert(0, [
      { id: 'e1', name: 'Journal', type: 'FOLDER', order: 0 },
      { id: 'e2', name: 'Entry 1', type: 'ITEM', order: 1 },
    ]);
    for (const f of frames) await ds.persist('d', f);
    frames.length = 0;

    // Compact: raw encodeStateAsUpdate, exactly like compactDocument().
    await ds.compact('d', Y.encodeStateAsUpdate(writer));

    // Post-compaction edit → persisted as an incremental wire frame.
    writer.getArray('elements').push([{ id: 'e3', name: 'Entry 2', type: 'ITEM', order: 2 }]);
    for (const f of frames) await ds.persist('d', f);

    // Reload into a fresh doc with the production appliers: raw snapshot via
    // Y.applyUpdate, wire frames via the WSSharedDoc-style handler.
    const reader = new Y.Doc();
    const result = await ds.loadAndReplay('d', {
      applySnapshot: (bytes) => Y.applyUpdate(reader, bytes),
      applyFrame: (frame) => applyWireFrame(reader, frame),
    });

    expect(result.hadSnapshot).toBe(true);
    expect(result.corruptedKeys).toEqual([]);
    expect(result.incrementalKeys).toHaveLength(1);
    expect(reader.getArray('elements').toJSON()).toEqual([
      { id: 'e1', name: 'Journal', type: 'FOLDER', order: 0 },
      { id: 'e2', name: 'Entry 1', type: 'ITEM', order: 1 },
      { id: 'e3', name: 'Entry 2', type: 'ITEM', order: 2 },
    ]);
    expect(reader.getArray('elements')).toHaveLength(3);
  });

  it('regression: a raw snapshot routed through the wire-frame handler never restores the state', () => {
    // The bug this suite guards against: the compacted snapshot is a raw
    // Y.encodeStateAsUpdate payload, so parsing it as a wire frame reads the
    // update's leading client-struct count as a message type. Depending on
    // that count it throws lib0's "Unexpected end of array" (surfacing in
    // production as "Corrupted snapshot for <id> — skipping") or falls through
    // the switch silently — either way the document reloads blank while
    // storage still holds the full, valid tree.
    const writer = new Y.Doc();
    writer.getArray('elements').insert(0, [{ id: 'e1', name: 'Journal', type: 'FOLDER' }]);
    const rawSnapshot = Y.encodeStateAsUpdate(writer);

    const reader = new Y.Doc();
    try {
      applyWireFrame(reader, rawSnapshot);
    } catch {
      // "Unexpected end of array" — the throwing variant of the same loss.
    }
    expect(reader.getArray('elements')).toHaveLength(0);
  });
});
