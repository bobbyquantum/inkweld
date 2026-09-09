import { stripTrailingSlashes } from '@utils/string-utils';

import {
  RemoteAuthError,
  RemoteConflictError,
  type RemoteFile,
  type RemoteFileInfo,
  RemoteFileNotFoundError,
  RemoteRateLimitError,
  type RemoteStore,
} from '../remote-store.interface';
import {
  appFolderPathname,
  buildDavFilesRoot,
  buildDavUrl,
  davDelete,
  type DavEntry,
  davGet,
  davMkcol,
  davPropfind,
  davPut,
  type NextcloudCredentials,
  WebDavError,
} from './webdav-api';

/** Supplies the current credentials; throws RemoteAuthError when disconnected */
export type CredentialsProvider = () => Promise<NextcloudCredentials>;

/**
 * Thrown by {@link NextcloudRemoteStore.checkAccess} when the browser could
 * not reach the server at all. From a web origin this almost always means
 * the Nextcloud instance is not sending CORS headers for Inkweld's origin.
 */
export class NextcloudUnreachableError extends Error {
  constructor(public readonly serverUrl: string) {
    super(`Could not reach ${serverUrl}`);
    this.name = 'NextcloudUnreachableError';
  }
}

/**
 * RemoteStore backed by a folder in the user's Nextcloud via WebDAV.
 *
 * Versions are ETags. Nextcloud honours `If-Match` on PUT, which gives the
 * manifest its optimistic concurrency. Folders are created lazily on the
 * first PUT that fails with 409.
 */
export class NextcloudRemoteStore implements RemoteStore {
  /**
   * App-relative folders known to exist on the server. Nextcloud answers a
   * PUT into a missing folder with an error and offers no "create parents"
   * flag, so without this every new file would cost one failed PUT plus one
   * MKCOL per ancestor; with it, later files in a known folder cost one call.
   */
  private readonly knownFolders = new Set<string>();

  constructor(
    private readonly getCredentials: CredentialsProvider,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  /**
   * Verify the server, login name and app password by reading the user's
   * files root. Distinguishes "unreachable" (CORS, DNS, offline) from
   * "rejected" so the setup page can give the right hint.
   */
  async checkAccess(): Promise<void> {
    const creds = await this.getCredentials();
    try {
      await davPropfind(creds, buildDavFilesRoot(creds), 0, this.fetchFn);
    } catch (error) {
      if (error instanceof WebDavError) this.rethrow(error, '/');
      if (error instanceof TypeError) {
        throw new NextcloudUnreachableError(creds.serverUrl);
      }
      throw error;
    }
  }

  async list(
    folderPath: string,
    options: { recursive?: boolean } = {}
  ): Promise<RemoteFileInfo[]> {
    const creds = await this.getCredentials();
    const root = appFolderPathname(creds);
    const files: RemoteFileInfo[] = [];
    const pending = [folderPath];
    while (pending.length > 0) {
      const current = pending.shift()!;
      const entries = await this.listFolder(creds, current);
      const selfPath = normalizeFolder(current);
      for (const entry of entries) {
        const appPath = toAppPath(entry.pathname, root);
        if (appPath === null) continue;
        if (entry.isCollection) this.knownFolders.add(normalizeFolder(appPath));
        if (normalizeFolder(appPath) === selfPath) continue;
        if (!entry.isCollection) {
          files.push(toFileInfo(appPath, entry));
        } else if (options.recursive) {
          pending.push(appPath);
        }
      }
    }
    return files;
  }

  /**
   * One level of a folder. A missing folder lists as empty: only the
   * requested root can be missing, since deeper folders came from a listing.
   */
  private async listFolder(
    creds: NextcloudCredentials,
    folderPath: string
  ): Promise<DavEntry[]> {
    try {
      const entries = await davPropfind(
        creds,
        buildDavUrl(creds, folderPath),
        1,
        this.fetchFn
      );
      // A folder that lists exists, and so does every folder above it
      for (const folder of ancestorsOf(folderPath)) {
        this.knownFolders.add(folder);
      }
      return entries;
    } catch (error) {
      if (error instanceof WebDavError && error.isNotFound) return [];
      this.rethrow(error, folderPath);
    }
  }

  async stat(path: string): Promise<RemoteFileInfo | null> {
    const creds = await this.getCredentials();
    try {
      const entries = await davPropfind(
        creds,
        buildDavUrl(creds, path),
        0,
        this.fetchFn
      );
      const entry = entries[0];
      if (!entry || entry.isCollection) return null;
      return toFileInfo(path, entry);
    } catch (error) {
      if (error instanceof WebDavError && error.isNotFound) return null;
      this.rethrow(error, path);
    }
    return null;
  }

  async get(path: string): Promise<RemoteFile> {
    const creds = await this.getCredentials();
    try {
      const result = await davGet(
        creds,
        buildDavUrl(creds, path),
        this.fetchFn
      );
      return {
        path,
        version: result.etag,
        size: result.content.byteLength,
        modifiedAt: result.modifiedAt,
        content: result.content,
      };
    } catch (error) {
      this.rethrow(error, path);
    }
    throw new RemoteFileNotFoundError(path);
  }

  async put(
    path: string,
    content: Uint8Array | string,
    options: { ifVersion?: string } = {}
  ): Promise<RemoteFileInfo> {
    const creds = await this.getCredentials();
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const url = buildDavUrl(creds, path);
    const upload = (): Promise<{ etag: string }> =>
      davPut(creds, url, bytes, { ifMatch: options.ifVersion }, this.fetchFn);
    try {
      let result: { etag: string };
      // A folder we have not seen yet: create it up front rather than paying
      // for a PUT that is bound to fail first
      if (!this.knownFolders.has(parentFolder(path))) {
        await this.ensureParentFolders(creds, path);
      }
      try {
        result = await upload();
      } catch (error) {
        // RFC 4918 says 409 for a missing parent collection; Nextcloud answers
        // 404 instead. Either way: create the folders and try once more.
        if (!(
          error instanceof WebDavError &&
          (error.isMissingParent || error.isNotFound)
        )) {
          throw error;
        }
        // The folder we believed in is gone (deleted on the server); forget
        // the whole ancestry and rebuild it
        this.forgetFolders(path);
        await this.ensureParentFolders(creds, path);
        result = await upload();
      }
      let version = result.etag;
      if (!version) {
        // A proxy stripped the ETag; ask for it so the sync record stays exact
        const info = await this.stat(path);
        version = info?.version ?? '';
      }
      return {
        path,
        version,
        size: bytes.byteLength,
        modifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.rethrow(error, path);
    }
    throw new RemoteFileNotFoundError(path);
  }

  async delete(path: string): Promise<void> {
    const creds = await this.getCredentials();
    try {
      await davDelete(creds, buildDavUrl(creds, path), this.fetchFn);
    } catch (error) {
      if (error instanceof WebDavError && error.isNotFound) return;
      this.rethrow(error, path);
    }
  }

  /** Drop a file's parent folder and all its ancestors from the cache */
  private forgetFolders(filePath: string): void {
    for (const folder of ancestorsOf(parentFolder(filePath))) {
      this.knownFolders.delete(folder);
    }
  }

  /** MKCOL every folder from the app root down to the file's parent */
  private async ensureParentFolders(
    creds: NextcloudCredentials,
    filePath: string
  ): Promise<void> {
    const segments = filePath.split('/').filter(Boolean);
    segments.pop();
    // The app folder itself first ("/" resolves to it), then each ancestor;
    // folders already known to exist are skipped
    const folders = ['/'];
    let current = '';
    for (const segment of segments) {
      current += `/${segment}`;
      folders.push(current);
    }
    for (const folder of folders) {
      if (this.knownFolders.has(folder)) continue;
      await davMkcol(creds, buildDavUrl(creds, folder), this.fetchFn);
      this.knownFolders.add(folder);
    }
  }

  /** Map WebDAV errors onto the provider-neutral error types */
  private rethrow(error: unknown, path: string): never {
    if (error instanceof WebDavError) {
      if (error.isAuthError) throw new RemoteAuthError();
      if (error.isRateLimited) {
        throw new RemoteRateLimitError((error.retryAfterSeconds ?? 10) * 1000);
      }
      if (error.isPreconditionFailed) throw new RemoteConflictError(path);
      if (error.isNotFound) throw new RemoteFileNotFoundError(path);
    }
    throw error;
  }
}

function toFileInfo(appPath: string, entry: DavEntry): RemoteFileInfo {
  return {
    path: appPath,
    version: entry.etag,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
  };
}

/** A folder and every folder above it, root first: "/", "/a", "/a/b" */
function ancestorsOf(folderPath: string): string[] {
  const out = ['/'];
  let current = '';
  for (const segment of folderPath.split('/').filter(Boolean)) {
    current += `/${segment}`;
    out.push(current);
  }
  return out;
}

/** The app-relative folder that holds a file path ("/" for top-level files) */
function parentFolder(path: string): string {
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join('/')}` : '/';
}

/** "/a/b/" and "/a/b" are the same folder; "/" is the app folder root */
function normalizeFolder(path: string): string {
  const trimmed = stripTrailingSlashes(path);
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Translate a decoded server pathname into an app-folder-relative path, or
 * null when it lies outside the Inkweld folder.
 */
function toAppPath(pathname: string, appRoot: string): string | null {
  const rootNoSlash = stripTrailingSlashes(appRoot);
  if (pathname === rootNoSlash || pathname === appRoot) return '/';
  if (!pathname.startsWith(appRoot)) return null;
  const rest = stripTrailingSlashes(pathname.slice(appRoot.length));
  return `/${rest}`;
}

export { NEXTCLOUD_APP_FOLDER } from './webdav-api';
