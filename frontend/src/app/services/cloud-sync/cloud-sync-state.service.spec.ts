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
          useValue: { prefixDbName: vi.fn((name: string) => prefix + name) },
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

  it('switches databases when the storage context prefix changes', async () => {
    await service.set(record('/projects/b/n/elements.yjs'));

    prefix = 'cloud-dropbox-other:';
    expect(await service.get('/projects/b/n/elements.yjs')).toBeNull();

    prefix = prefix.replace('other', 'third');
    await service.set(record('/x'));
    expect(await service.get('/x')).not.toBeNull();
  });
});
