import { stripTrailingSlashes } from '@utils/string-utils';

import {
  RemoteAuthError,
  RemoteConflictError,
  type RemoteFile,
  type RemoteFileInfo,
  RemoteFileNotFoundError,
  type RemoteStore,
} from '../remote-store.interface';
import {
  DropboxApiError,
  dropboxDownload,
  type DropboxFileMetadata,
  dropboxRpc,
  dropboxUpload,
} from './dropbox-api';

/** Supplies a valid access token, refreshing it when necessary */
export type AccessTokenProvider = () => Promise<string>;

interface ListFolderResult {
  entries: DropboxFileMetadata[];
  cursor: string;
  has_more: boolean;
}

function toFileInfo(meta: DropboxFileMetadata): RemoteFileInfo {
  return {
    path: meta.path_display ?? meta.path_lower ?? `/${meta.name}`,
    version: meta.rev ?? '',
    size: meta.size ?? 0,
    modifiedAt: meta.server_modified,
  };
}

/**
 * RemoteStore backed by a Dropbox app folder.
 *
 * Every call obtains the access token through `getAccessToken`, which is
 * responsible for refreshing it, so the store itself is stateless.
 */
export class DropboxRemoteStore implements RemoteStore {
  constructor(
    private readonly getAccessToken: AccessTokenProvider,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async list(
    folderPath: string,
    options: { recursive?: boolean } = {}
  ): Promise<RemoteFileInfo[]> {
    const token = await this.getAccessToken();
    // Dropbox wants "" for the app-folder root, not "/"
    const path = folderPath === '/' ? '' : stripTrailingSlashes(folderPath);
    const files: RemoteFileInfo[] = [];
    try {
      let result = await dropboxRpc<ListFolderResult>(
        token,
        '/files/list_folder',
        {
          path,
          recursive: options.recursive === true,
          include_deleted: false,
        },
        this.fetchFn
      );
      for (;;) {
        for (const entry of result.entries) {
          if (entry['.tag'] === 'file') files.push(toFileInfo(entry));
        }
        if (!result.has_more) break;
        result = await dropboxRpc<ListFolderResult>(
          token,
          '/files/list_folder/continue',
          { cursor: result.cursor },
          this.fetchFn
        );
      }
    } catch (error) {
      this.rethrow(error, folderPath, { notFoundAsEmpty: true });
    }
    return files;
  }

  async stat(path: string): Promise<RemoteFileInfo | null> {
    const token = await this.getAccessToken();
    try {
      const meta = await dropboxRpc<DropboxFileMetadata>(
        token,
        '/files/get_metadata',
        { path },
        this.fetchFn
      );
      return meta['.tag'] === 'file' ? toFileInfo(meta) : null;
    } catch (error) {
      if (error instanceof DropboxApiError && error.isNotFound) return null;
      this.rethrow(error, path);
    }
    return null;
  }

  async get(path: string): Promise<RemoteFile> {
    const token = await this.getAccessToken();
    try {
      const { metadata, content } = await dropboxDownload(
        token,
        path,
        this.fetchFn
      );
      return { ...toFileInfo(metadata), content };
    } catch (error) {
      this.rethrow(error, path);
    }
    // rethrow always throws; this satisfies the return type
    throw new RemoteFileNotFoundError(path);
  }

  async put(
    path: string,
    content: Uint8Array | string,
    options: { ifVersion?: string } = {}
  ): Promise<RemoteFileInfo> {
    const token = await this.getAccessToken();
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content;
    try {
      const meta = await dropboxUpload(
        token,
        path,
        bytes,
        { updateRev: options.ifVersion },
        this.fetchFn
      );
      return toFileInfo(meta);
    } catch (error) {
      this.rethrow(error, path);
    }
    throw new RemoteFileNotFoundError(path);
  }

  async delete(path: string): Promise<void> {
    const token = await this.getAccessToken();
    try {
      await dropboxRpc(token, '/files/delete_v2', { path }, this.fetchFn);
    } catch (error) {
      if (error instanceof DropboxApiError && error.isNotFound) return;
      this.rethrow(error, path);
    }
  }

  /** Map Dropbox errors onto the provider-neutral error types */
  private rethrow(
    error: unknown,
    path: string,
    options: { notFoundAsEmpty?: boolean } = {}
  ): never | undefined {
    if (error instanceof DropboxApiError) {
      if (error.isAuthError) throw new RemoteAuthError();
      if (error.isConflict) throw new RemoteConflictError(path);
      if (error.isNotFound) {
        if (options.notFoundAsEmpty) return undefined;
        throw new RemoteFileNotFoundError(path);
      }
    }
    throw error;
  }
}
