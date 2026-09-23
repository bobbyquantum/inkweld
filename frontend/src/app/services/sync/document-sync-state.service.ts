import { inject, Injectable } from '@angular/core';
import { StorageContextService } from '@services/core/storage-context.service';

const DB_BASE_NAME = 'inkweld-document-sync-state';
const STORE_NAME = 'documents';

function toError(reason: DOMException | null): Error {
  return reason ?? new Error('IndexedDB request failed');
}

/**
 * What this device last synced for one server document.
 *
 * `serverRevision` is the opaque token the server reported for the document at
 * the moment of our last successful sync (see the backend's per-document
 * revision manifest). `stateDigest` is base64 of the document's Yjs state
 * vector after that same sync, so "has anything changed locally since" is a
 * cheap string comparison with no network round trip.
 *
 * Bulk sync skips a document only when BOTH match again: the server revision is
 * unchanged (nobody else edited it) and the local state vector is unchanged
 * (this device has no unsynced edits). Missing either forces a sync.
 */
export interface DocumentSyncRecord {
  /** Server document id (`username:slug:elementId`). */
  documentId: string;
  serverRevision: string | null;
  stateDigest: string;
  syncedAt: string;
}

/**
 * Per-device bookkeeping for the bulk document-sync manifest, kept in a
 * prefixed IndexedDB so each connected account tracks its own revision map.
 *
 * This is the durable half of the sync fast path: without it, "locally clean
 * and unchanged on the server" is indistinguishable from "edited offline and
 * never pushed", so no document could ever be skipped safely.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentSyncStateService {
  private readonly storageContext = inject(StorageContextService);
  /**
   * One connection per account database, keyed by prefixed name. Each call
   * resolves the name for the *current* context, so an open that finishes
   * after an account switch can never hand one account's handle to another.
   */
  private readonly connections = new Map<string, Promise<IDBDatabase>>();

  async get(documentId: string): Promise<DocumentSyncRecord | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(documentId);
      request.onsuccess = () =>
        resolve((request.result as DocumentSyncRecord | undefined) ?? null);
      request.onerror = () => reject(toError(request.error));
    });
  }

  /** Read records for many documents in one transaction. */
  async getMany(
    documentIds: string[]
  ): Promise<Map<string, DocumentSyncRecord>> {
    const found = new Map<string, DocumentSyncRecord>();
    if (documentIds.length === 0) return found;

    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const store = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME);
      let remaining = documentIds.length;
      for (const documentId of documentIds) {
        const request = store.get(documentId);
        request.onsuccess = () => {
          const record = request.result as DocumentSyncRecord | undefined;
          if (record) found.set(record.documentId, record);
          if (--remaining === 0) resolve(found);
        };
        request.onerror = () => reject(toError(request.error));
      }
    });
  }

  async set(record: DocumentSyncRecord): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
    });
  }

  /** Write many records in a single transaction (used after a batch sync). */
  async setMany(records: DocumentSyncRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
    });
  }

  /** Forget a document's sync bookkeeping (e.g. after it is deleted). */
  async delete(documentId: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(documentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
    });
  }

  private ensureDb(): Promise<IDBDatabase> {
    const name = this.storageContext.prefixDbName(DB_BASE_NAME);
    let connection = this.connections.get(name);
    if (!connection) {
      connection = this.open(name);
      this.connections.set(name, connection);
      // A failed open is retried on the next call.
      connection.catch(() => this.connections.delete(name));
    }
    return connection;
  }

  private open(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Let an account's databases be deleted (sign-out, account removal)
        // without this handle blocking it; the next call reopens.
        db.onversionchange = () => {
          db.close();
          this.connections.delete(name);
        };
        resolve(db);
      };
      request.onerror = () => reject(toError(request.error));
    });
  }
}
