import { describe, expect, it } from 'vitest';

import {
  ARCHIVE_VERSION,
  type ProjectArchive,
} from '../../models/project-archive';
import {
  ARCHIVE_MIGRATIONS,
  type ArchiveMigration,
  findMigration,
  hasMigrationPath,
} from './archive-migrations';

/**
 * Temporarily swap the ARCHIVE_MIGRATIONS contents for isolated testing,
 * then restore the real migrations. We mutate in place because the import
 * binds to the same array reference.
 */
function withMigrations<T>(replacement: ArchiveMigration[], run: () => T): T {
  const original = ARCHIVE_MIGRATIONS.splice(0, ARCHIVE_MIGRATIONS.length);
  ARCHIVE_MIGRATIONS.push(...replacement);
  try {
    return run();
  } finally {
    ARCHIVE_MIGRATIONS.splice(0, ARCHIVE_MIGRATIONS.length);
    ARCHIVE_MIGRATIONS.push(...original);
  }
}

describe('archive-migrations', () => {
  describe('findMigration', () => {
    it('should return undefined when no migration exists for version', () => {
      // ARCHIVE_VERSION is the highest version; there is no outgoing
      // migration from it, so findMigration(ARCHIVE_VERSION) is always undefined.
      const result = findMigration(ARCHIVE_VERSION);
      expect(result).toBeUndefined();
    });

    it('should return undefined for version 0', () => {
      const result = findMigration(0);
      expect(result).toBeUndefined();
    });

    it('should return undefined for negative version', () => {
      const result = findMigration(-1);
      expect(result).toBeUndefined();
    });

    it('should find migration when one exists', () => {
      withMigrations(
        [
          {
            fromVersion: 99,
            toVersion: 100,
            description: 'Test migration',
            migrate: archive => archive,
          },
        ],
        () => {
          const result = findMigration(99);
          expect(result).toBeDefined();
          expect(result?.fromVersion).toBe(99);
          expect(result?.toVersion).toBe(100);
        }
      );
    });
  });

  describe('hasMigrationPath', () => {
    it('should return true when fromVersion equals toVersion', () => {
      const result = hasMigrationPath(1, 1);
      expect(result).toBe(true);
    });

    it('should return true when fromVersion is greater than toVersion', () => {
      const result = hasMigrationPath(5, 3);
      expect(result).toBe(true);
    });

    it('should return false when migration is missing', () => {
      withMigrations([], () => {
        // Empty registry → no v1 to v2 path
        const result = hasMigrationPath(1, 2);
        expect(result).toBe(false);
      });
    });

    it('should return true when complete migration path exists', () => {
      withMigrations(
        [
          {
            fromVersion: 1,
            toVersion: 2,
            description: 'v1 to v2',
            migrate: archive => archive,
          },
          {
            fromVersion: 2,
            toVersion: 3,
            description: 'v2 to v3',
            migrate: archive => archive,
          },
        ],
        () => {
          const result = hasMigrationPath(1, 3);
          expect(result).toBe(true);
        }
      );
    });

    it('should return false when migration path is incomplete', () => {
      withMigrations(
        [
          {
            fromVersion: 1,
            toVersion: 2,
            description: 'v1 to v2',
            migrate: archive => archive,
          },
        ],
        () => {
          // Missing v2->v3
          const result = hasMigrationPath(1, 3);
          expect(result).toBe(false);
        }
      );
    });

    it('should handle migration to current ARCHIVE_VERSION', () => {
      const result = hasMigrationPath(1, ARCHIVE_VERSION);
      expect(result).toBe(true);
    });
  });

  describe('ARCHIVE_MIGRATIONS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ARCHIVE_MIGRATIONS)).toBe(true);
    });

    it('should provide a migration path from v1 to the current version', () => {
      expect(hasMigrationPath(1, ARCHIVE_VERSION)).toBe(true);
    });

    it('v1->v2 migration should add timeSystems array', () => {
      const migration = findMigration(1);
      expect(migration).toBeDefined();
      const v1Archive = {
        manifest: {
          version: 1,
          exportedAt: '2026-01-01T00:00:00Z',
          projectTitle: 'Test',
          originalSlug: 'test',
        },
        project: { title: 'Test', slug: 'test' },
        elements: [],
        documents: [],
        worldbuilding: [],
        schemas: [],
        relationships: [],
        customRelationshipTypes: [],
        tags: [],
        elementTags: [],
        publishPlans: [],
        media: [],
      } as unknown as ProjectArchive;
      const result = migration!.migrate(v1Archive);
      expect(result.timeSystems).toEqual([]);
      expect(result.manifest.version).toBe(2);
    });

    it('should maintain referential integrity across imports', () => {
      const length1 = ARCHIVE_MIGRATIONS.length;
      const migration: ArchiveMigration = {
        fromVersion: 999,
        toVersion: 1000,
        description: 'Test',
        migrate: archive => archive,
      };

      ARCHIVE_MIGRATIONS.push(migration);

      try {
        expect(ARCHIVE_MIGRATIONS.length).toBe(length1 + 1);
      } finally {
        ARCHIVE_MIGRATIONS.pop();
      }
    });
  });

  describe('ArchiveMigration interface', () => {
    it('should support valid migration functions', () => {
      const mockArchive: Partial<ProjectArchive> = {
        manifest: {
          version: 1,
          exportedAt: '2026-01-01T00:00:00Z',
          projectTitle: 'Test',
          originalSlug: 'test',
        },
      };

      const migration: ArchiveMigration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'Add new field',
        migrate: archive => ({
          ...archive,
          manifest: { ...archive.manifest, version: 2 },
        }),
      };

      const result = migration.migrate(mockArchive as ProjectArchive);
      expect(result.manifest.version).toBe(2);
    });
  });
});
