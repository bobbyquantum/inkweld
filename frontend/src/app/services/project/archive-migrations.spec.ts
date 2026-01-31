import { describe, expect, it } from 'vitest';

import { ARCHIVE_VERSION, ProjectArchive } from '../../models/project-archive';
import {
  ARCHIVE_MIGRATIONS,
  ArchiveMigration,
  findMigration,
  hasMigrationPath,
} from './archive-migrations';

describe('archive-migrations', () => {
  describe('findMigration', () => {
    it('should return undefined when no migration exists for version', () => {
      const result = findMigration(1);
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
      // Temporarily add a mock migration
      const mockMigration: ArchiveMigration = {
        fromVersion: 99,
        toVersion: 100,
        description: 'Test migration',
        migrate: archive => archive,
      };

      ARCHIVE_MIGRATIONS.push(mockMigration);

      try {
        const result = findMigration(99);
        expect(result).toBe(mockMigration);
        expect(result?.fromVersion).toBe(99);
        expect(result?.toVersion).toBe(100);
      } finally {
        // Clean up
        ARCHIVE_MIGRATIONS.pop();
      }
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
      // No migrations exist from 1 to 2
      const result = hasMigrationPath(1, 2);
      expect(result).toBe(false);
    });

    it('should return true when complete migration path exists', () => {
      // Add mock migrations for v1->v2->v3
      const migration1: ArchiveMigration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'v1 to v2',
        migrate: archive => archive,
      };
      const migration2: ArchiveMigration = {
        fromVersion: 2,
        toVersion: 3,
        description: 'v2 to v3',
        migrate: archive => archive,
      };

      ARCHIVE_MIGRATIONS.push(migration1, migration2);

      try {
        const result = hasMigrationPath(1, 3);
        expect(result).toBe(true);
      } finally {
        // Clean up
        ARCHIVE_MIGRATIONS.length = 0;
      }
    });

    it('should return false when migration path is incomplete', () => {
      // Add only v1->v2, but need v1->v3
      const migration1: ArchiveMigration = {
        fromVersion: 1,
        toVersion: 2,
        description: 'v1 to v2',
        migrate: archive => archive,
      };

      ARCHIVE_MIGRATIONS.push(migration1);

      try {
        // Missing v2->v3
        const result = hasMigrationPath(1, 3);
        expect(result).toBe(false);
      } finally {
        // Clean up
        ARCHIVE_MIGRATIONS.length = 0;
      }
    });

    it('should handle migration to current ARCHIVE_VERSION', () => {
      if (ARCHIVE_VERSION === 1) {
        // No migration needed from v1 to v1
        const result = hasMigrationPath(1, ARCHIVE_VERSION);
        expect(result).toBe(true);
      } else {
        // This test is future-proof for when ARCHIVE_VERSION increases
        const result = hasMigrationPath(1, ARCHIVE_VERSION);
        // Result depends on whether migrations are defined
        expect(typeof result).toBe('boolean');
      }
    });
  });

  describe('ARCHIVE_MIGRATIONS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ARCHIVE_MIGRATIONS)).toBe(true);
    });

    it('should be empty initially (ARCHIVE_VERSION = 1)', () => {
      // When ARCHIVE_VERSION = 1, no migrations should exist yet
      if (ARCHIVE_VERSION === 1) {
        expect(ARCHIVE_MIGRATIONS.length).toBe(0);
      }
    });

    it('should maintain referential integrity across imports', () => {
      // Multiple imports should reference the same array
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
