/**
 * Pure, runtime-agnostic storage helpers for the Yjs Durable Object.
 *
 * The Cloudflare `DurableObject` base class and `cloudflare:workers` module
 * can't be imported in the Bun test runtime, so the DO class itself isn't
 * unit-testable. These helpers take a minimal `DurableObjectStorage`-shaped
 * object as a dependency, keeping the persistence/replay logic testable while
 * the DO stays a thin wrapper.
 */

import { isSyncFrame } from '../utils/yjs-document-utils';
import { stripTrailingSlashes } from '../utils/string-utils';

/**
 * Bytes as persisted by `put`. New writes store a `Uint8Array` (compact BLOB);
 * rows written by older builds are a `number[]`. Both are array-like, so
 * `new Uint8Array(value)` reconstructs the frame from either shape — which is
 * what makes the storage-format change backward compatible with no migration.
 */
export type StoredBytes = number[] | Uint8Array;

/**
 * The slice of `DurableObjectState.storage` these helpers use. Matches the
 * Cloudflare Workers `DurableObjectStorage` contract for `get`/`list`/`put`/
 * `delete`. `list` honours `limit` + `startAfter` so callers can page a large
 * key range without materialising every value in memory at once.
 */
export interface DoStorage {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(options: {
    prefix: string;
    limit?: number;
    startAfter?: string;
  }): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
}

/** Cloudflare Durable Object storage caps bulk delete() at 128 keys per call. */
const STORAGE_DELETE_BATCH_LIMIT = 128;

/**
 * Rows read per `list` page. Bounded so a document with a huge update history
 * (hundreds of thousands of rows) never materialises every value into the
 * isolate's 128 MB heap at once — which is what bricked the load path on
 * long-lived documents. Page size trades list-call overhead against peak
 * memory; total rows read (and billed) is unchanged by paging.
 */
export const LIST_PAGE_SIZE = 500;

/** Number of incremental update rows that triggers a background compaction. */
export const COMPACT_THRESHOLD = 50;

/**
 * Largest snapshot value (bytes) we will write. Cloudflare caps a single
 * stored value (key + value) at 2 MB; we leave headroom for the key and for
 * structured-clone overhead. A document whose *current* state exceeds this
 * cannot be snapshotted, so compaction is skipped (the update rows are left in
 * place — paging keeps the load functional, and skipping the delete avoids any
 * data loss). In practice the snapshot is the *current* document state, which
 * is small even when the *edit history* (the rows) is huge.
 */
export const SNAPSHOT_VALUE_LIMIT = 1_900_000;

/** Storage key for the compacted document snapshot. */
export function snapshotKey(storagePrefix: string): string {
  return `${storagePrefix}snapshot`;
}

/**
 * Callbacks for replaying persisted state onto a live doc.
 *
 * The two stored formats are NOT interchangeable:
 *  - Incremental `update:*` rows are Yjs *wire-protocol* frames as captured
 *    from the `WSSharedDoc` notify stream — they start with a varuint message
 *    type header (`0` = sync) followed by a sync message.
 *  - The `snapshot` row is a *raw* `Y.encodeStateAsUpdate` payload with no
 *    wire header. It must be applied with `Y.applyUpdate`; feeding it to the
 *    wire-frame handler makes the decoder read the update's leading
 *    client-struct count as a message type, which either throws
 *    ("Unexpected end of array") or silently drops the whole snapshot.
 */
export interface ReplayAppliers {
  /** Apply one incremental wire-protocol frame (e.g. `WSSharedDoc.update`). */
  applyFrame: (frame: Uint8Array) => void;
  /** Apply the raw compacted snapshot (e.g. `Y.applyUpdate(doc, bytes)`). */
  applySnapshot: (bytes: Uint8Array) => void;
}

/** Result metadata from a `loadAndReplay` call. */
export interface LoadResult {
  totalRowsRead: number;
  hadSnapshot: boolean;
  incrementalKeys: string[];
  /** Keys whose frames threw when applied (corrupted / truncated). Purged after load. */
  corruptedKeys: string[];
}

/** Result metadata from a `compact` call. */
export interface CompactResult {
  snapshotWritten: boolean;
  rowsDeleted: number;
  /**
   * Set when compaction was deliberately aborted (e.g. the regression guard
   * refused to collapse a populated stored tree into a blank state). Absent on
   * the normal write/delete and value-limit-skip paths so existing equality
   * assertions on those results stay exact.
   */
  skippedReason?: string;
}

/**
 * Predicate that can veto a compaction. Receives the bytes of the snapshot
 * currently in storage (or `undefined` when none) and the encoded state about
 * to be written. Returning `true` aborts the compaction: nothing is written and
 * no incremental rows are deleted, so the existing stored state is retained
 * intact. Used by the Durable Object to block the regression where a doc that
 * failed to load its history (blank state vector) would otherwise overwrite a
 * good snapshot and destroy the incrementals.
 */
export type CompactionGuard = (
  existingSnapshot: Uint8Array | undefined,
  nextState: Uint8Array
) => boolean;

/** Options for {@link YjsDocStorage.compact}. */
export interface CompactOptions {
  skipCompaction?: CompactionGuard;
}

/** Decoded content metrics for a stored snapshot (diagnostic only). */
export interface SnapshotContent {
  elementCount: number | null;
  topLevel: Record<string, number>;
}

/** Injected decoder so this module stays Yjs-free (and Bun-testable). */
export type SnapshotDecoder = (bytes: Uint8Array) => SnapshotContent;

/** One storage row as surfaced by the diagnostic (value bytes discarded). */
export interface StorageKeyInfo {
  key: string;
  bytes: number;
}

/** Per-prefix slice of a {@link StorageDescription}. */
export interface StoragePrefixSummary {
  snapshot: (SnapshotContent & { key: string; bytes: number; decodeError?: string }) | null;
  updateRows: number;
  updateBytes: number;
}

/** Read-only view of a document's Durable Object storage (diagnostic only). */
export interface StorageDescription {
  rawDocumentId: string;
  prefixesScanned: string[];
  canonical: StoragePrefixSummary;
  /** The trailing-slash ghost prefix (`doc:<id>/:`), scanned to detect legacy data. */
  ghost: StoragePrefixSummary;
  keys: StorageKeyInfo[];
  keysTruncated: boolean;
}

/** Prefix + timestamp + zero-padded sequence keeps keys unique AND ordered. */
export function persistUpdateKey(
  storagePrefix: string,
  timestamp: number,
  sequence: number
): string {
  return `${storagePrefix}update:${timestamp}:${String(sequence).padStart(8, '0')}`;
}

/** Coerce a persisted value (legacy `number[]` or current `Uint8Array`) to bytes. */
export function toBytes(value: StoredBytes): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/**
 * Split a storage listing into sync frames to replay vs. non-sync (awareness
 * / presence) frames to purge. Awareness frames were persisted by an older
 * version of the DO and must never be replayed — they're ephemeral and
 * replaying them grows the load cost without bound.
 */
export function partitionPersistedFrames(entries: Map<string, StoredBytes>): {
  syncFrames: Uint8Array[];
  staleKeys: string[];
} {
  const syncFrames: Uint8Array[] = [];
  const staleKeys: string[] = [];
  for (const [key, updateArray] of entries.entries()) {
    const frame = toBytes(updateArray);
    if (isSyncFrame(frame)) {
      syncFrames.push(frame);
    } else {
      staleKeys.push(key);
    }
  }
  return { syncFrames, staleKeys };
}

/** Split `keys` into batches of at most the Durable Object delete() limit. */
export function chunkKeysForDelete(
  keys: string[],
  batchSize = STORAGE_DELETE_BATCH_LIMIT
): string[][] {
  if (keys.length === 0) return [];
  // Guard against a non-positive batch size, which would infinite-loop.
  const safe = batchSize > 0 ? batchSize : STORAGE_DELETE_BATCH_LIMIT;
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += safe) {
    batches.push(keys.slice(i, i + safe));
  }
  return batches;
}

/**
 * Page every key under `prefix` in ascending order, invoking `onPage` with each
 * page (bounded to {@link LIST_PAGE_SIZE} values live at a time so a document
 * with a huge history never materialises every value into the isolate heap).
 * Returns the total number of rows read. Shared by the load/compact paths and
 * the read-only diagnostic so the paging mechanic lives in exactly one place.
 */
async function pagePrefix(
  storage: DoStorage,
  prefix: string,
  onPage: (page: Map<string, StoredBytes>) => Promise<void> | void
): Promise<number> {
  let total = 0;
  let startAfter: string | undefined;
  for (;;) {
    const page = await storage.list<StoredBytes>({
      prefix,
      limit: LIST_PAGE_SIZE,
      ...(startAfter ? { startAfter } : {}),
    });
    if (page.size === 0) break;
    total += page.size;

    await onPage(page);
    if (page.size < LIST_PAGE_SIZE) break;
    // `list` returns keys in ascending order; the last key is the page max.
    let lastKey = '';
    for (const key of page.keys()) lastKey = key;
    startAfter = lastKey;
  }
  return total;
}

/**
 * Read-only diagnostic: page a document's storage under BOTH the canonical
 * prefix (`doc:<id>:`) and the trailing-slash ghost prefix (`doc:<id>/:`),
 * reporting per-key byte lengths (values discarded page-by-page to bound
 * memory) and decoding any snapshot via the injected `decode` so callers can
 * see whether the stored state is full or empty — without writing anything or
 * touching a live document.
 *
 * `rawDocumentId` is the *un-stripped* id as the client sent it; the canonical
 * prefix is derived by stripping trailing slashes, and the ghost prefix adds
 * one back, so a single call reveals data that lives under either convention.
 *
 * Pure (no Yjs import): the snapshot decoder is injected so this is testable
 * with a mock storage + mock decoder under Bun.
 */
export async function describeDocStorage(
  storage: DoStorage,
  rawDocumentId: string,
  decode: SnapshotDecoder,
  options?: { maxKeys?: number }
): Promise<StorageDescription> {
  const maxKeys = options?.maxKeys ?? 5000;
  const stripped = stripTrailingSlashes(rawDocumentId);
  const canonicalPrefix = `doc:${stripped}:`;
  const ghostPrefix = `doc:${stripped}/:`;

  const keys: StorageKeyInfo[] = [];
  let keysTruncated = false;

  const scan = async (prefix: string): Promise<StoragePrefixSummary> => {
    let snapshot: StoragePrefixSummary['snapshot'] = null;
    let updateRows = 0;
    let updateBytes = 0;
    const snapKeyForPrefix = snapshotKey(prefix);

    await pagePrefix(storage, prefix, (page) => {
      for (const [key, value] of page.entries()) {
        const bytes = toBytes(value);
        if (keys.length < maxKeys) {
          keys.push({ key, bytes: bytes.byteLength });
        } else {
          keysTruncated = true;
        }

        if (key === snapKeyForPrefix) {
          let content: SnapshotContent;
          let decodeError: string | undefined;
          try {
            content = decode(bytes);
          } catch (err) {
            content = { elementCount: null, topLevel: {} };
            decodeError = String(err);
          }
          snapshot = {
            key,
            bytes: bytes.byteLength,
            ...content,
            ...(decodeError ? { decodeError } : {}),
          };
        } else {
          updateRows++;
          updateBytes += bytes.byteLength;
        }
      }
    });

    return { snapshot, updateRows, updateBytes };
  };

  const canonical = await scan(canonicalPrefix);
  const ghost = await scan(ghostPrefix);

  return {
    rawDocumentId,
    prefixesScanned: [canonicalPrefix, ghostPrefix],
    canonical,
    ghost,
    keys,
    keysTruncated,
  };
}

/**
 * Logger subset the storage helpers call. Matches the child-logger shape from
 * `logger.service.ts` so the DO can pass its `projDOLog` straight through.
 */
export interface StorageLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
}

/**
 * Yjs document persistence + replay, decoupled from the Durable Object base
 * class so it can be unit-tested with a mock `DoStorage`.
 *
 * Storage strategy — snapshot + paged incremental updates:
 *  - `loadAndReplay` reads a single compacted snapshot key (O(1) row read),
 *    then pages the incremental update keys written since the last compaction
 *    (`limit` + `startAfter`) so peak memory stays bounded regardless of how
 *    long the history is. Legacy non-sync (awareness/presence) rows are purged
 *    page-by-page.
 *  - `persist` drops awareness/presence frames (ephemeral) and writes sync
 *    frames as compact `Uint8Array` BLOBs under a collision-free key.
 *  - `compact` merges all incremental update rows into a single snapshot,
 *    reducing subsequent loads to O(1) row reads. Safe for offline clients:
 *    `Y.encodeStateAsUpdate` preserves the full state vector (all clientIDs +
 *    clocks), so the Yjs sync protocol can still compute correct diffs against
 *    a compacted state. CRDT merge is commutative and idempotent. If the
 *    encoded state exceeds `SNAPSHOT_VALUE_LIMIT` the snapshot write AND the
 *    row deletes are both skipped (a partial write or a delete-without-snapshot
 *    would risk data loss), leaving the paged load as the recovery path.
 */
export class YjsDocStorage {
  private sequence = 0;

  constructor(
    private readonly storage: DoStorage,
    private readonly log: StorageLogger
  ) {}

  /**
   * Page through all `update:*` rows for a document, invoking `onPage` with
   * each page's entries in ascending key order. Bounded memory: only one page
   * of values is live at a time. Returns the total number of rows read.
   * Delegates to the module-level {@link pagePrefix} pager.
   */
  private forEachUpdatePage(
    updatePrefix: string,
    onPage: (page: Map<string, StoredBytes>) => Promise<void> | void
  ): Promise<number> {
    return pagePrefix(this.storage, updatePrefix, onPage);
  }

  /**
   * Replay persisted state onto `sharedDoc`: snapshot first (one row read),
   * then paged incremental updates. Purges legacy non-sync rows page-by-page.
   * Throws on storage read/replay failure so the caller can drop a cached
   * blank doc and retry.
   *
   * The snapshot and the incremental rows are stored in different formats and
   * MUST go through different appliers — see {@link ReplayAppliers}. Routing
   * both through the wire-frame handler was the root cause of every snapshot
   * "corruption" on load: the raw snapshot bytes never parse as a wire frame,
   * so a compacted document reloaded as blank.
   */
  async loadAndReplay(documentId: string, appliers: ReplayAppliers): Promise<LoadResult> {
    const { applyFrame, applySnapshot } = appliers;
    const storagePrefix = `doc:${documentId}:`;
    const snapKey = snapshotKey(storagePrefix);
    const updatePrefix = `${storagePrefix}update:`;

    let totalRowsRead = 0;
    let hadSnapshot = false;
    const corruptedKeys: string[] = [];

    const snapshotRaw = await this.storage.get<StoredBytes>(snapKey);
    if (snapshotRaw) {
      hadSnapshot = true;
      totalRowsRead++;
      try {
        applySnapshot(toBytes(snapshotRaw));
      } catch (err) {
        this.log.error(
          `Corrupted snapshot for ${documentId} — skipping (incrementals may still reconstruct partial state)`,
          err
        );
        corruptedKeys.push(snapKey);
        hadSnapshot = false;
      }
    }

    const incrementalKeys: string[] = [];
    let incrementalSyncFrames = 0;

    const rowsRead = await this.forEachUpdatePage(updatePrefix, async (page) => {
      const { syncFrames, staleKeys } = partitionPersistedFrames(page);
      const staleKeySet = new Set(staleKeys);

      // Build the ordered list of sync-frame keys (page keys minus stale keys,
      // in the same order partitionPersistedFrames pushed syncFrames).
      const syncKeys: string[] = [];
      for (const key of page.keys()) {
        if (!staleKeySet.has(key)) syncKeys.push(key);
      }

      const pageCorrupted: string[] = [];
      for (let i = 0; i < syncFrames.length; i++) {
        try {
          applyFrame(syncFrames[i]);
          incrementalSyncFrames++;
        } catch (err) {
          const key = syncKeys[i] ?? `unknown-${i}`;
          this.log.error(`Corrupted frame at ${key} for ${documentId} — skipping`, err);
          pageCorrupted.push(key);
        }
      }
      corruptedKeys.push(...pageCorrupted);

      const corruptedSet = new Set(pageCorrupted);
      for (const key of syncKeys) {
        if (!corruptedSet.has(key)) incrementalKeys.push(key);
      }

      const purgeKeys = [...staleKeys, ...pageCorrupted];
      for (const batch of chunkKeysForDelete(purgeKeys)) {
        await this.deleteBatch(batch, documentId, purgeKeys.length);
      }
    });
    totalRowsRead += rowsRead;

    if (rowsRead === 0 && !hadSnapshot) {
      this.log.debug(`No persisted updates found for ${documentId} - starting fresh`);
      return { totalRowsRead: 0, hadSnapshot: false, incrementalKeys: [], corruptedKeys: [] };
    }

    if (corruptedKeys.length > 0) {
      // Note: a corrupted *snapshot* is intentionally NOT deleted — it is kept
      // as the last-good copy so a future decode fix (or a manual recovery) can
      // still read it. Only corrupted *incremental* frames (and stale awareness
      // rows) are purged, in the per-page loop above. The wording here reflects
      // that to avoid implying the snapshot was destroyed.
      this.log.warn(
        `Skipped ${corruptedKeys.length} corrupted frame(s) on load for ${documentId} (corrupted incrementals purged; any corrupted snapshot retained as last-good copy)`,
        {
          keys: corruptedKeys,
        }
      );
    }

    this.log.debug(
      `Loaded document ${documentId} from storage: snapshot=${hadSnapshot}, ${incrementalSyncFrames} incremental sync frames (paged), ${incrementalKeys.length} live update rows, ${corruptedKeys.length} corrupted purged`
    );

    return { totalRowsRead, hadSnapshot, incrementalKeys, corruptedKeys };
  }

  /**
   * Delete one batch of keys, swallowing + logging failures. Returns the count
   * deleted on success, 0 on failure (best-effort purge/compaction cleanup).
   */
  private async deleteBatch(
    batch: string[],
    documentId: string,
    totalForLog: number
  ): Promise<number> {
    try {
      await this.storage.delete(batch);
      return batch.length;
    } catch (err) {
      this.log.warn(`Failed to delete ${batch.length} of ${totalForLog} rows for ${documentId}`, {
        error: String(err),
      });
      return 0;
    }
  }

  /**
   * Merge all incremental update rows into a single snapshot.
   *
   * Write order is snapshot-first, then delete: if the DO crashes between the
   * two steps the next load applies the snapshot AND the leftover incrementals.
   * Yjs updates are idempotent, so double-applying is correct (just slightly
   * wasteful until the next compaction cleans up).
   *
   * If the encoded state exceeds `SNAPSHOT_VALUE_LIMIT` the write is skipped
   * entirely (and no rows are deleted) so we never lose the only copy of the
   * history — the paged load remains the recovery path for oversized docs.
   *
   * @param encodedState The full document state from `Y.encodeStateAsUpdate(doc)`.
   * @param knownKeys When provided, these keys are deleted directly without a
   *   storage list (saves N row reads). Omit for warm-session compaction where
   *   the full key set isn't tracked.
   */
  async compact(
    documentId: string,
    encodedState: Uint8Array,
    knownKeys?: string[],
    options?: CompactOptions
  ): Promise<CompactResult> {
    if (encodedState.byteLength > SNAPSHOT_VALUE_LIMIT) {
      this.log.warn(
        `Skipping compaction for ${documentId}: encoded state ${encodedState.byteLength} bytes exceeds snapshot limit ${SNAPSHOT_VALUE_LIMIT}; leaving incremental rows (paged load still works)`,
        { documentId, bytes: encodedState.byteLength, limit: SNAPSHOT_VALUE_LIMIT }
      );
      return { snapshotWritten: false, rowsDeleted: 0 };
    }

    const storagePrefix = `doc:${documentId}:`;
    const snapKey = snapshotKey(storagePrefix);

    // Regression guard: when supplied, ask whether writing `encodedState` would
    // destroy a populated stored tree (e.g. the in-memory doc is a blank
    // failed-load state while storage still holds content). If so, abort
    // entirely — write nothing, delete nothing — so the existing snapshot and
    // incrementals survive as the recovery path. Read the existing snapshot
    // only when a guard is present, so unguarded compactions keep their exact
    // prior cost and behaviour.
    if (options?.skipCompaction) {
      const existingRaw = await this.storage.get<StoredBytes>(snapKey);
      const existingBytes = existingRaw ? toBytes(existingRaw) : undefined;
      if (options.skipCompaction(existingBytes, encodedState)) {
        this.log.warn(
          `Skipping compaction for ${documentId}: regression guard tripped (stored snapshot has content but the next state is a blank/failed-load state); retaining existing snapshot + incremental rows`,
          {
            documentId,
            hadExistingSnapshot: existingBytes !== undefined,
            nextBytes: encodedState.byteLength,
          }
        );
        return { snapshotWritten: false, rowsDeleted: 0, skippedReason: 'regression-guard' };
      }
    }

    // Store the raw bytes (compact BLOB), not Array.from(bytes) — the latter
    // inflates stored size ~8x (one boxed number per byte) and the in-memory
    // load cost likewise.
    await this.storage.put(snapKey, encodedState);

    let keys: string[];
    if (knownKeys) {
      keys = knownKeys;
    } else {
      const updatePrefix = `${storagePrefix}update:`;
      keys = [];
      await this.forEachUpdatePage(updatePrefix, (page) => {
        for (const key of page.keys()) keys.push(key);
      });
    }
    if (keys.length === 0) {
      return { snapshotWritten: true, rowsDeleted: 0 };
    }

    let rowsDeleted = 0;
    for (const batch of chunkKeysForDelete(keys)) {
      rowsDeleted += await this.deleteBatch(batch, documentId, keys.length);
    }

    this.log.debug(
      `Compacted document ${documentId}: ${rowsDeleted}/${keys.length} update rows merged into snapshot`
    );
    return { snapshotWritten: true, rowsDeleted };
  }

  /**
   * Read-only diagnostic over this document's storage. Thin wrapper that hands
   * the already-wired `DoStorage` to the pure {@link describeDocStorage} helper
   * so the Durable Object can expose it without re-implementing the paging.
   */
  describeStorage(
    rawDocumentId: string,
    decode: SnapshotDecoder,
    options?: { maxKeys?: number }
  ): Promise<StorageDescription> {
    return describeDocStorage(this.storage, rawDocumentId, decode, options);
  }

  /**
   * Persist a Yjs wire frame. Only sync frames are stored — awareness/presence
   * are ephemeral and persisting them grew the update log without bound.
   * Returns the key written, or null if the frame was filtered out.
   *
   * The frame is stored as a compact `Uint8Array` BLOB (not `Array.from`,
   * which would box every byte as a JS number and inflate storage ~8x).
   *
   * A short random suffix is appended to the key so a Durable Object that
   * restarts (resetting its in-memory `sequence` to 0) makes reuse of a key
   * written before the restart negligibly unlikely. Lexicographic ordering is
   * preserved by timestamp-then-seq; the random suffix only breaks ties that
   * would otherwise have collided.
   *
   * Storage write failures are caught and logged — the caller invokes this
   * fire-and-forget (`void …persist()`), so a rejected `put` would otherwise
   * surface as an unhandled rejection. The update has already been applied to
   * the in-memory doc and broadcast to live peers; a failed durable write
   * means that update is lost on the next hibernation/reload, which is logged
   * for diagnosis rather than silently dropped.
   */
  async persist(documentId: string, frame: Uint8Array): Promise<string | null> {
    if (!isSyncFrame(frame)) return null;
    const storagePrefix = `doc:${documentId}:`;
    const base = persistUpdateKey(storagePrefix, Date.now(), this.sequence++);
    const rand = new Uint8Array(16);
    crypto.getRandomValues(rand);
    const suffix = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
    const key = `${base}:${suffix}`;
    try {
      await this.storage.put(key, frame);
    } catch (err) {
      this.log.error(`Failed to persist update for ${documentId}`, err);
    }
    return key;
  }
}
