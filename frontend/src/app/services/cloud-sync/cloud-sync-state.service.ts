import { inject, Injectable } from '@angular/core';
import { StorageContextService } from '@services/core/storage-context.service';

const DB_BASE_NAME = 'inkweld-cloud-sync';
const STORE_NAME = 'files';

function toError(reason: DOMException | null): Error {
  return reason ?? new Error('IndexedDB request failed');
}

/**
 * What this device last saw for one remote file.
 *
 * `remoteVersion` is the provider version tag after our last pull or push.
 * `localDigest` is the encoded Yjs state vector (or content hash for JSON)
 * of what we last pushed or merged, so "has anything changed locally since"
 * is a cheap string comparison with no remote round trip.
 */
export interface CloudFileRecord {
  path: string;
  remoteVersion: string;
  localDigest: string;
  syncedAt: string;
}

/**
 * Per-device bookkeeping for Cloud Sync, kept in a prefixed IndexedDB so each
 * connected account tracks its own remote folder.
 */
@Injectable({
  providedIn: 'root',
})
export class CloudSyncStateService {
  private readonly storageContext = inject(StorageContextService);
  private db: IDBDatabase | null = null;
  private dbName: string | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  async get(path: string): Promise<CloudFileRecord | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(path);
      request.onsuccess = () =>
        resolve((request.result as CloudFileRecord | undefined) ?? null);
      request.onerror = () => reject(toError(request.error));
    });
  }

  async set(record: CloudFileRecord): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
    });
  }

  async delete(path: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
    });
  }

  /** All records whose path starts with `prefix` */
  async listByPrefix(prefix: string): Promise<CloudFileRecord[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .getAll(range);
      request.onsuccess = () => resolve(request.result as CloudFileRecord[]);
      request.onerror = () => reject(toError(request.error));
    });
  }

  /** Forget every record under a prefix (project deleted or reset) */
  async deleteByPrefix(prefix: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(
        IDBKeyRange.bound(prefix, `${prefix}￿`)
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
    });
  }

  private ensureDb(): Promise<IDBDatabase> {
    const wanted = this.storageContext.prefixDbName(DB_BASE_NAME);
    if (this.db && this.dbName === wanted) return Promise.resolve(this.db);
    if (this.opening && this.dbName === wanted) return this.opening;

    // Context switched (different account): drop the old handle
    this.db?.close();
    this.db = null;
    this.dbName = wanted;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(wanted, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'path' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.opening = null;
        resolve(this.db);
      };
      request.onerror = () => {
        this.opening = null;
        reject(toError(request.error));
      };
    });
    return this.opening;
  }
}
