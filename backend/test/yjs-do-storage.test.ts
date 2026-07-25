import { describe, it, expect, mock } from 'bun:test';
import {
  YjsDocStorage,
  persistUpdateKey,
  partitionPersistedFrames,
  chunkKeysForDelete,
  type DoStorage,
  type StorageLogger,
} from '../src/durable-objects/yjs-do-storage';
import { Y_MESSAGE_SYNC, Y_MESSAGE_AWARENESS } from '../src/utils/yjs-document-utils';

/** Build an in-memory DoStorage that records calls. */
function makeStorage(entries: Map<string, number[]> = new Map()): DoStorage & {
  puts: Array<{ key: string; value: number[] }>;
  deletes: string[][];
} {
  const puts: Array<{ key: string; value: number[] }> = [];
  const deletes: string[][] = [];
  return {
    async list<T>(opts: { prefix: string }): Promise<Map<string, T>> {
      const out = new Map<string, T>();
      for (const [k, v] of entries) {
        if (k.startsWith(opts.prefix)) out.set(k, v as unknown as T);
      }
      return out;
    },
    async put<T>(key: string, value: T): Promise<void> {
      puts.push({ key, value: value as unknown as number[] });
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

    await ds.loadAndReplay('d', (frame) => applied.push(frame));

    expect(applied).toEqual([sync1, sync2]);
    expect(storage.deletes).toEqual([['doc:d:update:1:00000001']]);
  });

  it('does nothing when no persisted updates exist', async () => {
    const storage = makeStorage(new Map());
    const applied = mock(() => {});
    const ds = new YjsDocStorage(storage, noopLogger);

    await ds.loadAndReplay('d', applied);

    expect(applied).not.toHaveBeenCalled();
    expect(storage.deletes).toHaveLength(0);
  });

  it('propagates storage list failures (so the caller can retry)', async () => {
    const storage: DoStorage = {
      list: async () => {
        throw new Error('storage unavailable');
      },
      put: async () => {},
      delete: async () => {},
    };
    const ds = new YjsDocStorage(storage, noopLogger);

    await expect(ds.loadAndReplay('d', () => {})).rejects.toThrow('storage unavailable');
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

    await ds.loadAndReplay('d', () => {});

    // 200 stale keys → 2 batches (128 + 72).
    expect(storage.deletes).toHaveLength(2);
    expect(storage.deletes[0]).toHaveLength(128);
    expect(storage.deletes[1]).toHaveLength(72);
    // All stale keys removed; sync key remains (it was replayed, not purged).
    expect(Array.from(storage.list({ prefix: 'doc:d:update:' }) as unknown as Map<string, unknown>)).toHaveLength(
      0
    );
  });

  it('swallows individual delete failures and continues purging remaining batches', async () => {
    // Use 130 stale keys → 2 batches (128 + 2). Make the second batch fail so
    // the warn path is exercised while the first batch still succeeds.
    const entries = new Map<string, number[]>();
    for (let i = 0; i < 130; i++) {
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

    await ds.loadAndReplay('d', () => {});

    expect(warnLog).toHaveBeenCalledTimes(1);
    // First batch (128) was deleted; second batch failed but the call still
    // completed without throwing.
    expect(call).toBe(2);
  });
});

describe('YjsDocStorage.persist', () => {
  it('persists sync frames under a collision-free timestamp:sequence key', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0, 1]);

    const key = await ds.persist('d', sync);

    expect(key).not.toBeNull();
    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0]!.value).toEqual(Array.from(sync));
    expect(key).toMatch(/^doc:d:update:\d+:00000000$/);
  });

  it('increments the sequence across calls within the same millisecond', async () => {
    const storage = makeStorage();
    const ds = new YjsDocStorage(storage, noopLogger);
    const sync = new Uint8Array([Y_MESSAGE_SYNC, 0]);

    const a = await ds.persist('d', sync);
    const b = await ds.persist('d', sync);

    expect(a).not.toBe(b);
    expect(a).toMatch(/00000000$/);
    expect(b).toMatch(/00000001$/);
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
});