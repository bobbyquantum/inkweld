import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { LoggerService } from '../core/logger.service';
import {
  LOCAL_CONFIG_ID,
  StorageContextService,
} from '../core/storage-context.service';
import { ProjectRenameMigrationService } from './project-rename-migration.service';

describe('ProjectRenameMigrationService', () => {
  describe('with a mocked storage context', () => {
    let service: ProjectRenameMigrationService;
    let logger: LoggerService;
    let storageContext: {
      getActiveConfig: ReturnType<typeof vi.fn>;
      renameProjectInContext: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      storageContext = {
        getActiveConfig: vi.fn().mockReturnValue({ id: 'srv-1' }),
        renameProjectInContext: vi
          .fn()
          .mockResolvedValue({ databasesMoved: 3, errors: [] }),
      };
      TestBed.configureTestingModule({
        imports: [translocoTestProvider()],
        providers: [
          ProjectRenameMigrationService,
          LoggerService,
          { provide: StorageContextService, useValue: storageContext },
        ],
      });
      service = TestBed.inject(ProjectRenameMigrationService);
      logger = TestBed.inject(LoggerService);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renames the project in the active profile only once', async () => {
      const result = await service.migrateProject('alice', 'old', 'new');

      expect(storageContext.renameProjectInContext).toHaveBeenCalledTimes(1);
      expect(storageContext.renameProjectInContext).toHaveBeenCalledWith(
        'srv-1',
        'alice',
        'old',
        'new'
      );
      expect(result).toEqual({
        documentsMigrated: 3,
        documentsFailed: 0,
        errors: [],
        success: true,
      });
    });

    it('reports databases that could not be copied', async () => {
      storageContext.renameProjectInContext.mockResolvedValue({
        databasesMoved: 1,
        errors: ['Failed to copy a to b: boom'],
      });
      const warn = vi.spyOn(logger, 'warn');

      const result = await service.migrateProject('alice', 'old', 'new');

      expect(result).toEqual({
        documentsMigrated: 1,
        documentsFailed: 1,
        errors: ['Failed to copy a to b: boom'],
        success: false,
      });
      expect(warn).toHaveBeenCalledWith(
        'ProjectRenameMigration',
        expect.stringContaining('boom')
      );
    });

    it('returns a failed result when the rename throws', async () => {
      storageContext.renameProjectInContext.mockRejectedValue(
        new Error('no storage')
      );
      const error = vi.spyOn(logger, 'error');

      const result = await service.migrateProject('alice', 'old', 'new');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Migration failed: no storage']);
      expect(error).toHaveBeenCalled();
    });

    it('stringifies non-Error failures', async () => {
      storageContext.renameProjectInContext.mockRejectedValue('nope');

      const result = await service.migrateProject('alice', 'old', 'new');

      expect(result.errors).toEqual(['Migration failed: nope']);
    });

    it('does nothing without an active profile', async () => {
      storageContext.getActiveConfig.mockReturnValue(null);

      const result = await service.migrateProject('alice', 'old', 'new');

      expect(storageContext.renameProjectInContext).not.toHaveBeenCalled();
      expect(result).toEqual({
        documentsMigrated: 0,
        documentsFailed: 0,
        errors: [],
        success: true,
      });
    });
  });

  describe('with real IndexedDB', () => {
    let service: ProjectRenameMigrationService;

    // y-indexeddb is mocked globally, so write and read its on-disk
    // schema directly: an autoIncrement `updates` log of Yjs updates
    function openYDatabase(name: string): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('updates', { autoIncrement: true });
          req.result.createObjectStore('custom');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
    }

    async function writeDoc(name: string, text: string): Promise<void> {
      const doc = new Y.Doc();
      doc.getText('t').insert(0, text);
      const db = await openYDatabase(name);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('updates', 'readwrite');
        tx.objectStore('updates').add(Y.encodeStateAsUpdate(doc));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      });
      db.close();
      doc.destroy();
    }

    async function readDoc(name: string): Promise<string> {
      const db = await openYDatabase(name);
      const updates = await new Promise<Uint8Array[]>((resolve, reject) => {
        const req = db
          .transaction('updates', 'readonly')
          .objectStore('updates')
          .getAll();
        req.onsuccess = () => resolve(req.result as Uint8Array[]);
        req.onerror = () => reject(req.error ?? new Error('read failed'));
      });
      db.close();
      const doc = new Y.Doc();
      for (const update of updates) Y.applyUpdate(doc, update);
      const text = doc.getText('t').toJSON();
      doc.destroy();
      return text;
    }

    async function names(): Promise<string[]> {
      return (await indexedDB.databases())
        .map(db => db.name ?? '')
        .filter(name => name.includes('alice:'))
        .sort();
    }

    async function dropAll(): Promise<void> {
      for (const name of await names()) {
        await new Promise<void>(resolve => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        });
      }
    }

    beforeEach(async () => {
      // fake-indexeddb is shared across specs: clear only this spec's databases
      await dropAll();
      localStorage.clear();
      TestBed.configureTestingModule({
        imports: [translocoTestProvider()],
        providers: [
          ProjectRenameMigrationService,
          LoggerService,
          StorageContextService,
        ],
      });
      const storageContext = TestBed.inject(StorageContextService);
      storageContext.addLocalConfig({ name: 'Alice', username: 'alice' });
      storageContext.switchToConfig(LOCAL_CONFIG_ID);
      service = TestBed.inject(ProjectRenameMigrationService);
    });

    afterEach(async () => {
      await dropAll();
      localStorage.clear();
    });

    it('moves every Yjs doc once and leaves no old-slug databases', async () => {
      localStorage.setItem(
        'local:inkweld-local-projects',
        JSON.stringify([{ username: 'alice', slug: 'old' }])
      );
      await writeDoc('local:alice:old:elements', 'tree');
      await writeDoc('local:alice:old:doc1', 'prose');
      await writeDoc('local:worldbuilding:alice:old:char1', 'hero');
      // Another profile's copy and a bare legacy name are not touched
      await writeDoc('srv:other:alice:old:doc1', 'theirs');
      await writeDoc('worldbuilding:alice:old:char2', 'legacy');

      const result = await service.migrateProject('alice', 'old', 'new');

      expect(result).toEqual({
        documentsMigrated: 3,
        documentsFailed: 0,
        errors: [],
        success: true,
      });
      expect(await names()).toEqual([
        'local:alice:new:doc1',
        'local:alice:new:elements',
        'local:worldbuilding:alice:new:char1',
        'srv:other:alice:old:doc1',
        'worldbuilding:alice:old:char2',
      ]);
      expect(await readDoc('local:alice:new:elements')).toBe('tree');
      expect(await readDoc('local:alice:new:doc1')).toBe('prose');
      expect(await readDoc('local:worldbuilding:alice:new:char1')).toBe('hero');
      expect(
        JSON.parse(localStorage.getItem('local:inkweld-local-projects')!)
      ).toEqual([{ username: 'alice', slug: 'new' }]);
    });

    it('keeps edits already made under the new slug', async () => {
      await writeDoc('local:alice:old:doc1', 'old ');
      await writeDoc('local:alice:new:doc1', 'new');

      await service.migrateProject('alice', 'old', 'new');

      const text = await readDoc('local:alice:new:doc1');
      expect(text).toContain('old ');
      expect(text).toContain('new');
    });
  });
});
