/**
 * Minimal file-store contract every Cloud Sync provider adapter implements.
 *
 * Paths are app-folder relative and start with "/". Every provider we target
 * (Dropbox app folder, Google Drive `drive.file`, OneDrive approot, S3,
 * WebDAV) reduces to these five operations, so the sync engine is written
 * once against this interface.
 */
export interface RemoteFileInfo {
  path: string;
  /** Provider-specific version tag (rev, etag, md5). Changes when content does. */
  version: string;
  size: number;
  /** ISO timestamp of the last server-side modification, when known */
  modifiedAt?: string;
}

export interface RemoteFile extends RemoteFileInfo {
  content: Uint8Array;
}

export class RemoteFileNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Remote file not found: ${path}`);
    this.name = 'RemoteFileNotFoundError';
  }
}

/** The provider asked us to slow down; retry after `retryAfterMs` */
export class RemoteRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(
      `Cloud storage rate limited; retry in ${Math.round(retryAfterMs / 1000)}s`
    );
    this.name = 'RemoteRateLimitError';
  }
}

export class RemoteAuthError extends Error {
  constructor(message = 'Cloud storage authorization expired') {
    super(message);
    this.name = 'RemoteAuthError';
  }
}

export interface RemoteStore {
  /**
   * List files under `folderPath` ("/" for the app folder root). Returns only
   * files, never folders; `recursive` includes every descendant. A missing
   * folder lists as empty rather than throwing.
   */
  list(
    folderPath: string,
    options?: { recursive?: boolean }
  ): Promise<RemoteFileInfo[]>;

  /** Metadata for one file, or null when it does not exist */
  stat(path: string): Promise<RemoteFileInfo | null>;

  /** Download a file. Throws RemoteFileNotFoundError when absent. */
  get(path: string): Promise<RemoteFile>;

  /**
   * Upload a file, creating parent folders as needed. When `ifVersion` is
   * given the write fails with a conflict if the remote version differs,
   * enabling optimistic concurrency on the manifest.
   */
  put(
    path: string,
    content: Uint8Array | string,
    options?: { ifVersion?: string }
  ): Promise<RemoteFileInfo>;

  /** Delete a file or folder (with contents). Succeeds silently if absent. */
  delete(path: string): Promise<void>;
}

export class RemoteConflictError extends Error {
  constructor(public readonly path: string) {
    super(`Remote file changed concurrently: ${path}`);
    this.name = 'RemoteConflictError';
  }
}
