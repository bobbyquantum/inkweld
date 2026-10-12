import { forEachConcurrent, forEachPage } from '@inkweld/async';
import { stripTrailingSlashes } from '@utils/string-utils';

import {
  RemoteConflictError,
  type RemoteFile,
  type RemoteFileInfo,
  RemoteFileNotFoundError,
  RemoteRateLimitError,
  RemoteReauthRequiredError,
  type RemoteStore,
} from '../remote-store.interface';
import {
  createAppDataFile,
  deleteDriveFile,
  downloadDriveFile,
  DriveApiError,
  type DriveChangeList,
  type DriveFile,
  type DriveFileList,
  getChangesStartPageToken,
  getDriveFileMetadata,
  listAppDataChanges,
  listAppDataFiles,
  updateDriveFileContent,
} from './google-drive-api';

/** Supplies a valid access token, refreshing it when necessary */
export type AccessTokenProvider = () => Promise<string>;

/**
 * How long the index is trusted before `stat`/`get`/`put` poll for changes
 * again. A sync pass makes many calls in quick succession; this keeps it to
 * one changes request per pass. `list` and `delete` always poll.
 */
export const INDEX_FRESHNESS_MS = 5000;

/** Parallel deletes when removing a whole project */
const DELETE_CONCURRENCY = 4;

/** Seconds to back off when Drive throttles without a Retry-After */
const DEFAULT_RETRY_AFTER_SECONDS = 10;

/**
 * Version tag for a file. `headRevisionId` changes only when content does;
 * `version` also moves on metadata edits, so it is only the fallback.
 */
function versionOf(file: DriveFile): string {
  if (file.headRevisionId) return file.headRevisionId;
  return file.version ? `v${file.version}` : '';
}

function toFileInfo(file: DriveFile): RemoteFileInfo {
  return {
    path: file.name,
    version: versionOf(file),
    size: Number(file.size ?? 0),
    modifiedAt: file.modifiedTime,
  };
}

/** Oldest first, then by id, so every device picks the same duplicate */
function compareCanonical(a: DriveFile, b: DriveFile): number {
  const byCreated = (a.createdTime ?? '').localeCompare(b.createdTime ?? '');
  return byCreated === 0 ? a.id.localeCompare(b.id) : byCreated;
}

/**
 * RemoteStore backed by the Google Drive app data folder.
 *
 * Drive addresses files by id, not path, so the layout is flat: each file
 * sits directly in `appDataFolder` and its name is its full store path
 * ("/projects/alice/novel/elements.yjs"). An in-memory index maps paths to
 * file ids. It is built from one paged listing and then kept current from the
 * Drive Changes API, so an unchanged account costs one request per poll.
 *
 * Drive allows two files with the same name. Two devices creating the same
 * path at once therefore leave duplicates; every device reads and writes the
 * oldest one, and a successful write removes the others. Nothing is lost:
 * the device that wrote a removed duplicate still has the data locally and
 * pushes it again once it sees the version change.
 *
 * Drive v3 has no conditional update, so `ifVersion` is a check of the live
 * version immediately before the write. A write landing between the check
 * and ours is not detected; the manifest merge tolerates that.
 */
export class GoogleDriveRemoteStore implements RemoteStore {
  private readonly byId = new Map<string, DriveFile>();
  /** Files per path, canonical first; rebuilt lazily after index changes */
  private byPath: Map<string, DriveFile[]> | null = null;
  private pageToken: string | null = null;
  private lastPolledAt = 0;
  private polling: Promise<void> | null = null;
  private readonly pathLocks = new Map<string, Promise<unknown>>();

  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly onAuthRejected: () => void;

  constructor(
    private readonly getAccessToken: AccessTokenProvider,
    options: {
      fetchFn?: typeof fetch;
      now?: () => number;
      /** Drive answered 401: the token the provider handed out is dead */
      onAuthRejected?: () => void;
    } = {}
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): number => Date.now());
    this.onAuthRejected = options.onAuthRejected ?? ((): void => undefined);
  }

  async list(
    folderPath: string,
    options: { recursive?: boolean } = {}
  ): Promise<RemoteFileInfo[]> {
    try {
      await this.refresh(true);
    } catch (error) {
      this.rethrow(error, folderPath);
    }
    const prefix =
      folderPath === '/' ? '/' : `${stripTrailingSlashes(folderPath)}/`;
    const files: RemoteFileInfo[] = [];
    for (const [path, entries] of this.paths()) {
      if (!path.startsWith(prefix)) continue;
      if (!options.recursive && path.slice(prefix.length).includes('/')) {
        continue;
      }
      files.push(toFileInfo(entries[0]));
    }
    return files;
  }

  async stat(path: string): Promise<RemoteFileInfo | null> {
    try {
      await this.refresh();
    } catch (error) {
      this.rethrow(error, path);
    }
    const file = this.canonical(path);
    return file ? toFileInfo(file) : null;
  }

  async get(path: string): Promise<RemoteFile> {
    try {
      await this.refresh();
      const file = this.canonical(path);
      if (!file) throw new RemoteFileNotFoundError(path);
      return await this.download(path, file);
    } catch (error) {
      this.rethrow(error, path);
    }
  }

  put(
    path: string,
    content: Uint8Array | string,
    options: { ifVersion?: string } = {}
  ): Promise<RemoteFileInfo> {
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content;
    // Serialize writes to one path so this device never races itself into
    // creating a duplicate.
    return this.withPathLock(path, async () => {
      try {
        return await this.write(path, bytes, options.ifVersion);
      } catch (error) {
        this.rethrow(error, path);
      }
    });
  }

  async delete(path: string): Promise<void> {
    try {
      await this.refresh(true);
      const folderPrefix = `${stripTrailingSlashes(path)}/`;
      const targets = [...this.byId.values()].filter(
        file => file.name === path || file.name.startsWith(folderPrefix)
      );
      const token = await this.getAccessToken();
      await forEachConcurrent(targets, DELETE_CONCURRENCY, async file => {
        await this.deleteById(token, file.id);
      });
    } catch (error) {
      this.rethrow(error, path);
    }
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  private async write(
    path: string,
    bytes: Uint8Array,
    ifVersion: string | undefined
  ): Promise<RemoteFileInfo> {
    await this.refresh();
    // A stale index would create a duplicate; check again before creating
    if (!this.canonical(path)) await this.refresh(true);

    const token = await this.getAccessToken();
    let target = this.canonical(path);
    if (ifVersion !== undefined) {
      target = await this.checkVersion(token, path, target, ifVersion);
    }

    let written: DriveFile;
    if (target) {
      try {
        written = await updateDriveFileContent(
          token,
          target.id,
          bytes,
          this.fetchFn
        );
      } catch (error) {
        // Deleted since we indexed it. Recreate unless the caller asked for
        // that exact version, which no longer exists.
        if (!(error instanceof DriveApiError && error.isNotFound)) throw error;
        this.forget(target.id);
        if (ifVersion !== undefined) throw new RemoteConflictError(path);
        written = await createAppDataFile(token, path, bytes, this.fetchFn);
      }
    } else {
      written = await createAppDataFile(token, path, bytes, this.fetchFn);
    }
    this.remember(written);
    await this.removeDuplicates(token, path, written.id);
    return toFileInfo(written);
  }

  /**
   * Compare `ifVersion` with the file's live version, not the index, so a
   * conflict is reported against what Drive holds right now. Returns the
   * file to write to (undefined when it does not exist yet).
   */
  private async checkVersion(
    token: string,
    path: string,
    indexed: DriveFile | undefined,
    ifVersion: string
  ): Promise<DriveFile | undefined> {
    let live: DriveFile | undefined;
    if (indexed) {
      try {
        live = await getDriveFileMetadata(token, indexed.id, this.fetchFn);
        this.remember(live);
      } catch (error) {
        if (!(error instanceof DriveApiError && error.isNotFound)) throw error;
        this.forget(indexed.id);
      }
    }
    const current = live ? versionOf(live) : '';
    if (current !== ifVersion) throw new RemoteConflictError(path);
    return live;
  }

  /** Drop every other file with this name now that `keepId` is current */
  private async removeDuplicates(
    token: string,
    path: string,
    keepId: string
  ): Promise<void> {
    const extras = (this.paths().get(path) ?? []).filter(f => f.id !== keepId);
    await forEachConcurrent(extras, DELETE_CONCURRENCY, async file => {
      await this.deleteById(token, file.id);
    });
  }

  private async deleteById(token: string, fileId: string): Promise<void> {
    try {
      await deleteDriveFile(token, fileId, this.fetchFn);
    } catch (error) {
      if (!(error instanceof DriveApiError && error.isNotFound)) throw error;
    }
    this.forget(fileId);
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  /**
   * Download `file`. The version returned is the indexed one, read before the
   * content, so at worst it is older than the bytes and the next pass
   * downloads again; it is never newer, which would hide a change. If the
   * file has gone, re-poll once and try the path's current file.
   */
  private async download(
    path: string,
    file: DriveFile,
    retried = false
  ): Promise<RemoteFile> {
    const token = await this.getAccessToken();
    try {
      const content = await downloadDriveFile(token, file.id, this.fetchFn);
      return { ...toFileInfo(file), content };
    } catch (error) {
      if (!(error instanceof DriveApiError && error.isNotFound) || retried) {
        throw error;
      }
      this.forget(file.id);
      await this.refresh(true);
      const next = this.canonical(path);
      if (!next) throw new RemoteFileNotFoundError(path);
      return this.download(path, next, true);
    }
  }

  // ─── Index ────────────────────────────────────────────────────────────────

  /**
   * Bring the index up to date: a full listing the first time, the Changes
   * API afterwards. Concurrent callers share one request. Without `force`,
   * an index polled within INDEX_FRESHNESS_MS is used as is.
   */
  private refresh(force = false): Promise<void> {
    if (this.polling) return this.polling;
    if (
      !force &&
      this.pageToken !== null &&
      this.now() - this.lastPolledAt < INDEX_FRESHNESS_MS
    ) {
      return Promise.resolve();
    }
    const startedAt = this.now();
    const run = this.pageToken === null ? this.rebuild() : this.pollChanges();
    this.polling = run
      .then(() => {
        this.lastPolledAt = startedAt;
      })
      .finally(() => {
        this.polling = null;
      });
    return this.polling;
  }

  private async rebuild(): Promise<void> {
    const token = await this.getAccessToken();
    // Take the token first: changes made during the listing are replayed on
    // the next poll, and replaying an entry is harmless.
    const startToken = await getChangesStartPageToken(token, this.fetchFn);
    const files: DriveFile[] = [];
    // Each page needs the previous page's token, so pages load one at a time.
    await forEachPage<DriveFileList, string>(
      async cursor => {
        const page = await listAppDataFiles(token, cursor, this.fetchFn);
        return { page, next: page.nextPageToken };
      },
      page => {
        files.push(...page.files);
      }
    );
    this.byId.clear();
    for (const file of files) {
      if (!file.trashed) this.byId.set(file.id, file);
    }
    this.byPath = null;
    this.pageToken = startToken;
  }

  private async pollChanges(): Promise<void> {
    const token = await this.getAccessToken();
    const from = this.pageToken ?? '';
    let nextStart = from;
    try {
      // Each page needs the previous page's token, so pages load one at a time.
      await forEachPage<DriveChangeList, string>(
        async cursor => {
          const page = await listAppDataChanges(
            token,
            cursor ?? from,
            this.fetchFn
          );
          return { page, next: page.nextPageToken };
        },
        page => {
          for (const change of page.changes) {
            if (change.removed || !change.file || change.file.trashed) {
              this.forget(change.fileId);
            } else {
              this.remember(change.file);
            }
          }
          if (page.newStartPageToken) nextStart = page.newStartPageToken;
        }
      );
    } catch (error) {
      if (error instanceof DriveApiError && error.isInvalidPageToken) {
        this.pageToken = null;
        await this.rebuild();
        return;
      }
      throw error;
    }
    this.pageToken = nextStart;
  }

  private remember(file: DriveFile): void {
    this.byId.set(file.id, file);
    this.byPath = null;
  }

  private forget(fileId: string): void {
    if (this.byId.delete(fileId)) this.byPath = null;
  }

  private paths(): Map<string, DriveFile[]> {
    if (this.byPath) return this.byPath;
    const byPath = new Map<string, DriveFile[]>();
    for (const file of this.byId.values()) {
      const entries = byPath.get(file.name);
      if (entries) entries.push(file);
      else byPath.set(file.name, [file]);
    }
    for (const entries of byPath.values()) entries.sort(compareCanonical);
    this.byPath = byPath;
    return byPath;
  }

  private canonical(path: string): DriveFile | undefined {
    return this.paths().get(path)?.[0];
  }

  private async withPathLock<T>(
    path: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const previous = this.pathLocks.get(path) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    this.pathLocks.set(path, settled);
    try {
      return await run;
    } finally {
      if (this.pathLocks.get(path) === settled) this.pathLocks.delete(path);
    }
  }

  /** Map Drive errors onto the provider-neutral error types */
  private rethrow(error: unknown, path: string): never {
    if (error instanceof DriveApiError) {
      // Not a disconnect: Google tokens can be renewed, so pause instead
      if (error.isAuthError) {
        this.onAuthRejected();
        throw new RemoteReauthRequiredError(
          'Google Drive rejected the sign-in; it will be renewed'
        );
      }
      if (error.isRateLimited) {
        throw new RemoteRateLimitError(
          (error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000
        );
      }
      if (error.isNotFound) throw new RemoteFileNotFoundError(path);
    }
    throw error;
  }
}
