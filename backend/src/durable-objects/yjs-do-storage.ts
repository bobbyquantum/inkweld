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

/**
 * The slice of `DurableObjectState.storage` these helpers use. Matches the
 * Cloudflare Workers `DurableObjectStorage` contract for `get`/`list`/`put`/`delete`.
 */
export interface DoStorage {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
}

/** Cloudflare Durable Object storage caps bulk delete() at 128 keys per call. */
const STORAGE_DELETE_BATCH_LIMIT = 128;

/** Number of incremental update rows that triggers a background compaction. */
export const COMPACT_THRESHOLD = 50;

/** Storage key for the compacted document snapshot. */
export function snapshotKey(storagePrefix: string): string {
  return `${storagePrefix}snapshot`;
}

/** Result metadata from a `loadAndReplay` call. */
export interface LoadResult {
  totalRowsRead: number;
  hadSnapshot: boolean;
  incrementalKeys: string[];
}

/** Prefix + timestamp + zero-padded sequence keeps keys unique AND ordered. */
export function persistUpdateKey(
  storagePrefix: string,
  timestamp: number,
  sequence: number
): string {
  return `${storagePrefix}update:${timestamp}:${String(sequence).padStart(8, '0')}`;
}

/**
 * Split a storage listing into sync frames to replay vs. non-sync (awareness
 * / presence) frames to purge. Awareness frames were persisted by an older
 * version of the DO and must never be replayed — they're ephemeral and
 * replaying them grows the load cost without bound.
 */
export function partitionPersistedFrames(entries: Map<string, number[]>): {
  syncFrames: Uint8Array[];
  staleKeys: string[];
} {
  const syncFrames: Uint8Array[] = [];
  const staleKeys: string[] = [];
  for (const [key, updateArray] of entries.entries()) {
    const frame = new Uint8Array(updateArray);
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
 * Storage strategy — snapshot + incremental updates:
 *  - `loadAndReplay` reads a single compacted snapshot key (O(1) row read),
 *    then lists only the incremental update keys written since the last
 *    compaction. Legacy non-sync (awareness/presence) rows are purged.
 *  - `persist` drops awareness/presence frames (ephemeral) and writes sync
 *    frames under a collision-free `timestamp:sequence` key.
 *  - `compact` merges all incremental update rows into a single snapshot,
 *    reducing subsequent loads to O(1) row reads. Safe for offline clients:
 *    `Y.encodeStateAsUpdate` preserves the full state vector (all clientIDs +
 *    clocks), so the Yjs sync protocol can still compute correct diffs against
 *    a compacted state. CRDT merge is commutative and idempotent.
 */
export class YjsDocStorage {
  private sequence = 0;

  constructor(
    private readonly storage: DoStorage,
    private readonly log: StorageLogger
  ) {}

  /**
   * Replay persisted state onto `sharedDoc`: snapshot first (one row read),
   * then incremental updates. Purges legacy non-sync rows. Throws on storage
   * list/replay failure so the caller can drop a cached blank doc and retry.
   */
  async loadAndReplay(
    documentId: string,
    applyFrame: (frame: Uint8Array) => void
  ): Promise<LoadResult> {
    const storagePrefix = `doc:${documentId}:`;
    const snapKey = snapshotKey(storagePrefix);
    const updatePrefix = `${storagePrefix}update:`;

    let totalRowsRead = 0;
    let hadSnapshot = false;

    const snapshotRaw = await this.storage.get<number[]>(snapKey);
    if (snapshotRaw) {
      hadSnapshot = true;
      totalRowsRead++;
      applyFrame(new Uint8Array(snapshotRaw));
    }

    const entries = await this.storage.list<number[]>({ prefix: updatePrefix });
    totalRowsRead += entries.size;

    if (entries.size === 0 && !hadSnapshot) {
      this.log.debug(`No persisted updates found for ${documentId} - starting fresh`);
      return { totalRowsRead: 0, hadSnapshot: false, incrementalKeys: [] };
    }

    const { syncFrames, staleKeys } = partitionPersistedFrames(entries);
    for (const frame of syncFrames) applyFrame(frame);

    const staleKeySet = new Set(staleKeys);
    const incrementalKeys = [...entries.keys()].filter((key) => !staleKeySet.has(key));

    this.log.debug(
      `Loaded document ${documentId} from storage: snapshot=${hadSnapshot}, ${syncFrames.length} incremental sync frames, ${staleKeys.length} non-sync frames purged`
    );

    for (const batch of chunkKeysForDelete(staleKeys)) {
      try {
        await this.storage.delete(batch);
      } catch (err) {
        this.log.warn(
          `Failed to purge ${batch.length} of ${staleKeys.length} stale frames for ${documentId}`,
          { error: String(err) }
        );
      }
    }

    return { totalRowsRead, hadSnapshot, incrementalKeys };
  }

  /**
   * Merge all incremental update rows into a single snapshot.
   *
   * Write order is snapshot-first, then delete: if the DO crashes between the
   * two steps the next load applies the snapshot AND the leftover incrementals.
   * Yjs updates are idempotent, so double-applying is correct (just slightly
   * wasteful until the next compaction cleans up).
   *
   * @param encodedState The full document state from `Y.encodeStateAsUpdate(doc)`.
   * @param knownKeys When provided, these keys are deleted directly without a
   *   storage list (saves N row reads). Omit for warm-session compaction where
   *   the full key set isn't tracked.
   */
  async compact(documentId: string, encodedState: Uint8Array, knownKeys?: string[]): Promise<void> {
    const storagePrefix = `doc:${documentId}:`;
    const snapKey = snapshotKey(storagePrefix);

    await this.storage.put(snapKey, Array.from(encodedState));

    let keys: string[];
    if (knownKeys) {
      keys = knownKeys;
    } else {
      const updatePrefix = `${storagePrefix}update:`;
      const entries = await this.storage.list<number[]>({ prefix: updatePrefix });
      keys = [...entries.keys()];
    }
    if (keys.length === 0) return;

    for (const batch of chunkKeysForDelete(keys)) {
      try {
        await this.storage.delete(batch);
      } catch (err) {
        this.log.warn(
          `Failed to delete ${batch.length} of ${keys.length} update rows during compaction for ${documentId}`,
          { error: String(err) }
        );
      }
    }

    this.log.debug(
      `Compacted document ${documentId}: ${keys.length} update rows merged into snapshot`
    );
  }

  /**
   * Persist a Yjs wire frame. Only sync frames are stored — awareness/presence
   * are ephemeral and persisting them grew the update log without bound.
   * Returns the key written, or null if the frame was filtered out.
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
      await this.storage.put(key, Array.from(frame));
    } catch (err) {
      this.log.error(`Failed to persist update for ${documentId}`, err);
    }
    return key;
  }
}
