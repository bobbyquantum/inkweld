import 'fake-indexeddb/auto';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StorageContextService } from '@services/core/storage-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CloudFileRecord,
  CloudSyncStateService,
} from './cloud-sync-state.service';

describe('CloudSyncStateService', () => {
  let service: CloudSyncStateService;
  let prefix: string;

  function record(path: string, version = 'v1'): CloudFileRecord {
    return {
      path,
      remoteVersion: version,
      localDigest: `digest-${version}`,
      syncedAt: '2026-09-07T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    prefix = `cloud-dropbox-${Math.random().toString(16).slice(2, 8)}:`;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CloudSyncStateService,
        {
          provide: StorageContextService,
          useValue: {
            prefixDbName: vi.fn((name: string) => prefix + name),
            getPrefixForConfig: vi.fn((id: string) => `${id}:`),
          },
        },
      ],
    });
    service = TestBed.inject(CloudSyncStateService);
  });

  it('returns null for unknown paths', async () => {
    expect(await service.get('/projects/b/n/elements.yjs')).toBeNull();
  });

  it('stores, updates and deletes records', async () => {
    await service.set(record('/projects/b/n/elements.yjs'));
    expect(await service.get('/projects/b/n/elements.yjs')).toEqual(
      record('/projects/b/n/elements.yjs')
    );

    await service.set(record('/projects/b/n/elements.yjs', 'v2'));
    expect(
      (await service.get('/projects/b/n/elements.yjs'))?.remoteVersion
    ).toBe('v2');

    await service.delete('/projects/b/n/elements.yjs');
    expect(await service.get('/projects/b/n/elements.yjs')).toBeNull();
  });

  it('lists and deletes by prefix without touching neighbours', async () => {
    await service.set(record('/projects/b/n/elements.yjs'));
    await service.set(record('/projects/b/n/documents/e1.yjs'));
    await service.set(record('/projects/b/other/elements.yjs'));

    const listed = await service.listByPrefix('/projects/b/n/');
    expect(listed.map(r => r.path).sort()).toEqual([
      '/projects/b/n/documents/e1.yjs',
      '/projects/b/n/elements.yjs',
    ]);

    await service.deleteByPrefix('/projects/b/n/');
    expect(await service.listByPrefix('/projects/b/n/')).toEqual([]);
    expect(await service.get('/projects/b/other/elements.yjs')).not.toBeNull();
  });

  describe('hasRecordInConfig', () => {
    it("reads another profile's records while a different one is active", async () => {
      const source = prefix;
      await service.set(record('/projects/b/n/project.json'));
      // The sign-in of a move to a server makes the server profile active
      prefix = 'srv:srv1:';

      const sourceId = source.slice(0, -1);
      expect(
        await service.hasRecordInConfig(sourceId, '/projects/b/n/project.json')
      ).toBe(true);
      expect(
        await service.hasRecordInConfig(sourceId, '/projects/b/x/project.json')
      ).toBe(false);
    });

    it("closes another profile's database again, so it can be deleted", async () => {
      await service.set(record('/projects/b/n/project.json'));
      const sourceName = `${prefix}inkweld-cloud-sync`;
      const sourceId = prefix.slice(0, -1);
      prefix = 'srv:srv1:';
      // Drop the service's own handle to the source, opened before the switch
      await service.get('/projects/b/n/project.json');

      await service.hasRecordInConfig(sourceId, '/projects/b/n/project.json');

      const deleted = await new Promise<string>(resolve => {
        const request = indexedDB.deleteDatabase(sourceName);
        request.onsuccess = () => resolve('deleted');
        request.onblocked = () => resolve('blocked');
      });
      expect(deleted).toBe('deleted');
    });

    it('reads the active profile through its own handle', async () => {
      await service.set(record('/projects/b/n/project.json'));

      expect(
        await service.hasRecordInConfig(
          prefix.slice(0, -1),
          '/projects/b/n/project.json'
        )
      ).toBe(true);
    });
  });

  it('switches databases when the storage context prefix changes', async () => {
    await service.set(record('/projects/b/n/elements.yjs'));

    prefix = 'cloud-dropbox-other:';
    expect(await service.get('/projects/b/n/elements.yjs')).toBeNull();

    prefix = prefix.replace('other', 'third');
    await service.set(record('/x'));
    expect(await service.get('/x')).not.toBeNull();
  });
});
