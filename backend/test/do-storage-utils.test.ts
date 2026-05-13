/**
 * Unit tests for do-storage-utils.ts
 *
 * These tests cover the pure storage-algorithm helpers extracted from
 * YjsProject so they can run without the Cloudflare Workers runtime.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
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
  type YDocLike,
} from '../src/durable-objects/do-storage-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real Y.Doc that records every update applied to it. */
function makeDoc(): { doc: Y.Doc & YDocLike; updates: Uint8Array[] } {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => updates.push(update));
  return { doc, updates };
}

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
} {
  const store = new Map<string, number[]>(Object.entries(initial));

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
    async transaction<T>(cb: (txn: { put: typeof storage.put; delete: (keys: string[]) => Promise<void> }) => Promise<T>): Promise<T> {
      const txnPut = async (key: string, value: unknown) => { store.set(key, value as number[]); };
      const txnDelete = async (keys: string[]) => { for (const k of keys) store.delete(k); };
      return cb({ put: txnPut, delete: txnDelete });
    },
  };

  return { store, storage };
}

// ---------------------------------------------------------------------------
// docStoragePrefix / snapshotKey / updateKeyPrefix
// ---------------------------------------------------------------------------

describe('key helpers', () => {
  it('docStoragePrefix formats correctly', () => {
    expect(docStoragePrefix('alice:my-project:elements')).toBe(
      'doc:alice:my-project:elements:'
    );
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
    const applied: Uint8Array[] = [];
    const fakeDoc: YDocLike = { update: (u) => applied.push(u) };

    const result = await loadDocumentFromStorage('alice:proj:doc1', fakeDoc, storage);

    expect(result.size).toBe(0);
    expect(applied).toHaveLength(0);
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

    const fakeDoc: YDocLike = { update: () => {} };
    const result = await loadDocumentFromStorage('alice:proj:doc1', fakeDoc, storage);

    expect(result.size).toBe(2);
    expect([...result.keys()]).toContain(`${updateKeyPrefix(prefix)}100`);
    expect([...result.keys()]).toContain(`${updateKeyPrefix(prefix)}200`);
  });

  it('does not fail when storage throws — resolves with empty map', async () => {
    const badStorage: DOStorageReader = {
      async get() { throw new Error('storage error'); },
      async list() { throw new Error('storage error'); },
    };

    const fakeDoc: YDocLike = { update: () => {} };
    // Should not throw — errors are caught internally
    await expect(
      loadDocumentFromStorage('alice:proj:doc1', fakeDoc, badStorage)
    ).resolves.not.toThrow();
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
    const written = store.get(snapshotKey(prefix))!;
    expect(written.length).toBeGreaterThan(0);

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

    const snapshotBytes = new Uint8Array(store.get(snapshotKey(prefix))!);
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
});
