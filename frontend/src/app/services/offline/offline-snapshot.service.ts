import { inject, Injectable, signal } from '@angular/core';

import { LoggerService } from '../core/logger.service';
import { StorageConfig, StorageService } from './storage.service';

/**
 * Stored snapshot record in IndexedDB
 *
 * Snapshots store document CONTENT (not Yjs state), enabling proper
 * CRDT-compliant restore operations using forward-only updates.
 */
export interface StoredSnapshot {
  /** Composite key: "projectKey:documentId:snapshotId" */
  id: string;
  /** Project key: "username/slug" */
  projectKey: string;
  /** Document element ID */
  documentId: string;
  /** User-provided snapshot name */
  name: string;
  /** Optional description */
  description?: string;
  /**
   * Document content as XML string.
   * This is the serialized ProseMirror/Yjs content that can be
   * restored using forward CRDT operations.
   */
  xmlContent: string;
  /**
   * Worldbuilding data as plain JSON (for worldbuilding elements).
   * Stored as JSON, restored using forward CRDT map operations.
   */
  worldbuildingData?: Record<string, unknown>;
  /** Word count at time of snapshot */
  wordCount?: number;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** When this snapshot was created (ISO string) */
  createdAt: string;
  /** Whether this snapshot has been synced to server */
  synced: boolean;
  /** Server-assigned ID (once synced) */
  serverId?: string;
}

/**
 * Lightweight snapshot info (without blob data) for listing
 */
export interface SnapshotInfo {
  id: string;
  documentId: string;
  name: string;
  description?: string;
  wordCount?: number;
  createdAt: string;
  synced: boolean;
  serverId?: string;
}

/**
 * Options for creating a snapshot
 */
export interface CreateSnapshotOptions {
  name: string;
  description?: string;
  /** Document content as XML string */
  xmlContent: string;
  /** Worldbuilding data as plain JSON (for worldbuilding elements) */
  worldbuildingData?: Record<string, unknown>;
  /** Word count at time of snapshot */
  wordCount?: number;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

const SNAPSHOT_DB_CONFIG: StorageConfig = {
  dbName: 'inkweld-snapshots',
  version: 1,
  stores: {
    snapshots: 'id', // Primary store, keyed by composite "projectKey:documentId:snapshotId"
  },
};

const STORE_NAME = 'snapshots';

/**
 * Service for storing and retrieving document snapshots in IndexedDB.
 *
 * Snapshots are stored locally and can be synced to the server when online.
 * This enables offline snapshot creation and restoration.
 *
 * Key format: "projectKey:documentId:snapshotId" where:
 * - projectKey = "username/slug"
 * - documentId = element ID of the document
 * - snapshotId = UUID generated on creation
 *
 * @example
 * ```typescript
 * // Create a snapshot
 * const snapshot = await offlineSnapshot.createSnapshot('alice/my-novel', 'doc-123', {
 *   name: 'Chapter 1 draft',
 *   xmlContent: '<article>...</article>',
 *   wordCount: 1500,
 * });
 *
 * // List snapshots for a document
 * const snapshots = await offlineSnapshot.listSnapshots('alice/my-novel', 'doc-123');
 *
 * // Get full snapshot for restore
 * const full = await offlineSnapshot.getSnapshot('alice/my-novel', 'doc-123', snapshotId);
 *
 * // Delete a snapshot
 * await offlineSnapshot.deleteSnapshot('alice/my-novel', 'doc-123', snapshotId);
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class OfflineSnapshotService {
  private storageService = inject(StorageService);
  private logger = inject(LoggerService);
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /** Signal indicating sync status */
  readonly hasPendingSync = signal(false);

  /**
   * Initialize the snapshot database. Called automatically on first use.
   */
  private async ensureDb(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.storageService
      .initializeDatabase(SNAPSHOT_DB_CONFIG)
      .then(db => {
        this.db = db;
        return db;
      });

    return this.initPromise;
  }

  /**
   * Generate a composite key for a snapshot
   */
  private makeKey(
    projectKey: string,
    documentId: string,
    snapshotId: string
  ): string {
    return `${projectKey}:${documentId}:${snapshotId}`;
  }

  /**
   * Create a new snapshot for a document.
   *
   * @param projectKey Project key in format "username/slug"
   * @param documentId Document element ID
   * @param options Snapshot data
   * @returns The created snapshot
   */
  async createSnapshot(
    projectKey: string,
    documentId: string,
    options: CreateSnapshotOptions
  ): Promise<StoredSnapshot> {
    const db = await this.ensureDb();
    const snapshotId = crypto.randomUUID();
    const id = this.makeKey(projectKey, documentId, snapshotId);

    const snapshot: StoredSnapshot = {
      id,
      projectKey,
      documentId,
      name: options.name,
      description: options.description,
      xmlContent: options.xmlContent,
      worldbuildingData: options.worldbuildingData,
      wordCount: options.wordCount,
      metadata: options.metadata,
      createdAt: new Date().toISOString(),
      synced: false,
    };

    await this.storageService.put(db, STORE_NAME, snapshot);
    this.logger.debug(
      'OfflineSnapshot',
      `Created snapshot ${snapshotId} for ${projectKey}/${documentId}`
    );

    void this.updatePendingSync();
    return snapshot;
  }

  /**
   * Get a single snapshot by ID.
   *
   * @param projectKey Project key
   * @param documentId Document element ID
   * @param snapshotId Snapshot UUID
   * @returns The snapshot or undefined
   */
  async getSnapshot(
    projectKey: string,
    documentId: string,
    snapshotId: string
  ): Promise<StoredSnapshot | undefined> {
    const db = await this.ensureDb();
    const id = this.makeKey(projectKey, documentId, snapshotId);
    return this.storageService.get<StoredSnapshot>(db, STORE_NAME, id);
  }

  /**
   * Get a snapshot by its composite ID directly.
   *
   * @param id Composite snapshot ID
   * @returns The snapshot or undefined
   */
  async getSnapshotById(id: string): Promise<StoredSnapshot | undefined> {
    const db = await this.ensureDb();
    return this.storageService.get<StoredSnapshot>(db, STORE_NAME, id);
  }

  /**
   * List all snapshots for a specific document.
   *
   * @param projectKey Project key
   * @param documentId Document element ID
   * @returns Array of snapshot info (without blob data)
   */
  async listSnapshotsForDocument(
    projectKey: string,
    documentId: string
  ): Promise<SnapshotInfo[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as StoredSnapshot[];
        const prefix = `${projectKey}:${documentId}:`;

        const filtered = all
          .filter(s => s.id.startsWith(prefix))
          .map(s => ({
            id: s.id,
            documentId: s.documentId,
            name: s.name,
            description: s.description,
            wordCount: s.wordCount,
            createdAt: s.createdAt,
            synced: s.synced,
            serverId: s.serverId,
          }))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        resolve(filtered);
      };

      request.onerror = () =>
        reject(new Error(request.error?.message ?? 'Request failed'));
      transaction.onerror = () =>
        reject(new Error(transaction.error?.message ?? 'Transaction failed'));
    });
  }

  /**
   * List all snapshots for a project.
   *
   * @param projectKey Project key
   * @returns Array of snapshot info
   */
  async listSnapshotsForProject(projectKey: string): Promise<SnapshotInfo[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as StoredSnapshot[];
        const prefix = `${projectKey}:`;

        const filtered = all
          .filter(s => s.id.startsWith(prefix))
          .map(s => ({
            id: s.id,
            documentId: s.documentId,
            name: s.name,
            description: s.description,
            wordCount: s.wordCount,
            createdAt: s.createdAt,
            synced: s.synced,
            serverId: s.serverId,
          }))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        resolve(filtered);
      };

      request.onerror = () =>
        reject(new Error(request.error?.message ?? 'Request failed'));
      transaction.onerror = () =>
        reject(new Error(transaction.error?.message ?? 'Transaction failed'));
    });
  }

  /**
   * Get all unsynced snapshots (for sync to server).
   *
   * @returns Array of full snapshot records that need syncing
   */
  async getUnsyncedSnapshots(): Promise<StoredSnapshot[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as StoredSnapshot[];
        resolve(all.filter(s => !s.synced));
      };

      request.onerror = () =>
        reject(new Error(request.error?.message ?? 'Request failed'));
      transaction.onerror = () =>
        reject(new Error(transaction.error?.message ?? 'Transaction failed'));
    });
  }

  /**
   * Mark a snapshot as synced to server.
   *
   * @param id Composite snapshot ID
   * @param serverId Server-assigned ID
   */
  async markSynced(id: string, serverId: string): Promise<void> {
    const db = await this.ensureDb();
    const snapshot = await this.storageService.get<StoredSnapshot>(
      db,
      STORE_NAME,
      id
    );

    if (snapshot) {
      snapshot.synced = true;
      snapshot.serverId = serverId;
      await this.storageService.put(db, STORE_NAME, snapshot);
      void this.updatePendingSync();
    }
  }

  /**
   * Delete a snapshot.
   *
   * @param projectKey Project key
   * @param documentId Document element ID
   * @param snapshotId Snapshot UUID
   */
  async deleteSnapshot(
    projectKey: string,
    documentId: string,
    snapshotId: string
  ): Promise<void> {
    const db = await this.ensureDb();
    const id = this.makeKey(projectKey, documentId, snapshotId);
    await this.storageService.delete(db, STORE_NAME, id);
    this.logger.debug('OfflineSnapshot', `Deleted snapshot ${snapshotId}`);
    void this.updatePendingSync();
  }

  /**
   * Delete a snapshot by its composite ID.
   *
   * @param id Composite snapshot ID
   */
  async deleteSnapshotById(id: string): Promise<void> {
    const db = await this.ensureDb();
    await this.storageService.delete(db, STORE_NAME, id);
    this.logger.debug('OfflineSnapshot', `Deleted snapshot ${id}`);
    void this.updatePendingSync();
  }

  /**
   * Delete all snapshots for a project.
   *
   * @param projectKey Project key
   */
  async deleteAllForProject(projectKey: string): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as StoredSnapshot[];
        const prefix = `${projectKey}:`;
        const toDelete = all.filter(s => s.id.startsWith(prefix));

        // Delete each matching snapshot
        const deletePromises = toDelete.map(
          s =>
            new Promise<void>((res, rej) => {
              const deleteReq = store.delete(s.id);
              deleteReq.onsuccess = () => res();
              deleteReq.onerror = () =>
                rej(new Error(deleteReq.error?.message ?? 'Delete failed'));
            })
        );

        Promise.all(deletePromises)
          .then(() => {
            this.logger.debug(
              'OfflineSnapshot',
              `Deleted ${toDelete.length} snapshots for ${projectKey}`
            );
            void this.updatePendingSync();
            resolve();
          })
          .catch(reject);
      };

      request.onerror = () =>
        reject(new Error(request.error?.message ?? 'Request failed'));
      transaction.onerror = () =>
        reject(new Error(transaction.error?.message ?? 'Transaction failed'));
    });
  }

  /**
   * Import a snapshot from archive data (e.g., during project import).
   *
   * @param projectKey Project key
   * @param snapshot Snapshot data from archive
   */
  async importSnapshot(
    projectKey: string,
    snapshot: {
      documentId: string;
      name: string;
      description?: string;
      /** XML content string */
      xmlContent?: string;
      /** Worldbuilding data as JSON */
      worldbuildingData?: Record<string, unknown>;
      wordCount?: number;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }
  ): Promise<StoredSnapshot> {
    const db = await this.ensureDb();
    const snapshotId = crypto.randomUUID();
    const id = this.makeKey(projectKey, snapshot.documentId, snapshotId);

    const stored: StoredSnapshot = {
      id,
      projectKey,
      documentId: snapshot.documentId,
      name: snapshot.name,
      description: snapshot.description,
      xmlContent: snapshot.xmlContent ?? '',
      worldbuildingData: snapshot.worldbuildingData,
      wordCount: snapshot.wordCount,
      metadata: snapshot.metadata,
      createdAt: snapshot.createdAt,
      synced: false, // Will need to sync to server when online
    };

    await this.storageService.put(db, STORE_NAME, stored);
    this.logger.debug(
      'OfflineSnapshot',
      `Imported snapshot ${snapshotId} for ${projectKey}/${snapshot.documentId}`
    );

    void this.updatePendingSync();
    return stored;
  }

  /**
   * Get all snapshots for export (full data).
   *
   * @param projectKey Project key
   * @returns Array of full snapshot records
   */
  async getSnapshotsForExport(projectKey: string): Promise<StoredSnapshot[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as StoredSnapshot[];
        const prefix = `${projectKey}:`;
        const filtered = all
          .filter(s => s.id.startsWith(prefix))
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        resolve(filtered);
      };

      request.onerror = () =>
        reject(new Error(request.error?.message ?? 'Request failed'));
      transaction.onerror = () =>
        reject(new Error(transaction.error?.message ?? 'Transaction failed'));
    });
  }

  /**
   * Update the pending sync signal by checking for unsynced snapshots.
   */
  private async updatePendingSync(): Promise<void> {
    try {
      const unsynced = await this.getUnsyncedSnapshots();
      this.hasPendingSync.set(unsynced.length > 0);
    } catch (err) {
      this.logger.warn(
        'OfflineSnapshot',
        'Failed to check pending sync status',
        err
      );
    }
  }
}
