import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as Y from 'yjs';
import { Level } from 'level';
import { getLevelUpdatesKeys, keyEncoding } from 'y-leveldb';

import { config } from '../config/env';
import { fileStorageService } from './file-storage.service';
import { LEVELDB_COMPACT_THRESHOLD, YjsService } from './yjs.service';

// Mirror of y-leveldb's internal valueEncoding (not exported by the package):
// values pass through untouched as Buffers.
const yValueEncoding = {
  buffer: true,
  type: 'y-value',
  encode: (data: Uint8Array): Uint8Array => data,
  decode: (data: Uint8Array): Uint8Array => data,
};

// The singleton FileStorageService captures config.dataPath at construction,
// so retargeting config alone is not enough — patch the captured basePath too.
let tempRoot = '';
const originalDataPath = config.dataPath;

const USERNAME = 'quotatest';
const SLUG = 'proj';
const PROJECT_KEY = `${USERNAME}:${SLUG}`;

/** Typed view of the internals we need to drive/assert in these tests. */
interface ServiceInternals {
  persistences: Map<
    string,
    {
      getYDoc(docName: string): Promise<Y.Doc>;
      storeUpdate(docName: string, update: Uint8Array): Promise<unknown>;
      flushDocument(docName: string): Promise<void>;
      destroy(): Promise<void>;
    }
  >;
  pendingSinceCompact: Map<string, number>;
}

function internalsOf(service: YjsService): ServiceInternals {
  return service as unknown as ServiceInternals;
}

/**
 * Settlement tracking wrapped around the real persistence so tests can await
 * the service's fire-and-forget write/compaction queues deterministically.
 */
interface FlushProbe {
  wrapped: ServiceInternals['persistences'] extends Map<string, infer P> ? P : never;
  inFlightStores(): number;
  inFlightFlushes(): number;
  /** Flush invocations started (counted on entry, failures included). */
  attemptedFlushes(): number;
  /** Flush invocations that have settled (success or failure). */
  settledFlushes(): number;
}

function installFlushProbe(
  service: YjsService,
  projectKey: string,
  opts?: { failFlushes?: () => boolean }
): FlushProbe {
  const internals = internalsOf(service);
  const real = internals.persistences.get(projectKey);
  if (!real) throw new Error(`No persistence installed for ${projectKey}`);
  const state = { stores: 0, inFlight: 0, attempts: 0, settled: 0 };
  const wrapped = {
    getYDoc: (docName: string) => real.getYDoc(docName),
    storeUpdate: async (docName: string, update: Uint8Array) => {
      state.stores++;
      try {
        return await real.storeUpdate(docName, update);
      } finally {
        state.stores--;
      }
    },
    flushDocument: async (docName: string) => {
      state.attempts++;
      state.inFlight++;
      try {
        if (opts?.failFlushes?.()) throw new Error('simulated flush failure');
        return await real.flushDocument(docName);
      } finally {
        state.inFlight--;
        state.settled++;
      }
    },
    destroy: () => real.destroy(),
  };
  internals.persistences.set(projectKey, wrapped);
  return {
    wrapped,
    inFlightStores: () => state.stores,
    inFlightFlushes: () => state.inFlight,
    attemptedFlushes: () => state.attempts,
    settledFlushes: () => state.settled,
  };
}

const dbPath = () => path.join(tempRoot, USERNAME, SLUG, '.yjs');

/** Count the incremental update rows persisted for a document. */
async function countUpdateRows(documentId: string): Promise<number> {
  // Requires the service to have released its LevelDB lock (call cleanup first).
  const db = new Level(dbPath(), { valueEncoding: yValueEncoding, keyEncoding });
  try {
    const keys = await getLevelUpdatesKeys(db, documentId);
    return keys.length;
  } finally {
    await db.close();
  }
}

/**
 * Wait until every storeUpdate issued so far has settled and any flushed
 * compaction attempts have finished — i.e. the queues behind the service's
 * fire-and-forget persist path have fully drained.
 */
async function awaitWriteSettled(probe: FlushProbe, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (probe.inFlightStores() === 0 && probe.inFlightFlushes() === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for persistence writes to settle');
}

/** Apply N locally-generated updates through the live persistence path. */
async function applyUpdates(
  service: YjsService,
  documentId: string,
  count: number
): Promise<{ sharedDoc: { doc: Y.Doc }; initialState: string }> {
  const sharedDoc = await service.getDocument(documentId);
  sharedDoc.doc.getArray('elements').insert(0, [{ id: 'seed', name: 'Seed', type: 'ITEM' }]);
  const initialState = JSON.stringify(sharedDoc.doc.getArray('elements').toJSON());
  for (let i = 0; i < count; i++) {
    sharedDoc.doc.getMap('scratch').set(`key-${i}`, i);
  }
  return { sharedDoc, initialState };
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'inkweld-yjs-compaction-'));
  config.dataPath = tempRoot;
  (fileStorageService as unknown as { basePath: string }).basePath = tempRoot;
});

afterEach(async () => {
  config.dataPath = originalDataPath;
  (fileStorageService as unknown as { basePath: string }).basePath = originalDataPath;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('LEVELDB_COMPACT_THRESHOLD', () => {
  it('matches the Durable Object compaction cadence', () => {
    expect(LEVELDB_COMPACT_THRESHOLD).toBe(50);
  });
});

describe('YjsService live-path LevelDB compaction', () => {
  it('collapses incremental rows into a single merged row at the threshold', async () => {
    const service = new YjsService();
    const documentId = `${USERNAME}:${SLUG}:elements/`;
    await service.getDocument(documentId); // creates the project persistence
    const probe = installFlushProbe(service, PROJECT_KEY);

    await applyUpdates(service, documentId, LEVELDB_COMPACT_THRESHOLD + 5);
    await awaitWriteSettled(probe);
    expect(probe.settledFlushes()).toBeGreaterThanOrEqual(1);

    await service.cleanup();
    const rows = await countUpdateRows(documentId);
    // One merged update row (the snapshot-equivalent written by flushDocument).
    expect(rows).toBe(1);
    // Counter bookkeeping is torn down with the doc.
    expect(internalsOf(service).pendingSinceCompact.size).toBe(0);
  }, 20000);

  it('preserves document state across compaction and reload', async () => {
    const service = new YjsService();
    const documentId = `${USERNAME}:${SLUG}:elements/`;
    await service.getDocument(documentId);
    const probe = installFlushProbe(service, PROJECT_KEY);

    const { sharedDoc, initialState } = await applyUpdates(
      service,
      documentId,
      LEVELDB_COMPACT_THRESHOLD + 3
    );
    const stateVectorBefore = Array.from(Y.encodeStateVector(sharedDoc.doc));

    await awaitWriteSettled(probe);
    expect(probe.settledFlushes()).toBeGreaterThanOrEqual(1);
    await service.cleanup();

    const reloaded = new YjsService();
    const restored = await reloaded.getDocument(documentId);
    const restoredState = JSON.stringify(restored.doc.getArray('elements').toJSON());

    // CRDT replay of the merged row reproduces identical content and clocks.
    expect(restoredState).toBe(initialState);
    expect(Array.from(Y.encodeStateVector(restored.doc))).toEqual(stateVectorBefore);

    await reloaded.cleanup();
  }, 20000);

  it('leaves individual update rows in place below the threshold', async () => {
    const service = new YjsService();
    const documentId = `${USERNAME}:${SLUG}:elements/`;
    await service.getDocument(documentId);
    const probe = installFlushProbe(service, PROJECT_KEY);

    // Total transactions = seed insert + `count` map writes; keep them
    // strictly below the compaction threshold.
    const totalTransactions = LEVELDB_COMPACT_THRESHOLD - 1;
    await applyUpdates(service, documentId, totalTransactions - 1);
    await awaitWriteSettled(probe);
    expect(probe.settledFlushes()).toBe(0);

    await service.cleanup();
    expect(await countUpdateRows(documentId)).toBe(totalTransactions);
    expect(internalsOf(service).pendingSinceCompact.size).toBe(0);
  }, 20000);

  it('defers compaction to the next batch after a failed flush and never blocks persistence', async () => {
    const service = new YjsService();
    const documentId = `${USERNAME}:${SLUG}:elements/`;
    await service.getDocument(documentId);
    let failFlushes = true;
    const probe = installFlushProbe(service, PROJECT_KEY, { failFlushes: () => failFlushes });

    // Cross the threshold while flushes are failing — persistence itself must
    // keep succeeding (never blocks the write path).
    await applyUpdates(service, documentId, LEVELDB_COMPACT_THRESHOLD);
    await awaitWriteSettled(probe);
    // Optimistic reset: exactly ONE attempt per threshold crossing, even
    // though every update past the crossing still fires storeUpdates.
    expect(probe.attemptedFlushes()).toBe(1);

    // Stop failing; the next batch converges to one row.
    failFlushes = false;
    await applyUpdates(service, documentId, LEVELDB_COMPACT_THRESHOLD);
    await awaitWriteSettled(probe);

    await service.cleanup();
    expect(await countUpdateRows(documentId)).toBe(1);
    expect(internalsOf(service).pendingSinceCompact.size).toBe(0);
  }, 30000);

  it('queues at most one flush per threshold crossing during a long burst', async () => {
    const service = new YjsService();
    const documentId = `${USERNAME}:${SLUG}:elements/`;
    await service.getDocument(documentId);
    const probe = installFlushProbe(service, PROJECT_KEY);

    // 150 updates = 3 threshold crossings; the counter must reset optimistically
    // so the burst does not queue a redundant flush on every subsequent update.
    const bursts = 3;
    await applyUpdates(service, documentId, LEVELDB_COMPACT_THRESHOLD * bursts);
    await awaitWriteSettled(probe);

    expect(probe.attemptedFlushes()).toBe(bursts);

    await service.cleanup();
    expect(await countUpdateRows(documentId)).toBeLessThanOrEqual(bursts);
    expect(internalsOf(service).pendingSinceCompact.size).toBe(0);
  }, 30000);
});
