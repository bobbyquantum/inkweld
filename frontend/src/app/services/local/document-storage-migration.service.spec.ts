import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { LoggerService } from '../core/logger.service';
import {
  APP_CONFIG_STORAGE_KEY,
  type AppConfigV2,
  StorageContextService,
} from '../core/storage-context.service';
import {
  DOCUMENT_STORAGE_MIGRATION_KEY,
  DocumentStorageMigrationService,
  parseLegacyDocumentDbName,
} from './document-storage-migration.service';

/** Write `update` into a database laid out the way y-indexeddb does it */
function writeUpdate(name: string, update: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('updates', { autoIncrement: true });
      request.result.createObjectStore('custom');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('updates', 'readwrite');
      tx.objectStore('updates').add(update);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
  });
}

function readDoc(name: string): Promise<Y.Doc> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const all = db
        .transaction('updates', 'readonly')
        .objectStore('updates')
        .getAll();
      all.onsuccess = () => {
        db.close();
        const doc = new Y.Doc();
        for (const update of all.result as Uint8Array[]) {
          Y.applyUpdate(doc, update);
        }
        resolve(doc);
      };
      all.onerror = () => reject(all.error ?? new Error('read failed'));
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
  });
}

async function seed(name: string, text: string): Promise<void> {
  const doc = new Y.Doc();
  doc.getText('t').insert(0, text);
  await writeUpdate(name, Y.encodeStateAsUpdate(doc));
}

async function read(name: string): Promise<string> {
  const doc = await readDoc(name);
  return doc.getText('t').toJSON();
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases())
    .map(db => db.name)
    .filter((n): n is string => !!n)
    .sort();
}

function saveConfig(ids: string[]): void {
  const now = new Date().toISOString();
  const config: AppConfigV2 = {
    version: 2,
    activeConfigId: ids[0],
    configurations: ids.map(id => ({
      id,
      type: id === 'local' ? 'local' : 'server',
      serverUrl: id === 'local' ? undefined : `https://${id}.example`,
      addedAt: now,
      lastUsedAt: now,
    })),
  };
  localStorage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

describe('parseLegacyDocumentDbName', () => {
  it('matches bare username:slug:elementId names', () => {
    expect(parseLegacyDocumentDbName('alice:novel:e1')).toEqual({
      name: 'alice:novel:e1',
      username: 'alice',
      slug: 'novel',
      elementId: 'e1',
    });
  });

  it.each([
    'local:alice:novel:e1',
    'srv:abc123:alice:novel:e1',
    'cloud-dropbox-1a2b:alice:novel:e1',
    'worldbuilding:alice:novel:w1',
    'alice:novel:elements',
    'alice:novel:elements/',
    'inkweld-media',
    'alice::e1',
  ])('ignores %s', name => {
    expect(parseLegacyDocumentDbName(name)).toBeNull();
  });
});

describe('DocumentStorageMigrationService', () => {
  let service: DocumentStorageMigrationService;

  function createService(): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentStorageMigrationService,
        StorageContextService,
        LoggerService,
      ],
    });
    service = TestBed.inject(DocumentStorageMigrationService);
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('moves a document into the one profile that has its project', async () => {
    saveConfig(['local', 'abc123']);
    await seed('local:alice:novel:elements', 'tree');
    await seed('alice:novel:e1', 'hello');
    createService();

    const result = await service.migrateIfNeeded();

    expect(result).toEqual({ migrated: 1, unclaimed: 0, failed: 0 });
    expect(await read('local:alice:novel:e1')).toBe('hello');
    const names = await databaseNames();
    expect(names).not.toContain('alice:novel:e1');
    expect(names).not.toContain('srv:abc123:alice:novel:e1');
    expect(localStorage.getItem(DOCUMENT_STORAGE_MIGRATION_KEY)).toBeTruthy();
  });

  it('gives every claiming profile its own copy of a shared database', async () => {
    saveConfig(['local', 'abc123']);
    await seed('local:alice:novel:elements', 'tree');
    await seed('srv:abc123:alice:novel:elements', 'tree');
    await seed('alice:novel:e1', 'shared');
    createService();

    await service.migrateIfNeeded();

    expect(await read('local:alice:novel:e1')).toBe('shared');
    expect(await read('srv:abc123:alice:novel:e1')).toBe('shared');
    expect(await databaseNames()).not.toContain('alice:novel:e1');
  });

  it('treats a project in the profile project list as a claim', async () => {
    saveConfig(['local']);
    localStorage.setItem(
      'local:inkweld-local-projects',
      JSON.stringify([{ username: 'alice', slug: 'novel' }])
    );
    await seed('alice:novel:e1', 'listed');
    createService();

    await service.migrateIfNeeded();

    expect(await read('local:alice:novel:e1')).toBe('listed');
  });

  it('leaves a database no profile claims in place', async () => {
    saveConfig(['local']);
    await seed('local:bob:other:elements', 'tree');
    await seed('alice:novel:e1', 'orphan');
    createService();

    const result = await service.migrateIfNeeded();

    expect(result).toEqual({ migrated: 0, unclaimed: 1, failed: 0 });
    const names = await databaseNames();
    expect(names).toContain('alice:novel:e1');
    expect(names).not.toContain('local:alice:novel:e1');
  });

  it('merges into an existing profile database without losing its edits', async () => {
    saveConfig(['local']);
    await seed('local:alice:novel:elements', 'tree');
    await seed('alice:novel:e1', 'old');
    // A copy from an interrupted earlier run, edited since
    const target = await readDoc('alice:novel:e1');
    target.getText('t').insert(3, ' and new');
    await writeUpdate('local:alice:novel:e1', Y.encodeStateAsUpdate(target));
    createService();

    await service.migrateIfNeeded();

    expect(await read('local:alice:novel:e1')).toBe('old and new');
    expect(await databaseNames()).not.toContain('alice:novel:e1');
  });

  it('keeps the original and retries later when a copy does not verify', async () => {
    saveConfig(['local']);
    await seed('local:alice:novel:elements', 'tree');
    await seed('alice:novel:e1', 'precious');
    createService();
    vi.spyOn(
      service as unknown as { contains: () => Promise<boolean> },
      'contains'
    ).mockResolvedValue(false);

    const result = await service.migrateIfNeeded();

    expect(result).toEqual({ migrated: 0, unclaimed: 0, failed: 1 });
    expect(await read('alice:novel:e1')).toBe('precious');
    expect(localStorage.getItem(DOCUMENT_STORAGE_MIGRATION_KEY)).toBeNull();
  });

  it('only runs once', async () => {
    saveConfig(['local']);
    localStorage.setItem(DOCUMENT_STORAGE_MIGRATION_KEY, 'done');
    await seed('local:alice:novel:elements', 'tree');
    await seed('alice:novel:e1', 'late');
    createService();

    expect(await service.migrateIfNeeded()).toBeNull();
    expect(await databaseNames()).toContain('alice:novel:e1');
  });

  it('waits for a profile to exist before migrating', async () => {
    await seed('alice:novel:e1', 'early');
    createService();

    expect(await service.migrateIfNeeded()).toBeNull();
    expect(await databaseNames()).toContain('alice:novel:e1');
    expect(localStorage.getItem(DOCUMENT_STORAGE_MIGRATION_KEY)).toBeNull();
  });

  it('refuses a database that is not a Yjs document store', async () => {
    saveConfig(['local']);
    await seed('local:alice:novel:elements', 'tree');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('alice:novel:e1');
      request.onupgradeneeded = () =>
        request.result.createObjectStore('something-else');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error('failed'));
    });
    createService();

    const result = await service.migrateIfNeeded();

    expect(result).toEqual({ migrated: 0, unclaimed: 0, failed: 1 });
    expect(await databaseNames()).toContain('alice:novel:e1');
  });

  it('leaves elements, worldbuilding and prefixed databases untouched', async () => {
    saveConfig(['local']);
    await seed('local:alice:novel:elements', 'tree');
    await seed('local:alice:novel:e2', 'scoped');
    await seed('worldbuilding:alice:novel:w1', 'wb');
    createService();

    const result = await service.migrateIfNeeded();

    expect(result).toEqual({ migrated: 0, unclaimed: 0, failed: 0 });
    expect(await databaseNames()).toEqual([
      'local:alice:novel:e2',
      'local:alice:novel:elements',
      'worldbuilding:alice:novel:w1',
    ]);
  });

  it('never rejects', async () => {
    saveConfig(['local']);
    createService();
    vi.spyOn(indexedDB, 'databases').mockRejectedValue(new Error('boom'));

    await expect(service.migrateIfNeeded()).resolves.toBeNull();
  });
});
