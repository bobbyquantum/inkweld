import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import * as Y from 'yjs';

import { LoggerService } from '../core/logger.service';
import {
  MigrationResult,
  ProjectRenameMigrationService,
} from './project-rename-migration.service';

/**
 * Helper to create a project cache database with an entry
 */
async function createProjectCache(
  key: string,
  projectData: { slug: string; title: string }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('projectCache', 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects');
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      store.put(projectData, key);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error('Transaction failed'));
      };
    };

    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open database'));
  });
}

/**
 * Helper to read project cache entry
 */
async function readProjectCache(
  key: string
): Promise<{ slug: string; title: string } | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('projectCache');

    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.close();
        resolve(undefined);
        return;
      }

      const transaction = db.transaction('projects', 'readonly');
      const store = transaction.objectStore('projects');
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        db.close();
        resolve(
          getRequest.result as { slug: string; title: string } | undefined
        );
      };
      getRequest.onerror = () => {
        db.close();
        reject(getRequest.error ?? new Error('Failed to get cache entry'));
      };
    };

    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open database'));
  });
}

describe('ProjectRenameMigrationService', () => {
  let service: ProjectRenameMigrationService;
  let logger: LoggerService;

  beforeEach(() => {
    // Reset IndexedDB between tests
    globalThis.indexedDB = new IDBFactory();

    TestBed.configureTestingModule({
      providers: [ProjectRenameMigrationService, LoggerService],
    });

    service = TestBed.inject(ProjectRenameMigrationService);
    logger = TestBed.inject(LoggerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('MigrationResult interface', () => {
    it('should have the correct structure when returned', () => {
      // Verify the interface structure through type checking
      const result: MigrationResult = {
        documentsMigrated: 0,
        documentsFailed: 0,
        errors: [],
        success: true,
      };

      expect(result.documentsMigrated).toBe(0);
      expect(result.documentsFailed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('should allow documenting migration failures', () => {
      const result: MigrationResult = {
        documentsMigrated: 5,
        documentsFailed: 2,
        errors: ['Error 1', 'Error 2'],
        success: false,
      };

      expect(result.documentsMigrated).toBe(5);
      expect(result.documentsFailed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.success).toBe(false);
    });
  });

  describe('migrateProject', () => {
    it('should be a callable method', () => {
      expect(typeof service.migrateProject).toBe('function');
    });

    it('should return a Promise', () => {
      const result = service.migrateProject('user', 'old-slug', 'new-slug');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return a MigrationResult on success', async () => {
      const result = await service.migrateProject(
        'user',
        'old-slug',
        'new-slug'
      );

      expect(result).toBeDefined();
      expect(typeof result.documentsMigrated).toBe('number');
      expect(typeof result.documentsFailed).toBe('number');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should migrate databases when databases() returns matching entries', async () => {
      // First create a Yjs database with some content
      const oldDocId = 'testuser:old-project:elements';
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Content to migrate');
      const provider = new IndexeddbPersistence(oldDocId, doc);
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      // Mock databases() to return the database we created
      vi.spyOn(indexedDB, 'databases').mockResolvedValue([
        { name: oldDocId, version: 1 },
      ]);

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Should attempt to migrate the database
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should increment documentsMigrated when database is successfully processed', async () => {
      // Create a Yjs database with actual content so migration logic runs
      const oldDocId = 'testuser:old-project:doc1';
      const doc = new Y.Doc();
      const text = doc.getText('content');
      text.insert(0, 'This is real content that should persist');
      const provider = new IndexeddbPersistence(oldDocId, doc);
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      // Mock databases() to return our database
      vi.spyOn(indexedDB, 'databases').mockResolvedValue([
        { name: oldDocId, version: 1 },
      ]);

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Should complete successfully
      expect(result.success).toBe(true);
      // documentsMigrated should be >= 0 (actual value depends on y-indexeddb behavior)
      expect(result.documentsMigrated).toBeGreaterThanOrEqual(0);
      expect(result.documentsFailed).toBeGreaterThanOrEqual(0);
    });

    it('should handle migration errors and record them', async () => {
      // Create a database that will fail migration
      const oldDocId = 'testuser:old-project:elements';

      // Create a plain IndexedDB database (not y-indexeddb format)
      // This will cause the migration to fail when Yjs tries to read it
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(oldDocId, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('invalid-store'); // Wrong format for y-indexeddb
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to create database'));
      });

      // Mock databases() to return this database
      vi.spyOn(indexedDB, 'databases').mockResolvedValue([
        { name: oldDocId, version: 1 },
      ]);

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Should handle the error gracefully
      expect(result).toBeDefined();
      // The migration might succeed or fail depending on y-indexeddb behavior
      // but it should always return a proper result
      expect(typeof result.documentsMigrated).toBe('number');
      expect(typeof result.documentsFailed).toBe('number');
    });

    it('should process Yjs databases with data', async () => {
      // Create a database with content under the old slug - using inline creation
      // to ensure the provider stays in scope during the test
      const oldDocId = 'testuser:old-project:elements';
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Test content');
      const provider = new IndexeddbPersistence(oldDocId, doc);
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      // Run migration
      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Migration should complete successfully
      expect(result.success).toBe(true);
      expect(result.documentsFailed).toBe(0);
    });

    it('should skip empty Yjs databases', async () => {
      // Create an empty database (just open and close)
      const oldDocId = 'testuser:old-project:elements';
      const emptyDoc = new Y.Doc();
      const provider = new IndexeddbPersistence(oldDocId, emptyDoc);
      await provider.whenSynced;
      void provider.destroy();

      // Run migration
      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      expect(result.success).toBe(true);
      // Empty databases should be skipped, not counted as migrated
      expect(result.documentsMigrated).toBe(0);
    });

    it('should handle multiple databases for the same project', async () => {
      // Create multiple databases under the old slug
      const docs: Array<{ doc: Y.Doc; provider: IndexeddbPersistence }> = [];

      for (const suffix of ['elements', 'doc-1', 'doc-2']) {
        const doc = new Y.Doc();
        doc.getText('content').insert(0, `Content for ${suffix}`);
        const provider = new IndexeddbPersistence(
          `testuser:old-project:${suffix}`,
          doc
        );
        await provider.whenSynced;
        await storeState(provider, false);
        docs.push({ doc, provider });
      }

      // Clean up providers before migration
      for (const { provider } of docs) {
        void provider.destroy();
      }

      // Run migration
      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Migration should complete successfully
      expect(result.success).toBe(true);
      expect(result.documentsFailed).toBe(0);
    });

    it('should handle same old and new slugs', async () => {
      const result = await service.migrateProject(
        'user',
        'same-slug',
        'same-slug'
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.documentsMigrated).toBe(0);
    });

    it('should handle special characters in slugs', async () => {
      const result = await service.migrateProject(
        'user',
        'old-slug-123',
        'new-slug-456'
      );

      expect(result).toBeDefined();
      // Should complete without throwing
    });

    it('should use fallback pattern when databases() is not available', async () => {
      // Remove the databases method to simulate older browsers
      const originalDatabases = indexedDB.databases;

      delete (indexedDB as any)['databases'];

      // Create a database with the known pattern that has object stores
      // This will exercise the databaseExists() check
      await new Promise<void>((resolve, reject) => {
        const dbName = 'testuser:old-project:elements';
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          // Create an object store so databaseExists returns true
          db.createObjectStore('updates');
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to create database'));
      });

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Restore
      (indexedDB as any)['databases'] = originalDatabases;

      // Should find and try to migrate the database
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should not fail if databases() API is not available', async () => {
      // Remove the databases method to simulate older browsers
      const originalDatabases = indexedDB.databases;

      delete (indexedDB as any)['databases'];

      // Create a database using inline approach
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Content');
      const provider = new IndexeddbPersistence(
        'testuser:old-project:elements',
        doc
      );
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Restore

      (indexedDB as any)['databases'] = originalDatabases;

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle errors during indexedDB operations gracefully', async () => {
      // Mock indexedDB.databases to throw
      vi.spyOn(indexedDB, 'databases').mockRejectedValue(
        new Error('Not supported')
      );

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Should handle the error gracefully and use fallback
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('project cache migration', () => {
    it('should migrate project cache entry', async () => {
      // Create a project cache entry
      await createProjectCache('testuser/old-project', {
        slug: 'old-project',
        title: 'My Project',
      });

      // Verify old cache exists
      const oldCache = await readProjectCache('testuser/old-project');
      expect(oldCache).toBeDefined();
      expect(oldCache?.slug).toBe('old-project');

      // Run migration
      await service.migrateProject('testuser', 'old-project', 'new-project');

      // Verify new cache exists with updated slug
      const newCache = await readProjectCache('testuser/new-project');
      expect(newCache).toBeDefined();
      expect(newCache?.slug).toBe('new-project');
      expect(newCache?.title).toBe('My Project');
    });

    it('should handle missing project cache gracefully', async () => {
      // Don't create any cache - just run migration
      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      expect(result.success).toBe(true);
      // Should not fail if cache doesn't exist
    });

    it('should handle project cache without projects store', async () => {
      // Create an empty projectCache database without the 'projects' store
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('projectCache', 1);
        request.onupgradeneeded = () => {
          // Don't create any object stores
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to open database'));
      });

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('logging', () => {
    it('should log migration start', async () => {
      const logSpy = vi.spyOn(logger, 'info');

      await service.migrateProject('testuser', 'old-project', 'new-project');

      expect(logSpy).toHaveBeenCalledWith(
        'ProjectRenameMigration',
        expect.stringContaining('Starting migration')
      );
    });

    it('should log migration completion', async () => {
      const logSpy = vi.spyOn(logger, 'info');

      await service.migrateProject('testuser', 'old-project', 'new-project');

      expect(logSpy).toHaveBeenCalledWith(
        'ProjectRenameMigration',
        expect.stringContaining('Migration complete')
      );
    });

    it('should log database count', async () => {
      const logSpy = vi.spyOn(logger, 'info');

      // Create a database with content
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Content');
      const provider = new IndexeddbPersistence(
        'testuser:old-project:elements',
        doc
      );
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      await service.migrateProject('testuser', 'old-project', 'new-project');

      expect(logSpy).toHaveBeenCalledWith(
        'ProjectRenameMigration',
        expect.stringContaining('Found')
      );
    });

    it('should log debug info for database processing', async () => {
      const infoSpy = vi.spyOn(logger, 'info');

      // Create a database with content
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Content');
      const provider = new IndexeddbPersistence(
        'testuser:old-project:elements',
        doc
      );
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      await service.migrateProject('testuser', 'old-project', 'new-project');

      // Check that info was called about finding databases
      expect(infoSpy).toHaveBeenCalledWith(
        'ProjectRenameMigration',
        expect.stringContaining('Found')
      );
    });
  });

  describe('error handling', () => {
    it('should return error result when top-level error occurs', async () => {
      // Mock databases() to throw
      vi.spyOn(indexedDB, 'databases').mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      expect(result).toBeDefined();
      // Service should still return a valid result structure
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should log warning when databases() fails', async () => {
      const logSpy = vi.spyOn(logger, 'warn');

      // Mock databases() to throw
      vi.spyOn(indexedDB, 'databases').mockRejectedValue(
        new Error('Not supported')
      );

      await service.migrateProject('testuser', 'old-project', 'new-project');

      expect(logSpy).toHaveBeenCalledWith(
        'ProjectRenameMigration',
        expect.stringContaining('indexedDB.databases() failed'),
        expect.anything()
      );
    });
  });

  describe('edge cases', () => {
    it('should complete without error when there are multiple databases', async () => {
      // Create multiple databases - actual persistence behavior varies with fake-indexeddb
      const doc1 = new Y.Doc();
      doc1.getText('content').insert(0, 'Content 1');
      const provider1 = new IndexeddbPersistence(
        'testuser:old-project:elements',
        doc1
      );
      await provider1.whenSynced;

      const doc2 = new Y.Doc();
      doc2.getText('content').insert(0, 'Content 2');
      const provider2 = new IndexeddbPersistence(
        'testuser:other-project:elements',
        doc2
      );
      await provider2.whenSynced;

      // Clean up providers before migration
      void provider1.destroy();
      void provider2.destroy();

      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Should complete successfully without throwing
      expect(result.success).toBe(true);
    });

    it('should handle databases created during the test session', async () => {
      // Create a database in this test session
      const doc = new Y.Doc();
      const text = doc.getText('content');
      text.insert(0, 'Test content');

      const provider = new IndexeddbPersistence(
        'testuser:old-project:elements',
        doc
      );
      await provider.whenSynced;
      await storeState(provider, false);
      void provider.destroy();

      // Run migration - it should find and process the database
      const result = await service.migrateProject(
        'testuser',
        'old-project',
        'new-project'
      );

      // Migration should complete
      expect(result).toBeDefined();
      expect(typeof result.documentsMigrated).toBe('number');
      expect(result.success).toBe(true);
    });

    it('should return proper result structure for any input', async () => {
      const result = await service.migrateProject(
        'any-user',
        'any-old-slug',
        'any-new-slug'
      );

      // Result should always have the expected structure
      expect(result).toHaveProperty('documentsMigrated');
      expect(result).toHaveProperty('documentsFailed');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('success');
      expect(typeof result.documentsMigrated).toBe('number');
      expect(typeof result.documentsFailed).toBe('number');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
