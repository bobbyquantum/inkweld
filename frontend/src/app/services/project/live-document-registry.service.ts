import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type * as Y from 'yjs';

/**
 * ProseMirror-free view of the documents that currently have a live
 * connection, plus the local-edit stream.
 *
 * `DocumentService` owns connections and the editor (ProseMirror, y-prosemirror
 * and every editor plugin hang off it). Anything that only needs to know
 * "is this document open, and if so which Y.Doc is it?" — Cloud Sync, the
 * auto-snapshot scheduler — must depend on this registry instead, otherwise
 * the whole editor stack becomes statically reachable from `main.ts` and
 * ships in the initial bundle. `DocumentService` writes here; nothing else
 * does.
 */
@Injectable({
  providedIn: 'root',
})
export class LiveDocumentRegistryService {
  private readonly liveDocs = new Map<string, Y.Doc>();

  /**
   * Emits the document ID whenever a document receives a local edit (from
   * ProseMirror or programmatically), excluding IndexedDB loads and remote
   * WebSocket updates.
   */
  readonly localEdit$ = new Subject<string>();

  /** Called by DocumentService when a connection is created. */
  register(documentId: string, ydoc: Y.Doc): void {
    this.liveDocs.set(documentId, ydoc);
  }

  /** Called by DocumentService when a connection is torn down. */
  unregister(documentId: string): void {
    this.liveDocs.delete(documentId);
  }

  /** Called by DocumentService when every connection is torn down. */
  clear(): void {
    this.liveDocs.clear();
  }

  /** Whether an editor currently has this document open. */
  hasConnection(documentId: string): boolean {
    return this.liveDocs.has(documentId);
  }

  /**
   * The live Y.Doc for a document that currently has an open connection
   * (an editor is showing it), or null. Cloud sync applies remote updates to
   * the live doc so open editors reflect them immediately, and falls back to
   * a headless IndexedDB load otherwise.
   */
  getConnectedYDoc(documentId: string): Y.Doc | null {
    return this.liveDocs.get(documentId) ?? null;
  }

  /**
   * Whether a document has persisted content available locally, either via an
   * active collaboration connection or Yjs updates in IndexedDB. Never creates
   * an empty database shell, so it is safe to call for documents that have not
   * been synced to this device.
   */
  hasLocalContent(documentId: string): Promise<boolean> {
    if (this.liveDocs.has(documentId)) {
      return Promise.resolve(true);
    }
    return this.checkDocumentHasContent(documentId);
  }

  private checkDocumentHasContent(documentId: string): Promise<boolean> {
    return new Promise(resolve => {
      try {
        const request = indexedDB.open(documentId);

        // onupgradeneeded fires when the DB doesn't exist (version 0 → 1)
        // Aborting prevents creating an empty shell database
        request.onupgradeneeded = event => {
          (event.target as IDBOpenDBRequest).transaction?.abort();
        };

        request.onsuccess = () => {
          const db = request.result;

          // No object stores means no schema - definitely empty
          if (db.objectStoreNames.length === 0) {
            db.close();
            resolve(false);
            return;
          }

          // y-indexeddb stores persisted updates in the 'updates' store.
          // A schema-only database (created but never synced) has the store
          // but zero records. Check for at least one record.
          const storeName = 'updates';
          if (!db.objectStoreNames.contains(storeName)) {
            // Unexpected schema - treat as having content to be safe
            db.close();
            resolve(true);
            return;
          }

          try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const countRequest = store.count();

            countRequest.onsuccess = () => {
              db.close();
              resolve(countRequest.result > 0);
            };
            countRequest.onerror = () => {
              db.close();
              resolve(false);
            };
          } catch {
            db.close();
            resolve(false);
          }
        };

        // Covers both real errors and the AbortError from onupgradeneeded
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
}
