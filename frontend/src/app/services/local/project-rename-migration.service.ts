import { inject, Injectable } from '@angular/core';
import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import * as Y from 'yjs';

import { LoggerService } from '../core/logger.service';

/**
 * Result of a project rename migration
 */
export interface MigrationResult {
  /** Number of documents successfully migrated */
  documentsMigrated: number;
  /** Number of documents that failed to migrate */
  documentsFailed: number;
  /** List of errors encountered during migration */
  errors: string[];
  /** Whether the migration completed successfully overall */
  success: boolean;
}

/**
 * Service for migrating local IndexedDB data when a project is renamed.
 *
 * When a project slug changes on the server, clients with offline copies
 * need to migrate their local IndexedDB data to use the new slug.
 *
 * This service:
 * 1. Lists all IndexedDB databases matching the old project pattern
 * 2. For each database, loads data from old key and saves to new key
 * 3. Does NOT delete old data (kept as backup until housekeeping)
 *
 * The actual sync to server happens automatically when Yjs reconnects
 * using the new slug - the existing sync mechanism handles this.
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectRenameMigrationService {
  private logger = inject(LoggerService);

  /**
   * Migrate all local IndexedDB data for a project from old slug to new slug.
   *
   * This copies data from old document IDs to new document IDs.
   * Old data is NOT deleted - kept as backup.
   *
   * @param username - Project owner username
   * @param oldSlug - Original project slug
   * @param newSlug - New project slug after rename
   * @returns Migration result with counts and any errors
   */
  async migrateProject(
    username: string,
    oldSlug: string,
    newSlug: string
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      documentsMigrated: 0,
      documentsFailed: 0,
      errors: [],
      success: true,
    };

    this.logger.info(
      'ProjectRenameMigration',
      `Starting migration: ${username}/${oldSlug} -> ${username}/${newSlug}`
    );

    try {
      // Get all IndexedDB database names that match the old project pattern
      const databases = await this.listProjectDatabases(username, oldSlug);

      this.logger.info(
        'ProjectRenameMigration',
        `Found ${databases.length} databases to migrate`
      );

      // Migrate each database
      for (const dbName of databases) {
        try {
          await this.migrateDatabase(dbName, username, oldSlug, newSlug);
          result.documentsMigrated++;
        } catch (error) {
          result.documentsFailed++;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to migrate ${dbName}: ${errorMsg}`);
          this.logger.error(
            'ProjectRenameMigration',
            `Failed to migrate database ${dbName}`,
            error
          );
        }
      }

      // Also migrate the project cache if it exists
      await this.migrateProjectCache(username, oldSlug, newSlug);

      result.success = result.documentsFailed === 0;

      this.logger.info(
        'ProjectRenameMigration',
        `Migration complete: ${result.documentsMigrated} migrated, ${result.documentsFailed} failed`
      );

      return result;
    } catch (error) {
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Migration failed: ${errorMsg}`);
      this.logger.error(
        'ProjectRenameMigration',
        'Migration failed with error',
        error
      );
      return result;
    }
  }

  /**
   * List all IndexedDB databases that belong to a project.
   *
   * y-indexeddb creates databases with the document ID as the name.
   * Document IDs follow the pattern: username:slug:elementId
   *
   * @param username - Project owner username
   * @param slug - Project slug
   * @returns Array of database names matching the project
   */
  private async listProjectDatabases(
    username: string,
    slug: string
  ): Promise<string[]> {
    // Use the indexedDB.databases() API if available (modern browsers)
    if ('databases' in indexedDB) {
      try {
        const allDatabases = await indexedDB.databases();
        const projectPrefix = `${username}:${slug}:`;

        return allDatabases
          .map(db => db.name)
          .filter(
            (name): name is string =>
              name !== undefined && name.startsWith(projectPrefix)
          );
      } catch (error) {
        this.logger.warn(
          'ProjectRenameMigration',
          'indexedDB.databases() failed, will try known document patterns',
          error
        );
      }
    }

    // Fallback: Try known document patterns
    // This is less reliable but covers the main use cases
    return this.tryKnownDatabasePatterns(username, slug);
  }

  /**
   * Fallback method to find databases when indexedDB.databases() isn't available.
   * Tries to open databases with known patterns to see if they exist.
   */
  private async tryKnownDatabasePatterns(
    username: string,
    slug: string
  ): Promise<string[]> {
    const knownPatterns = [
      `${username}:${slug}:elements`, // Main elements document
      // Add more known patterns as needed
    ];

    const existingDatabases: string[] = [];

    for (const dbName of knownPatterns) {
      if (await this.databaseExists(dbName)) {
        existingDatabases.push(dbName);
      }
    }

    return existingDatabases;
  }

  /**
   * Check if a database exists by trying to open it
   */
  private async databaseExists(dbName: string): Promise<boolean> {
    return new Promise(resolve => {
      const request = indexedDB.open(dbName);

      request.onsuccess = () => {
        const db = request.result;
        const exists = db.objectStoreNames.length > 0;
        db.close();
        resolve(exists);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  /**
   * Migrate a single database from old document ID to new document ID.
   *
   * Uses Yjs to load the document from the old ID and save to the new ID.
   * This ensures all Yjs data structures are properly preserved.
   *
   * @param dbName - Original database name (old document ID)
   * @param username - Project owner username
   * @param oldSlug - Original project slug
   * @param newSlug - New project slug
   */
  private async migrateDatabase(
    dbName: string,
    username: string,
    oldSlug: string,
    newSlug: string
  ): Promise<void> {
    // Calculate the new database name
    const oldPrefix = `${username}:${oldSlug}:`;
    if (!dbName.startsWith(oldPrefix)) {
      throw new Error(
        `Database name ${dbName} doesn't match expected pattern ${oldPrefix}`
      );
    }

    const suffix = dbName.substring(oldPrefix.length);
    const newDbName = `${username}:${newSlug}:${suffix}`;

    this.logger.debug(
      'ProjectRenameMigration',
      `Migrating ${dbName} -> ${newDbName}`
    );

    // Load old document
    const oldDoc = new Y.Doc();
    const oldProvider = new IndexeddbPersistence(dbName, oldDoc);
    await oldProvider.whenSynced;

    // Check if there's any data to migrate
    const oldState = Y.encodeStateAsUpdate(oldDoc);
    if (oldState.length <= 2) {
      // Empty document, skip migration
      this.logger.debug(
        'ProjectRenameMigration',
        `Skipping empty document: ${dbName}`
      );
      void oldProvider.destroy();
      return;
    }

    // Create new document and apply old state
    const newDoc = new Y.Doc();
    Y.applyUpdate(newDoc, oldState);

    // Save to new database
    const newProvider = new IndexeddbPersistence(newDbName, newDoc);
    await newProvider.whenSynced;

    // Force persist the state
    await storeState(newProvider, false);

    // Cleanup
    void newProvider.destroy();
    void oldProvider.destroy();

    this.logger.debug(
      'ProjectRenameMigration',
      `Successfully migrated ${dbName} -> ${newDbName}`
    );
  }

  /**
   * Migrate the project cache entry from old slug to new slug.
   *
   * The project cache stores Project objects keyed by "username/slug".
   */
  private async migrateProjectCache(
    username: string,
    oldSlug: string,
    newSlug: string
  ): Promise<void> {
    const cacheDbName = 'projectCache';
    const oldKey = `${username}/${oldSlug}`;
    const newKey = `${username}/${newSlug}`;

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(cacheDbName);

      request.onerror = () => {
        // Cache database doesn't exist or can't be opened, that's OK
        resolve();
      };

      request.onsuccess = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('projects')) {
          db.close();
          resolve();
          return;
        }

        try {
          const transaction = db.transaction('projects', 'readwrite');
          const store = transaction.objectStore('projects');

          // Get the old cached project
          const getRequest = store.get(oldKey);

          getRequest.onsuccess = () => {
            const cachedProject = getRequest.result as
              | { slug: string }
              | undefined;
            if (cachedProject) {
              // Update the slug in the cached project
              cachedProject.slug = newSlug;

              // Save under new key
              void store.put(cachedProject, newKey);

              this.logger.debug(
                'ProjectRenameMigration',
                `Migrated project cache: ${oldKey} -> ${newKey}`
              );
            }
          };

          transaction.oncomplete = () => {
            db.close();
            resolve();
          };

          transaction.onerror = () => {
            db.close();
            reject(transaction.error ?? new Error('Transaction failed'));
          };
        } catch (error) {
          db.close();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
    });
  }
}
