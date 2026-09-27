import { inject, Injectable } from '@angular/core';

import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';

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
 * Moves the active profile's local copy of a project to its new slug after
 * the project was renamed on the server — from this device's settings or by
 * someone else, noticed while loading.
 *
 * The work is {@link StorageContextService.renameProjectInContext}: Yjs
 * databases are merged into their new names and the originals deleted
 * (legacy shared worldbuilding databases once no other profile has the old
 * slug), and media, snapshots, activations, the cached project and the
 * project list are rekeyed. A database that fails to copy keeps its original;
 * the server holds the project under the new slug either way.
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectRenameMigrationService {
  private readonly logger = inject(LoggerService);
  private readonly storageContext = inject(StorageContextService);

  /**
   * Move all local data for a project from old slug to new slug in the
   * active profile.
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

    const configId = this.storageContext.getActiveConfig()?.id;
    if (!configId) {
      this.logger.warn(
        'ProjectRenameMigration',
        'No active profile; nothing to migrate'
      );
      return result;
    }

    this.logger.info(
      'ProjectRenameMigration',
      `Starting migration: ${username}/${oldSlug} -> ${username}/${newSlug}`
    );

    try {
      const renamed = await this.storageContext.renameProjectInContext(
        configId,
        username,
        oldSlug,
        newSlug
      );
      result.documentsMigrated = renamed.databasesMoved;
      result.documentsFailed = renamed.errors.length;
      result.errors = renamed.errors;
      result.success = renamed.errors.length === 0;
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

    if (result.success) {
      this.logger.info(
        'ProjectRenameMigration',
        `Migration complete: ${result.documentsMigrated} databases moved`
      );
    } else {
      this.logger.warn(
        'ProjectRenameMigration',
        `Migration had errors: ${result.errors.join(', ')}`
      );
    }
    return result;
  }
}
