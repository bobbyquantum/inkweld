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
 * Cloudflare Workers `DurableObjectStorage` contract for `list`/`put`/`delete`.
 */
export interface DoStorage {
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
}

/** Cloudflare Durable Object storage caps bulk delete() at 128 keys per call. */
const STORAGE_DELETE_BATCH_LIMIT = 128;

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
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
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
 * Semantics:
 *  - `loadAndReplay` reads every `doc:<id>:update:*` row, replays sync frames
 *    onto the shared doc, and purges legacy non-sync (awareness/presence) rows
 *    in batched deletes. Storage list/replay errors PROPAGATE so the caller
 *    can drop a cached blank doc and retry, rather than writing over lost
 *    history. Only the best-effort purge is swallowed.
 *  - `persist` drops awareness/presence frames (ephemeral) and writes sync
 *    frames under a collision-free `timestamp:sequence` key.
 */
export class YjsDocStorage {
  private sequence = 0;

  constructor(
    private readonly storage: DoStorage,
    private readonly log: StorageLogger
  ) {}

  /**
   * Replay persisted sync frames onto `sharedDoc` and purge legacy non-sync
   * rows. Throws on storage list/replay failure so the caller can retry.
   */
  async loadAndReplay(documentId: string, applyFrame: (frame: Uint8Array) => void): Promise<void> {
    const storagePrefix = `doc:${documentId}:`;
    const updatePrefix = `${storagePrefix}update:`;

    const entries = await this.storage.list<number[]>({ prefix: updatePrefix });

    if (entries.size === 0) {
      this.log.debug(`No persisted updates found for ${documentId} - starting fresh`);
      return;
    }

    const { syncFrames, staleKeys } = partitionPersistedFrames(entries);
    for (const frame of syncFrames) applyFrame(frame);

    this.log.debug(
      `Loaded document ${documentId} from storage: ${syncFrames.length} sync frames applied, ${staleKeys.length} non-sync frames purged`
    );

    // Best-effort purge of legacy awareness/presence rows. Durable Object
    // storage caps bulk delete() at 128 keys per call, so chunk — the bloated
    // docs this targets hold thousands of rows and a single call would reject.
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
  }

  /**
   * Persist a Yjs wire frame. Only sync frames are stored — awareness/presence
   * are ephemeral and persisting them grew the update log without bound.
   * Returns the key written, or null if the frame was filtered out.
   */
  async persist(documentId: string, frame: Uint8Array): Promise<string | null> {
    if (!isSyncFrame(frame)) return null;
    const storagePrefix = `doc:${documentId}:`;
    const key = persistUpdateKey(storagePrefix, Date.now(), this.sequence++);
    await this.storage.put(key, Array.from(frame));
    return key;
  }
}
