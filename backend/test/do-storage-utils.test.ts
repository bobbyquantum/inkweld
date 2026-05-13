/**
 * Unit tests for do-storage-utils.ts
 *
 * These tests cover the pure storage-algorithm helpers extracted from
 * YjsProject so they can run without the Cloudflare Workers runtime.
 */
import { describe, it, expect } from 'bun:test';
import * as Y from 'yjs';
import {
  loadDocumentFromStorage,
  compactDocumentStorage,
  peekMessageType,
  docStoragePrefix,
  snapshotKey,
  updateKeyPrefix,
  shouldCompact,
  COMPACT_THRESHOLD,
  type DOStorageReader,
  type DOStorageWriter,
} from '../src/durable-objects/do-storage-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a trivial Yjs update that sets key=value in the root map. */
function makeYjsUpdate(key: string, value: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('root').set(key, value);
  return Y.encodeStateAsUpdate(doc);
}

/** Build an in-memory mock storage for testing. */
function makeStorage(initial: Record<string, number[]> = {}): {
  store: Map<string, number[]>;
  storage: DOStorageReader & DOStorageWriter;
  deleteBatches: string[][];
} {
  const store = new Map<string, number[]>(Object.entries(initial));
  const deleteBatches: string[][] = [];

  const storage: DOStorageReader & DOStorageWriter = {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async list<T>(opts: { prefix: string }): Promise<Map<string, T>> {
      const result = new Map<string, T>();
      for (const [k, v] of store) {
        if (k.startsWith(opts.prefix)) result.set(k, v as T);
      }
      return result;
    },
    async put(key: string, value: unknown): Promise<void> {
      store.set(key, value as number[]);
    },
    async transaction<T>(
      cb: (txn: {
        put: (key: string, value: unknown) => Promise<void>;
        delete: (keys: string[]) => Promise<void>;
      }) => Promise<T>
    ): Promise<T> {
      const staged = new Map(store);
      const txnPut = async (key: string, value: unknown) => {
        staged.set(key, value as number[]);
      };
      const txnDelete = async (keys: string[]) => {
        deleteBatches.push(keys);
        for (const k of keys) staged.delete(k);
      };
      const result = await cb({ put: txnPut, delete: txnDelete });
      store.clear();
      for (const [key, value] of staged) store.set(key, value);
      return result;
    },
  };

  return { store, storage, deleteBatches };
}

// ---------------------------------------------------------------------------
// docStoragePrefix / snapshotKey / updateKeyPrefix
// ---------------------------------------------------------------------------

describe('key helpers', () => {
  it('docStoragePrefix formats correctly', () => {
    expect(docStoragePrefix('alice:my-project:elements')).toBe('doc:alice:my-project:elements:');
  });

  it('snapshotKey appends "snapshot"', () => {
    const prefix = docStoragePrefix('alice:proj:doc1');
    expect(snapshotKey(prefix)).toBe('doc:alice:proj:doc1:snapshot');
  });

  it('updateKeyPrefix appends "update:"', () => {
    const prefix = docStoragePrefix('alice:proj:doc1');
    expect(updateKeyPrefix(prefix)).toBe('doc:alice:proj:doc1:update:');
  });
});

// ---------------------------------------------------------------------------
// peekMessageType
// ---------------------------------------------------------------------------

describe('peekMessageType', () => {
  it('returns -1 for string messages', () => {
    expect(peekMessageType('hello')).toBe(-1);
  });

  it('returns -1 for empty ArrayBuffer', () => {
    expect(peekMessageType(new ArrayBuffer(0))).toBe(-1);
  });

  it('returns the first byte value for SYNC (0)', () => {
    const buf = new Uint8Array([0, 1, 2]).buffer;
    expect(peekMessageType(buf)).toBe(0);
  });

  it('returns 1 for AWARENESS messages', () => {
    const buf = new Uint8Array([1, 99]).buffer;
    expect(peekMessageType(buf)).toBe(1);
  });

  it('returns the correct byte for a custom presence message type', () => {
    const buf = new Uint8Array([42]).buffer;
    expect(peekMessageType(buf)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// shouldCompact
// ---------------------------------------------------------------------------

describe('shouldCompact', () => {
  it(`returns false below threshold (${COMPACT_THRESHOLD})`, () => {
    expect(shouldCompact(COMPACT_THRESHOLD - 1)).toBe(false);
  });

  it(`returns true at threshold (${COMPACT_THRESHOLD})`, () => {
    expect(shouldCompact(COMPACT_THRESHOLD)).toBe(true);
  });

  it('returns true above threshold', () => {
    expect(shouldCompact(COMPACT_THRESHOLD + 100)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadDocumentFromStorage
// ---------------------------------------------------------------------------

describe('loadDocumentFromStorage', () => {
  it('returns an empty map and does not call update() for a brand-new document', async () => {
    const { storage } = makeStorage();
    const doc = new Y.Doc();

    const result = await loadDocumentFromStorage('alice:proj:doc1', doc, storage);

    expect(result.size).toBe(0);
    // Doc should have no content (empty map)
    expect(doc.getMap('root').size).toBe(0);
  });

  it('applies a persisted snapshot on load', async () => {
    const snapshotDoc = new Y.Doc();
    snapshotDoc.getMap('root').set('foo', 'bar');
    const snapshotBytes = Array.from(Y.encodeStateAsUpdate(snapshotDoc));

    const prefix = docStoragePrefix('alice:proj:doc1');
    const { storage } = makeStorage({ [snapshotKey(prefix)]: snapshotBytes });

    const loadedDoc = new Y.Doc();
    await loadDocumentFromStorage('alice:proj:doc1', loadedDoc, storage);

    expect(loadedDoc.getMap('root').get('foo')).toBe('bar');
  });

  it('applies incremental update keys on top of snapshot', async () => {
    const snapshotDoc = new Y.Doc();
    snapshotDoc.getMap('root').set('a', '1');
    const snapshotBytes = Array.from(Y.encodeStateAsUpdate(snapshotDoc));

    const updateDoc = new Y.Doc();
    Y.applyUpdate(updateDoc, new Uint8Array(snapshotBytes));
    updateDoc.getMap('root').set('b', '2');
    const updateBytes = Array.from(
      Y.encodeStateAsUpdate(updateDoc, Y.encodeStateVector(snapshotDoc))
    );

    const prefix = docStoragePrefix('alice:proj:doc1');
    const { storage } = makeStorage({
      [snapshotKey(prefix)]: snapshotBytes,
      [`${updateKeyPrefix(prefix)}1000`]: updateBytes,
    });

    const loadedDoc = new Y.Doc();
    await loadDocumentFromStorage('alice:proj:doc1', loadedDoc, storage);

    expect(loadedDoc.getMap('root').get('a')).toBe('1');
    expect(loadedDoc.getMap('root').get('b')).toBe('2');
  });

  it('returns the incremental update keys map so caller can compact', async () => {
    const prefix = docStoragePrefix('alice:proj:doc1');
    const update1 = Array.from(makeYjsUpdate('x', '1'));
    const update2 = Array.from(makeYjsUpdate('y', '2'));

    const { storage } = makeStorage({
      [`${updateKeyPrefix(prefix)}100`]: update1,
      [`${updateKeyPrefix(prefix)}200`]: update2,
    });

    const fakeDoc = new Y.Doc();
    const result = await loadDocumentFromStorage('alice:proj:doc1', fakeDoc, storage);

    expect(result.size).toBe(2);
    expect([...result.keys()]).toContain(`${updateKeyPrefix(prefix)}100`);
    expect([...result.keys()]).toContain(`${updateKeyPrefix(prefix)}200`);
  });

  it('rejects when storage throws (error handling is the caller responsibility)', async () => {
    const badStorage: DOStorageReader = {
      async get() {
        throw new Error('storage error');
      },
      async list() {
        throw new Error('storage error');
      },
    };

    const fakeDoc = new Y.Doc();
    await expect(loadDocumentFromStorage('alice:proj:doc1', fakeDoc, badStorage)).rejects.toThrow(
      'storage error'
    );
  });

  it('does not partially hydrate the document if listing updates fails after reading snapshot', async () => {
    const snapshotDoc = new Y.Doc();
    snapshotDoc.getMap('root').set('foo', 'bar');
    const snapshotBytes = Array.from(Y.encodeStateAsUpdate(snapshotDoc));

    const prefix = docStoragePrefix('alice:proj:doc1');
    const badStorage: DOStorageReader = {
      async get<T>(key: string): Promise<T | undefined> {
        return (key === snapshotKey(prefix) ? snapshotBytes : undefined) as T | undefined;
      },
      async list() {
        throw new Error('storage error');
      },
    };

    const loadedDoc = new Y.Doc();
    await expect(loadDocumentFromStorage('alice:proj:doc1', loadedDoc, badStorage)).rejects.toThrow(
      'storage error'
    );
    expect(loadedDoc.getMap('root').get('foo')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// compactDocumentStorage
// ---------------------------------------------------------------------------

describe('compactDocumentStorage', () => {
  it('writes a snapshot key and deletes all update keys', async () => {
    const doc = new Y.Doc();
    doc.getMap('root').set('hello', 'world');

    const prefix = docStoragePrefix('alice:proj:doc1');
    const updateKey1 = `${updateKeyPrefix(prefix)}1000`;
    const updateKey2 = `${updateKeyPrefix(prefix)}2000`;

    const { store, storage } = makeStorage({
      [updateKey1]: [1, 2, 3],
      [updateKey2]: [4, 5, 6],
    });

    const updateKeys = new Map<string, number[]>([
      [updateKey1, [1, 2, 3]],
      [updateKey2, [4, 5, 6]],
    ]);

    await compactDocumentStorage('alice:proj:doc1', doc, updateKeys, storage);

    // Snapshot should be written
    expect(store.has(snapshotKey(prefix))).toBe(true);
    const written = store.get(snapshotKey(prefix));
    expect(written).toBeDefined();
    expect(written!.length).toBeGreaterThan(0);

    // Update keys should be deleted
    expect(store.has(updateKey1)).toBe(false);
    expect(store.has(updateKey2)).toBe(false);
  });

  it('written snapshot round-trips through a Y.Doc correctly', async () => {
    const sourceDoc = new Y.Doc();
    sourceDoc.getMap('root').set('compact', 'test');

    const prefix = docStoragePrefix('alice:proj:doc1');
    const { store, storage } = makeStorage();

    await compactDocumentStorage('alice:proj:doc1', sourceDoc, new Map(), storage);

    const storedBytes = store.get(snapshotKey(prefix));
    expect(storedBytes).toBeDefined();
    const snapshotBytes = new Uint8Array(storedBytes!);
    const roundtripDoc = new Y.Doc();
    Y.applyUpdate(roundtripDoc, snapshotBytes);

    expect(roundtripDoc.getMap('root').get('compact')).toBe('test');
  });

  it('handles an empty updateKeys map (no keys to delete)', async () => {
    const doc = new Y.Doc();
    const prefix = docStoragePrefix('alice:proj:doc1');
    const { store, storage } = makeStorage();

    await compactDocumentStorage('alice:proj:doc1', doc, new Map(), storage);

    expect(store.has(snapshotKey(prefix))).toBe(true);
  });

  it('deletes update keys in batches of 128 or fewer', async () => {
    const doc = new Y.Doc();
    const prefix = docStoragePrefix('alice:proj:doc1');
    const entries = Array.from(
      { length: 300 },
      (_, index) => [`${updateKeyPrefix(prefix)}${index}`, [index]] as const
    );
    const { store, storage, deleteBatches } = makeStorage(Object.fromEntries(entries));
    const updateKeys = new Map<string, number[]>(entries.map(([key, value]) => [key, value]));

    await compactDocumentStorage('alice:proj:doc1', doc, updateKeys, storage);

    expect(deleteBatches.map((batch) => batch.length)).toEqual([128, 128, 44]);
    expect([...updateKeys.keys()].every((key) => !store.has(key))).toBe(true);
    expect(store.has(snapshotKey(prefix))).toBe(true);
  });
});
