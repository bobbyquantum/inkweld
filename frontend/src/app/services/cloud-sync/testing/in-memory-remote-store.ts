import { stripTrailingSlashes } from '@utils/string-utils';

import {
  RemoteConflictError,
  type RemoteFile,
  type RemoteFileInfo,
  RemoteFileNotFoundError,
  type RemoteStore,
} from '../remote-store.interface';

/**
 * In-memory RemoteStore for specs. Versions are monotonically increasing
 * strings per path so `ifVersion` conflicts can be exercised.
 */
export class InMemoryRemoteStore implements RemoteStore {
  readonly files = new Map<string, { content: Uint8Array; version: number }>();
  readonly log: string[] = [];
  private counter = 0;

  seed(path: string, content: string | Uint8Array): void {
    this.files.set(path, {
      content: toBytes(content),
      version: ++this.counter,
    });
  }

  text(path: string): string | undefined {
    const file = this.files.get(path);
    return file ? new TextDecoder().decode(file.content) : undefined;
  }

  list(
    folderPath: string,
    options: { recursive?: boolean } = {}
  ): Promise<RemoteFileInfo[]> {
    this.log.push(`list ${folderPath}${options.recursive ? ' -r' : ''}`);
    const prefix =
      folderPath === '/' ? '/' : `${stripTrailingSlashes(folderPath)}/`;
    const out: RemoteFileInfo[] = [];
    for (const [path, file] of this.files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!options.recursive && rest.includes('/')) continue;
      out.push(this.info(path, file));
    }
    return Promise.resolve(out);
  }

  stat(path: string): Promise<RemoteFileInfo | null> {
    const file = this.files.get(path);
    return Promise.resolve(file ? this.info(path, file) : null);
  }

  get(path: string): Promise<RemoteFile> {
    this.log.push(`get ${path}`);
    const file = this.files.get(path);
    if (!file) return Promise.reject(new RemoteFileNotFoundError(path));
    return Promise.resolve({ ...this.info(path, file), content: file.content });
  }

  put(
    path: string,
    content: Uint8Array | string,
    options: { ifVersion?: string } = {}
  ): Promise<RemoteFileInfo> {
    this.log.push(`put ${path}`);
    const existing = this.files.get(path);
    if (
      options.ifVersion !== undefined &&
      String(existing?.version ?? '') !== options.ifVersion
    ) {
      return Promise.reject(new RemoteConflictError(path));
    }
    const file = { content: toBytes(content), version: ++this.counter };
    this.files.set(path, file);
    return Promise.resolve(this.info(path, file));
  }

  delete(path: string): Promise<void> {
    this.log.push(`delete ${path}`);
    for (const key of Array.from(this.files.keys())) {
      if (key === path || key.startsWith(`${path}/`)) this.files.delete(key);
    }
    return Promise.resolve();
  }

  private info(
    path: string,
    file: { content: Uint8Array; version: number }
  ): RemoteFileInfo {
    return { path, version: String(file.version), size: file.content.length };
  }
}

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string'
    ? new TextEncoder().encode(content)
    : content;
}
