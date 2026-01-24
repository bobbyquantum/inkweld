import { inject, Injectable, signal } from '@angular/core';

import { StorageContextService } from '../core/storage-context.service';
import { StorageConfig, StorageService } from './storage.service';

/**
 * Pending project creation data stored for offline sync
 */
export interface PendingProjectCreation {
  /** Project data to create on server */
  projectData: {
    title: string;
    slug: string;
    description?: string;
  };
  /** Template ID to apply after creation (optional) */
  templateId?: string;
  /** When this was queued for creation */
  queuedAt: string;
}

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
  /** Pending metadata fields to sync (e.g., title/description) */
  pendingMetadata?: Partial<Record<'title' | 'description', string>>;
  /** Pending project creation (project created offline, not yet synced to server) */
  pendingCreation?: PendingProjectCreation;
  /** Current sync status */
  status: 'synced' | 'pending' | 'syncing' | 'error' | 'offline-only';
  /** Last error message if status is 'error' */
  lastError?: string;
}

const SYNC_DB_BASE_NAME = 'inkweld-sync';

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
  private storageContext = inject(StorageContextService);
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * Get the database config with the prefixed database name
   */
  private get dbConfig(): StorageConfig {
    return {
      dbName: this.storageContext.prefixDbName(SYNC_DB_BASE_NAME),
      version: 1,
      stores: {
        'sync-state': 'projectKey', // Keyed by "username/slug"
      },
    };
  }

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
      .initializeDatabase(this.dbConfig)
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
      pendingMetadata: undefined,
      pendingCreation: undefined,
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
    const s = state?.();
    const hasUploads = (s?.pendingUploads.length ?? 0) > 0;
    const hasMetadata =
      !!s?.pendingMetadata &&
      (s.pendingMetadata.title !== undefined ||
        s.pendingMetadata.description !== undefined);
    const hasPendingCreation = !!s?.pendingCreation;
    return hasUploads || hasMetadata || hasPendingCreation;
  }

  /**
   * Check if a project has a pending creation (created offline, not yet synced)
   */
  hasPendingCreation(projectKey: string): boolean {
    const state = this.syncStates.get(projectKey);
    return !!state?.()?.pendingCreation;
  }

  /**
   * Mark a project as pending creation (created offline, needs to sync to server).
   * Call this when creating a project while the server is unavailable.
   */
  async markPendingCreation(
    projectKey: string,
    projectData: { title: string; slug: string; description?: string },
    templateId?: string
  ): Promise<void> {
    const state = this.getSyncState(projectKey);
    const current = state();

    const updated: ProjectSyncState = {
      ...current,
      pendingCreation: {
        projectData,
        templateId,
        queuedAt: new Date().toISOString(),
      },
      status: 'pending',
    };
    state.set(updated);
    await this.saveSyncState(updated);
  }

  /**
   * Clear pending creation after successful sync to server.
   */
  async clearPendingCreation(projectKey: string): Promise<void> {
    const state = this.getSyncState(projectKey);
    const current = state();

    const updated: ProjectSyncState = {
      ...current,
      pendingCreation: undefined,
      status:
        (current.pendingUploads.length ?? 0) === 0 && !current.pendingMetadata
          ? 'synced'
          : current.status,
    };
    state.set(updated);
    await this.saveSyncState(updated);
  }

  /**
   * Get all projects that have pending creations
   */
  async getProjectsWithPendingCreations(): Promise<
    { projectKey: string; creation: PendingProjectCreation }[]
  > {
    const db = await this.ensureDb();

    return new Promise<
      { projectKey: string; creation: PendingProjectCreation }[]
    >((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: {
        projectKey: string;
        creation: PendingProjectCreation;
      }[] = [];

      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const state = cursor.value as ProjectSyncState;
          if (state.pendingCreation) {
            results.push({
              projectKey: state.projectKey,
              creation: state.pendingCreation,
            });
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () =>
        reject(
          new Error(
            `Failed to get projects with pending creations: ${request.error?.message}`
          )
        );
    });
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
   * Mark metadata fields as needing sync when going online.
   * Call this when updating title/description in offline or server-unavailable mode.
   */
  async markPendingMetadata(
    projectKey: string,
    metadata: Partial<Record<'title' | 'description', string>>
  ): Promise<void> {
    const state = this.getSyncState(projectKey);
    const current = state();

    const updated: ProjectSyncState = {
      ...current,
      pendingMetadata: { ...(current.pendingMetadata ?? {}), ...metadata },
      status: 'pending',
    };
    state.set(updated);
    await this.saveSyncState(updated);
  }

  /**
   * Clear any pending metadata fields after successful sync.
   */
  async clearPendingMetadata(projectKey: string): Promise<void> {
    const state = this.getSyncState(projectKey);
    const current = state();

    const updated: ProjectSyncState = {
      ...current,
      pendingMetadata: undefined,
      status:
        (current.pendingUploads.length ?? 0) === 0 ? 'synced' : current.status,
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
   * Get all projects that have pending uploads or metadata changes
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
          const hasPendingUploads = state.pendingUploads.length > 0;
          const hasPendingMetadata =
            state.pendingMetadata?.title !== undefined ||
            state.pendingMetadata?.description !== undefined;
          if (hasPendingUploads || hasPendingMetadata) {
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
