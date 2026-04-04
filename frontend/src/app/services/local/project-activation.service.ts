import { inject, Injectable, signal } from '@angular/core';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';
import { type StorageConfig, StorageService } from './storage.service';

const ACTIVATION_DB_BASE_NAME = 'inkweld-activations';
const STORE_NAME = 'activations';

/**
 * Stored activation record in IndexedDB
 */
export interface StoredActivation {
  /** Project identifier: "username/slug" */
  projectKey: string;
  /** When the project was activated on this device (ISO string) */
  activatedAt: string;
}

/**
 * Service for managing per-device project activation state.
 *
 * In server mode, projects start deactivated on new devices. Users must
 * explicitly activate a project to sync its full data (elements, documents,
 * media, worldbuilding). Covers are always synced regardless of activation.
 *
 * Local mode projects are always considered activated.
 *
 * New projects are automatically activated on the device where they are created.
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectActivationService {
  private readonly storageService = inject(StorageService);
  private readonly storageContext = inject(StorageContextService);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);
  private db: IDBDatabase | null = null;
  private currentDbName: string | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;
  private initializePromise: Promise<void> | null = null;

  /** In-memory cache of activation states — projectKey → true */
  private readonly activatedKeys = signal<Set<string>>(new Set());

  /** Version counter for triggering reactivity when activations change */
  readonly activationVersion = signal(0);

  private get dbConfig(): StorageConfig {
    return {
      dbName: this.storageContext.prefixDbName(ACTIVATION_DB_BASE_NAME),
      version: 1,
      stores: {
        [STORE_NAME]: 'projectKey',
      },
    };
  }

  private async ensureDb(): Promise<IDBDatabase> {
    const expectedDbName = this.dbConfig.dbName;

    if (this.db && this.currentDbName !== expectedDbName) {
      this.db.close();
      this.db = null;
      this.currentDbName = null;
      this.initPromise = null;
      this.initializePromise = null;
      this.activatedKeys.set(new Set());
    }

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
        this.currentDbName = expectedDbName;
        return db;
      });

    return this.initPromise;
  }

  /**
   * Load all activation records from IndexedDB into memory.
   * Safe to call multiple times — only reads from IndexedDB once.
   */
  initialize(): Promise<void> {
    if (this.setupService.getMode() === 'local') {
      return Promise.resolve();
    }

    // Reset if the storage context has changed (e.g., user switched servers)
    const expectedDbName = this.dbConfig.dbName;
    if (this.currentDbName && this.currentDbName !== expectedDbName) {
      this.db?.close();
      this.db = null;
      this.currentDbName = null;
      this.initPromise = null;
      this.initializePromise = null;
      this.activatedKeys.set(new Set());
    }

    if (!this.initializePromise) {
      this.initializePromise = this.doInitialize();
    }
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      const db = await this.ensureDb();
      const records = await new Promise<StoredActivation[]>(
        (resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.getAll();
          request.onsuccess = () =>
            resolve(request.result as StoredActivation[]);
          request.onerror = () =>
            reject(
              new Error(`Failed to load activations: ${request.error?.message}`)
            );
        }
      );

      const keys = new Set(records.map(r => r.projectKey));
      this.activatedKeys.set(keys);

      this.logger.info(
        'ProjectActivation',
        `Loaded ${keys.size} activation(s)`
      );
    } catch (error) {
      this.logger.error(
        'ProjectActivation',
        'Failed to initialize activations',
        error
      );
    }
  }

  /**
   * Whether activation is required (false in local mode, true in server mode).
   */
  isActivationRequired(): boolean {
    return this.setupService.getMode() === 'server';
  }

  /**
   * Check if a project is activated on this device.
   * Always returns true in local mode.
   */
  isActivated(projectKey: string): boolean {
    if (!this.isActivationRequired()) {
      return true;
    }
    // Read activationVersion to ensure signals track changes
    this.activationVersion();
    return this.activatedKeys().has(projectKey);
  }

  /**
   * Activate a project on this device.
   */
  async activate(projectKey: string): Promise<void> {
    if (!this.isActivationRequired()) {
      return;
    }
    if (this.activatedKeys().has(projectKey)) {
      return;
    }

    const record: StoredActivation = {
      projectKey,
      activatedAt: new Date().toISOString(),
    };

    try {
      const db = await this.ensureDb();
      await this.storageService.put(db, STORE_NAME, record);

      this.activatedKeys.update(keys => {
        const next = new Set(keys);
        next.add(projectKey);
        return next;
      });
      this.activationVersion.update(v => v + 1);

      this.logger.info('ProjectActivation', `Activated project: ${projectKey}`);
    } catch (error) {
      this.logger.error(
        'ProjectActivation',
        `Failed to activate project: ${projectKey}`,
        error
      );
      throw error;
    }
  }

  /**
   * Deactivate a project on this device.
   * Does NOT purge local data — caller is responsible for cleanup.
   */
  async deactivate(projectKey: string): Promise<void> {
    if (!this.isActivationRequired()) {
      return;
    }
    try {
      const db = await this.ensureDb();
      await this.storageService.delete(db, STORE_NAME, projectKey);

      this.activatedKeys.update(keys => {
        const next = new Set(keys);
        next.delete(projectKey);
        return next;
      });
      this.activationVersion.update(v => v + 1);

      this.logger.info(
        'ProjectActivation',
        `Deactivated project: ${projectKey}`
      );
    } catch (error) {
      this.logger.error(
        'ProjectActivation',
        `Failed to deactivate project: ${projectKey}`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all activated project keys.
   */
  getActivatedProjects(): string[] {
    return [...this.activatedKeys()];
  }
}
