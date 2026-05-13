/**
 * Pure storage-algorithm helpers for YjsProject Durable Object.
 *
 * Extracted from yjs-project.do.ts so they can be unit-tested without the
 * Cloudflare Workers runtime (which is excluded from the regular test runner).
 *
 * The interfaces below are intentionally narrow — they only expose the storage
 * operations actually used by the algorithms, making mocking straightforward.
 */

import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Minimal storage interfaces (subset of DurableObjectStorage)
// ---------------------------------------------------------------------------

export interface DOStorageReader {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
}

export interface DOStorageTransaction {
  put(key: string, value: unknown): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

export interface DOStorageWriter {
  put(key: string, value: unknown): Promise<void>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  transaction<T>(callback: (txn: DOStorageTransaction) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Minimal Y.Doc-like interface (subset of WSSharedDoc)
// ---------------------------------------------------------------------------

export interface YDocLike {
  /** Placeholder — kept for back-compat; loadDocumentFromStorage accepts Y.Doc directly. */
  _yjsDocBrand?: never;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

export function snapshotKey(storagePrefix: string): string {
  return `${storagePrefix}snapshot`;
}

export function updateKeyPrefix(storagePrefix: string): string {
  return `${storagePrefix}update:`;
}

export function docStoragePrefix(documentId: string): string {
  return `doc:${documentId}:`;
}

// ---------------------------------------------------------------------------
// loadDocumentFromStorage
// ---------------------------------------------------------------------------

/**
 * Load a Yjs document from DO storage using the snapshot + incremental-updates strategy.
 *
 * Reads the compacted snapshot key first (O(1)), then any incremental update keys written
 * since the last compaction. Returns the set of update keys found so the caller can decide
 * whether to compact immediately.
 *
 * @returns The map of incremental update keys loaded (empty if none). The caller should
 *   pass this to `compactDocumentStorage` when it is non-empty.
 */
export async function loadDocumentFromStorage(
  documentId: string,
  sharedDoc: Y.Doc,
  storage: DOStorageReader
): Promise<Map<string, number[]>> {
  const prefix = docStoragePrefix(documentId);
  const snap = snapshotKey(prefix);

  // 1. Apply the compacted snapshot — single storage read, may be absent.
  const snapshotRaw = await storage.get<number[]>(snap);
  if (snapshotRaw) {
    Y.applyUpdate(sharedDoc, new Uint8Array(snapshotRaw));
  }

  // 2. Apply incremental updates written after the last compaction.
  const updates = await storage.list<number[]>({ prefix: updateKeyPrefix(prefix) });
  for (const [, updateArray] of updates.entries()) {
    Y.applyUpdate(sharedDoc, new Uint8Array(updateArray));
  }

  return updates;
}

// ---------------------------------------------------------------------------
// compactDocumentStorage
// ---------------------------------------------------------------------------

/**
 * Merge all pending incremental update keys into a single snapshot entry.
 *
 * Encodes the current document state as one Yjs update, writes it atomically
 * as the new snapshot, and deletes all individual update keys in the same
 * transaction. The next wake will read just the one snapshot key.
 */
export async function compactDocumentStorage(
  documentId: string,
  doc: Y.Doc,
  updateKeys: Map<string, number[]>,
  storage: DOStorageWriter
): Promise<void> {
  const prefix = docStoragePrefix(documentId);
  const snap = snapshotKey(prefix);
  const snapshot = Y.encodeStateAsUpdate(doc);
  await storage.transaction(async (txn) => {
    await txn.put(snap, Array.from(snapshot));
    await txn.delete([...updateKeys.keys()]);
  });
}

// ---------------------------------------------------------------------------
// shouldCompact / COMPACT_THRESHOLD
// ---------------------------------------------------------------------------

export const COMPACT_THRESHOLD = 50;

/**
 * Returns true when there are enough pending update keys to warrant a background
 * compaction during a live session (i.e. while the DO is warm and not hibernating).
 */
export function shouldCompact(pendingCount: number): boolean {
  return pendingCount >= COMPACT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// peekMessageType — used by the fast-path in webSocketMessage
// ---------------------------------------------------------------------------

/**
 * Read the first varint byte from a binary WebSocket frame to determine the
 * y-protocols message type without allocating a full decoder.
 *
 * Returns -1 for empty or non-ArrayBuffer messages.
 *
 * y-protocols varint encoding: for values 0-127 the first byte IS the varint,
 * so a simple array index read is sufficient for the message types we care about
 * (SYNC=0, AWARENESS=1, PRESENCE=custom small int).
 */
export function peekMessageType(message: ArrayBuffer | string): number {
  if (typeof message === 'string' || message.byteLength === 0) return -1;
  return new Uint8Array(message)[0];
}
