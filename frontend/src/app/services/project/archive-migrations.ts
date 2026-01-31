import { ProjectArchive } from '../../models/project-archive';

/**
 * Defines a migration from one archive version to the next.
 * Migrations are applied sequentially (v1→v2→v3) during import.
 */
export interface ArchiveMigration {
  /** Source archive version */
  fromVersion: number;
  /** Target archive version (should be fromVersion + 1) */
  toVersion: number;
  /** Human-readable description of what this migration does */
  description: string;
  /** Transform function that upgrades the archive */
  migrate: (archive: ProjectArchive) => ProjectArchive;
}

/**
 * Registry of all archive migrations.
 *
 * When ARCHIVE_VERSION is incremented, add a new migration here.
 * Each migration transforms an archive from version N to N+1.
 *
 * Example migration for v1 → v2:
 * ```typescript
 * {
 *   fromVersion: 1,
 *   toVersion: 2,
 *   description: 'Add displayOrder to schemas',
 *   migrate: (archive) => ({
 *     ...archive,
 *     schemas: archive.schemas.map(s => ({
 *       ...s,
 *       displayOrder: s.displayOrder ?? 0,
 *     })),
 *     manifest: { ...archive.manifest, version: 2 },
 *   }),
 * }
 * ```
 */
export const ARCHIVE_MIGRATIONS: ArchiveMigration[] = [
  // No migrations yet - ARCHIVE_VERSION is still 1
  // Add migrations here when the archive format changes
];

/**
 * Find a migration for the given source version.
 *
 * @param fromVersion The current archive version
 * @returns The migration, or undefined if none exists
 */
export function findMigration(
  fromVersion: number
): ArchiveMigration | undefined {
  return ARCHIVE_MIGRATIONS.find(m => m.fromVersion === fromVersion);
}

/**
 * Check if a migration path exists from one version to another.
 *
 * @param fromVersion Starting version
 * @param toVersion Target version
 * @returns true if all required migrations exist
 */
export function hasMigrationPath(
  fromVersion: number,
  toVersion: number
): boolean {
  if (fromVersion >= toVersion) {
    return true; // No migration needed
  }

  for (let v = fromVersion; v < toVersion; v++) {
    if (!findMigration(v)) {
      return false;
    }
  }
  return true;
}
