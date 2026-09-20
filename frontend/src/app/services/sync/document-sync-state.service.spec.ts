import 'fake-indexeddb/auto';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StorageContextService } from '@services/core/storage-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type DocumentSyncRecord,
  DocumentSyncStateService,
} from './document-sync-state.service';

describe('DocumentSyncStateService', () => {
  let service: DocumentSyncStateService;
  let prefix: string;

  function record(
    documentId: string,
    revision: string | null = 'r1',
    digest = 'digest-r1'
  ): DocumentSyncRecord {
    return {
      documentId,
      serverRevision: revision,
      stateVectorDigest: digest,
      syncedAt: '2026-09-07T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    prefix = `sync-state-${Math.random().toString(16).slice(2, 8)}:`;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentSyncStateService,
        {
          provide: StorageContextService,
          useValue: { prefixDbName: vi.fn((name: string) => prefix + name) },
        },
      ],
    });
    service = TestBed.inject(DocumentSyncStateService);
  });

  it('returns null for unknown documents', async () => {
    expect(await service.get('u:p:d')).toBeNull();
  });

  it('stores, updates and deletes records', async () => {
    await service.set(record('u:p:d'));
    expect(await service.get('u:p:d')).toEqual(record('u:p:d'));

    await service.set(record('u:p:d', 'r2', 'digest-r2'));
    expect((await service.get('u:p:d'))?.serverRevision).toBe('r2');

    await service.delete('u:p:d');
    expect(await service.get('u:p:d')).toBeNull();
  });

  it('reads many records in one call and omits missing keys', async () => {
    await service.setMany([record('u:p:a'), record('u:p:b')]);

    const found = await service.getMany(['u:p:a', 'u:p:b', 'u:p:missing']);

    expect(found.size).toBe(2);
    expect(found.get('u:p:a')?.serverRevision).toBe('r1');
    expect(found.has('u:p:missing')).toBe(false);
  });

  it('handles an empty read list without opening a transaction', async () => {
    expect((await service.getMany([])).size).toBe(0);
  });

  it('treats a null server revision as a valid stored record', async () => {
    await service.set(record('u:p:empty', null, 'digest-empty'));
    expect((await service.get('u:p:empty'))?.serverRevision).toBeNull();
  });
});
