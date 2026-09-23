import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@services/core/logger.service';
import { DocumentService } from '@services/project/document.service';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import {
  type DocumentSyncManifest,
  DocumentSyncManifestService,
} from './document-sync-manifest.service';
import { DocumentSyncPlannerService } from './document-sync-planner.service';
import {
  type DocumentSyncRecord,
  DocumentSyncStateService,
} from './document-sync-state.service';

describe('DocumentSyncPlannerService', () => {
  let service: DocumentSyncPlannerService;
  let manifestService: { getManifest: Mock };
  let syncState: { getMany: Mock; setMany: Mock };
  let documentService: { getLocalStateDigest: Mock };
  let logger: { info: Mock; warn: Mock; error: Mock; debug: Mock };

  const manifest = (
    entries: Array<[string, string | null]>
  ): DocumentSyncManifest => ({
    documents: entries.map(([documentId, revision]) => ({
      documentId,
      revision,
    })),
  });

  const record = (
    documentId: string,
    revision: string | null,
    digest: string
  ): DocumentSyncRecord => ({
    documentId,
    serverRevision: revision,
    stateDigest: digest,
    syncedAt: '2026-09-07T00:00:00.000Z',
  });

  beforeEach(() => {
    manifestService = { getManifest: vi.fn() };
    syncState = {
      getMany: vi.fn().mockResolvedValue(new Map()),
      setMany: vi.fn().mockResolvedValue(undefined),
    };
    documentService = {
      getLocalStateDigest: vi.fn().mockResolvedValue(null),
    };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentSyncPlannerService,
        { provide: DocumentSyncManifestService, useValue: manifestService },
        { provide: DocumentSyncStateService, useValue: syncState },
        { provide: DocumentService, useValue: documentService },
        { provide: LoggerService, useValue: logger },
      ],
    });
    service = TestBed.inject(DocumentSyncPlannerService);
  });

  it('syncs everything when the manifest is unavailable', async () => {
    manifestService.getManifest.mockResolvedValue(null);

    const plan = await service.plan('u', 'p', ['u:p:a', 'u:p:b']);

    expect(plan.toSync).toEqual(['u:p:a', 'u:p:b']);
    expect(plan.skipped).toEqual([]);
    expect(plan.before).toBeNull();
  });

  it('skips a document whose revision and local digest are unchanged', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockResolvedValue(
      new Map([['u:p:a', record('u:p:a', 'r1', 'd1')]])
    );
    documentService.getLocalStateDigest.mockResolvedValue('d1');

    const plan = await service.plan('u', 'p', ['u:p:a']);

    expect(plan.skipped).toEqual(['u:p:a']);
    expect(plan.toSync).toEqual([]);
    expect(plan.before?.get('u:p:a')?.revision).toBe('r1');
  });

  it('syncs when the server revision changed', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r2']]));
    syncState.getMany.mockResolvedValue(
      new Map([['u:p:a', record('u:p:a', 'r1', 'd1')]])
    );
    documentService.getLocalStateDigest.mockResolvedValue('d1');

    const plan = await service.plan('u', 'p', ['u:p:a']);

    expect(plan.toSync).toEqual(['u:p:a']);
    expect(plan.skipped).toEqual([]);
  });

  it('syncs when the local digest changed (unsynced local edits)', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockResolvedValue(
      new Map([['u:p:a', record('u:p:a', 'r1', 'd1')]])
    );
    documentService.getLocalStateDigest.mockResolvedValue('d2');

    const plan = await service.plan('u', 'p', ['u:p:a']);

    expect(plan.toSync).toEqual(['u:p:a']);
  });

  it('syncs a document with no local record', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockResolvedValue(new Map());

    const plan = await service.plan('u', 'p', ['u:p:a']);

    expect(plan.toSync).toEqual(['u:p:a']);
    expect(documentService.getLocalStateDigest).not.toHaveBeenCalled();
  });

  it('syncs a document with an unknown or null revision', async () => {
    manifestService.getManifest.mockResolvedValue({
      documents: [
        { documentId: 'u:p:a', revision: 'r1', unknown: true },
        { documentId: 'u:p:b', revision: null },
      ],
    });
    syncState.getMany.mockResolvedValue(
      new Map([
        ['u:p:a', record('u:p:a', 'r1', 'd1')],
        ['u:p:b', record('u:p:b', null, 'd1')],
      ])
    );
    documentService.getLocalStateDigest.mockResolvedValue('d1');

    const plan = await service.plan('u', 'p', ['u:p:a', 'u:p:b']);

    expect(plan.toSync).toEqual(['u:p:a', 'u:p:b']);
  });

  it('always forces documents in the forceSync set', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockResolvedValue(
      new Map([['u:p:a', record('u:p:a', 'r1', 'd1')]])
    );
    documentService.getLocalStateDigest.mockResolvedValue('d1');

    const plan = await service.plan('u', 'p', ['u:p:a'], new Set(['u:p:a']));

    expect(plan.toSync).toEqual(['u:p:a']);
    expect(plan.skipped).toEqual([]);
  });

  it('syncs a document missing from the manifest', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockResolvedValue(new Map());

    const plan = await service.plan('u', 'p', ['u:p:a', 'u:p:new']);

    expect(plan.toSync).toContain('u:p:new');
  });

  it('does not read a local digest for documents that cannot be skipped', async () => {
    // No manifest entry for u:p:a => not a skip candidate => no IndexedDB read.
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:b', 'r1']]));
    syncState.getMany.mockResolvedValue(new Map());

    await service.plan('u', 'p', ['u:p:a']);

    expect(documentService.getLocalStateDigest).not.toHaveBeenCalled();
  });

  it('syncs everything when the checkpoint store cannot be read', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockRejectedValue(new Error('IndexedDB unavailable'));

    const plan = await service.plan('u', 'p', ['u:p:a']);

    expect(plan.toSync).toEqual(['u:p:a']);
    expect(plan.skipped).toEqual([]);
    // The manifest was read, so the run can still be checkpointed.
    expect(plan.before?.get('u:p:a')?.revision).toBe('r1');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('syncs a candidate whose local state cannot be read', async () => {
    manifestService.getManifest.mockResolvedValue(manifest([['u:p:a', 'r1']]));
    syncState.getMany.mockResolvedValue(
      new Map([['u:p:a', record('u:p:a', 'r1', 'd1')]])
    );
    documentService.getLocalStateDigest.mockResolvedValue(null);

    const plan = await service.plan('u', 'p', ['u:p:a']);

    expect(plan.toSync).toEqual(['u:p:a']);
  });

  it('reads digests for every candidate across concurrency batches', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'].map(id => `u:p:${id}`);
    manifestService.getManifest.mockResolvedValue(
      manifest(ids.map(id => [id, 'r1']))
    );
    syncState.getMany.mockResolvedValue(
      new Map(ids.map(id => [id, record(id, 'r1', `d-${id}`)]))
    );
    // Only u:p:c has local edits since its checkpoint.
    documentService.getLocalStateDigest.mockImplementation((id: string) =>
      Promise.resolve(id === 'u:p:c' ? 'edited' : `d-${id}`)
    );

    const plan = await service.plan('u', 'p', ids);

    expect(documentService.getLocalStateDigest).toHaveBeenCalledTimes(5);
    expect(plan.toSync).toEqual(['u:p:c']);
    expect(plan.skipped).toEqual(['u:p:a', 'u:p:b', 'u:p:d', 'u:p:e']);
  });

  describe('record', () => {
    it('does not checkpoint a document whose revision is null, unknown or missing afterwards', async () => {
      const before = new Map([
        ['u:p:null', { documentId: 'u:p:null', revision: null }],
        [
          'u:p:unknown-before',
          { documentId: 'u:p:unknown-before', revision: 'r1', unknown: true },
        ],
        [
          'u:p:unknown-after',
          { documentId: 'u:p:unknown-after', revision: 'r1' },
        ],
        ['u:p:gone', { documentId: 'u:p:gone', revision: 'r1' }],
      ]);
      manifestService.getManifest.mockResolvedValue({
        documents: [
          { documentId: 'u:p:null', revision: null },
          { documentId: 'u:p:unknown-before', revision: 'r1' },
          { documentId: 'u:p:unknown-after', revision: 'r1', unknown: true },
        ],
      });

      await service.record(
        'u',
        'p',
        before,
        new Map([...before.keys()].map(id => [id, `d-${id}`]))
      );

      expect(syncState.setMany).not.toHaveBeenCalled();
    });

    it('does not reject when the checkpoint write fails', async () => {
      manifestService.getManifest.mockResolvedValue(
        manifest([['u:p:a', 'r1']])
      );
      syncState.setMany.mockRejectedValue(new Error('quota exceeded'));

      await expect(
        service.record(
          'u',
          'p',
          new Map([['u:p:a', { documentId: 'u:p:a', revision: 'r1' }]]),
          new Map([['u:p:a', 'd-a']])
        )
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('persists checkpoints only for revisions stable across the run', async () => {
      const before = new Map([
        ['u:p:a', { documentId: 'u:p:a', revision: 'r1' }],
        ['u:p:b', { documentId: 'u:p:b', revision: 'r1' }],
      ]);
      manifestService.getManifest.mockResolvedValue(
        manifest([
          ['u:p:a', 'r1'],
          ['u:p:b', 'r2'],
        ])
      );

      await service.record(
        'u',
        'p',
        before,
        new Map([
          ['u:p:a', 'd-a'],
          ['u:p:b', 'd-b'],
        ])
      );

      expect(syncState.setMany).toHaveBeenCalledTimes(1);
      const records = syncState.setMany.mock
        .calls[0][0] as DocumentSyncRecord[];
      expect(records.map(r => r.documentId)).toEqual(['u:p:a']);
      expect(records[0].serverRevision).toBe('r1');
      expect(records[0].stateDigest).toBe('d-a');
    });

    it('does nothing when checkpointing is disabled (null before)', async () => {
      await service.record('u', 'p', null, new Map([['u:p:a', 'd-a']]));
      expect(manifestService.getManifest).not.toHaveBeenCalled();
      expect(syncState.setMany).not.toHaveBeenCalled();
    });

    it('does nothing when there are no successful digests', async () => {
      await service.record(
        'u',
        'p',
        new Map([['u:p:a', { documentId: 'u:p:a', revision: 'r1' }]]),
        new Map()
      );
      expect(syncState.setMany).not.toHaveBeenCalled();
    });

    it('skips checkpointing when the post-sync manifest is unavailable', async () => {
      manifestService.getManifest.mockResolvedValue(null);

      await service.record(
        'u',
        'p',
        new Map([['u:p:a', { documentId: 'u:p:a', revision: 'r1' }]]),
        new Map([['u:p:a', 'd-a']])
      );

      expect(syncState.setMany).not.toHaveBeenCalled();
    });
  });
});
