import { inject, Injectable, signal } from '@angular/core';

import { StorageConfig, StorageService } from './storage.service';

/**
 * Sync state for a project
 */
export interface ProjectSyncState {
  /** Project identifier: "username/slug" */
  projectKey: string;
  /** Last successful full sync timestamp (ISO string) */
  lastSync: string | null;
  /** Media IDs that were created/modified offline and need uploading */
  pendingUploads: string[];
  /** Current sync status */
  status: 'synced' | 'pending' | 'syncing' | 'error' | 'offline-only';
  /** Last error message if status is 'error' */
  lastError?: string;
}

const SYNC_DB_CONFIG: StorageConfig = {
  dbName: 'inkweld-sync',
  version: 1,
  stores: {
    'sync-state': 'projectKey', // Keyed by "username/slug"
  },
};

const STORE_NAME = 'sync-state';

/**
 * Service for tracking sync state between offline and online storage.
 *
 * This service:
 * - Tracks which media needs to be uploaded when going online
 * - Persists sync state to IndexedDB
 * - Provides signals for reactive UI updates
 *
 * @example
 * ```typescript
 * // Mark a media item as pending upload
 * syncService.markPendingUpload('alice/my-novel', 'cover');
 *
 * // Check if project has pending changes
 * if (syncService.hasPendingChanges('alice/my-novel')) {
 *   await syncService.syncProject('alice/my-novel', 'up');
 * }
 *
 * // Get reactive sync state
 * const state = syncService.getSyncState('alice/my-novel');
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectSyncService {
  private storageService = inject(StorageService);
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /** In-memory cache of sync states */
  private syncStates = new Map<
    string,
    ReturnType<typeof signal<ProjectSyncState>>
  >();

  /**
   * Initialize the sync database
   */
  private async ensureDb(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.storageService
      .initializeDatabase(SYNC_DB_CONFIG)
      .then(db => {
        this.db = db;
        return db;
      });

    return this.initPromise;
  }

  /**
   * Get or create a default sync state
   */
  private createDefaultState(projectKey: string): ProjectSyncState {
    return {
      projectKey,
      lastSync: null,
      pendingUploads: [],
      status: 'offline-only',
    };
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Get the sync state for a project (reactive signal).
   * Creates a default state if none exists.
   */
  getSyncState(
    projectKey: string
  ): ReturnType<typeof signal<ProjectSyncState>> {
    if (!this.syncStates.has(projectKey)) {
      const defaultState = this.createDefaultState(projectKey);
      this.syncStates.set(projectKey, signal(defaultState));

      // Load from IndexedDB asynchronously
      void this.loadSyncState(projectKey);
    }

    return this.syncStates.get(projectKey)!;
  }

  /**
   * Check if a project has pending changes that need syncing
   */
  hasPendingChanges(projectKey: string): boolean {
    const state = this.syncStates.get(projectKey);
    return (state?.().pendingUploads.length ?? 0) > 0;
  }

  /**
   * Mark a media item as needing upload when going online.
   * Call this when creating/modifying media in offline mode.
   */
  async markPendingUpload(projectKey: string, mediaId: string): Promise<void> {
    const state = this.getSyncState(projectKey);
    const current = state();

    if (!current.pendingUploads.includes(mediaId)) {
      const updated: ProjectSyncState = {
        ...current,
        pendingUploads: [...current.pendingUploads, mediaId],
        status: 'pending',
      };
      state.set(updated);
      await this.saveSyncState(updated);
    }
  }

  /**
   * Remove a media item from pending uploads.
   * Call this after successfully uploading.
   */
  async clearPendingUpload(projectKey: string, mediaId: string): Promise<void> {
    const state = this.getSyncState(projectKey);
    const current = state();

    const updated: ProjectSyncState = {
      ...current,
      pendingUploads: current.pendingUploads.filter(id => id !== mediaId),
      status: current.pendingUploads.length <= 1 ? 'synced' : current.status,
    };
    state.set(updated);
    await this.saveSyncState(updated);
  }

  /**
   * Mark all pending uploads as completed.
   * Call this after a successful full sync.
   */
  async markSynced(projectKey: string): Promise<void> {
    const state = this.getSyncState(projectKey);

    const updated: ProjectSyncState = {
      ...state(),
      lastSync: new Date().toISOString(),
      pendingUploads: [],
      status: 'synced',
      lastError: undefined,
    };
    state.set(updated);
    await this.saveSyncState(updated);
  }

  /**
   * Mark a sync as failed
   */
  async markSyncError(projectKey: string, error: string): Promise<void> {
    const state = this.getSyncState(projectKey);

    const updated: ProjectSyncState = {
      ...state(),
      status: 'error',
      lastError: error,
    };
    state.set(updated);
    await this.saveSyncState(updated);
  }

  /**
   * Mark a sync as in progress
   */
  markSyncing(projectKey: string): void {
    const state = this.getSyncState(projectKey);

    const updated: ProjectSyncState = {
      ...state(),
      status: 'syncing',
    };
    state.set(updated);
    // Don't persist syncing status - it's transient
  }

  /**
   * Get all projects that have pending uploads
   */
  async getProjectsWithPendingChanges(): Promise<string[]> {
    const db = await this.ensureDb();

    return new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: string[] = [];

      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const state = cursor.value as ProjectSyncState;
          if (state.pendingUploads.length > 0) {
            results.push(state.projectKey);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () =>
        reject(
          new Error(
            `Failed to get projects with pending changes: ${request.error?.message}`
          )
        );
    });
  }

  /**
   * Delete sync state for a project.
   * Call this when deleting a project.
   */
  async deleteSyncState(projectKey: string): Promise<void> {
    const db = await this.ensureDb();
    await this.storageService.delete(db, STORE_NAME, projectKey);
    this.syncStates.delete(projectKey);
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Load sync state from IndexedDB
   */
  private async loadSyncState(projectKey: string): Promise<void> {
    try {
      const db = await this.ensureDb();
      const stored = await this.storageService.get<ProjectSyncState>(
        db,
        STORE_NAME,
        projectKey
      );

      if (stored) {
        const state = this.syncStates.get(projectKey);
        if (state) {
          state.set(stored);
        }
      }
    } catch (error) {
      console.error(`Failed to load sync state for ${projectKey}:`, error);
    }
  }

  /**
   * Save sync state to IndexedDB
   */
  private async saveSyncState(state: ProjectSyncState): Promise<void> {
    try {
      const db = await this.ensureDb();
      await this.storageService.put(db, STORE_NAME, state);
    } catch (error) {
      console.error(
        `Failed to save sync state for ${state.projectKey}:`,
        error
      );
    }
  }
}
