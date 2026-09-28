import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType, type Project } from '@inkweld/index';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { DocumentSyncPlannerService } from '../sync/document-sync-planner.service';
import {
  ProjectSyncService,
  SyncPhase,
  type SyncProgress,
  type SyncResult,
} from './project-sync.service';

describe('ProjectSyncService', () => {
  let service: ProjectSyncService;
  let loggerMock: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let setupServiceMock: {
    isServerMode: ReturnType<typeof vi.fn>;
  };
  let documentServiceMock: {
    getSyncStatusSignal: ReturnType<typeof vi.fn>;
    hasLocalContent: Mock<(documentId: string) => Promise<boolean>>;
    getConnectedDocumentIds: ReturnType<typeof vi.fn>;
    syncDocumentToServer: ReturnType<typeof vi.fn>;
  };
  let plannerMock: {
    plan: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
  };
  let projectStateMock: {
    project: ReturnType<typeof signal<Partial<Project> | undefined>>;
    elements: ReturnType<typeof signal<Element[]>>;
  };
  let indexedDbOpen: ReturnType<typeof vi.fn>;

  const docId = (elementId: string) => `alice:novel:${elementId}`;

  const mockElements: Element[] = [
    {
      id: 'folder-1',
      name: 'Chapter 1',
      type: ElementType.Folder,
      parentId: null,
      order: 0,
      level: 0,
      expandable: true,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-1',
      name: 'Scene 1',
      type: ElementType.Item,
      parentId: 'folder-1',
      order: 0,
      level: 1,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-2',
      name: 'Scene 2',
      type: ElementType.Item,
      parentId: 'folder-1',
      order: 1,
      level: 1,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-3',
      name: 'Standalone Doc',
      type: ElementType.Item,
      parentId: null,
      order: 1,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  beforeEach(() => {
    loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    setupServiceMock = {
      isServerMode: vi.fn().mockReturnValue(false),
    };

    documentServiceMock = {
      getSyncStatusSignal: vi.fn(),
      hasLocalContent: vi
        .fn<(documentId: string) => Promise<boolean>>()
        .mockResolvedValue(true),
      getConnectedDocumentIds: vi.fn().mockReturnValue([]),
      syncDocumentToServer: vi.fn().mockResolvedValue('digest'),
    };

    plannerMock = {
      plan: vi.fn((_u: string, _s: string, ids: string[]) =>
        Promise.resolve({ toSync: [...ids], skipped: [], before: null })
      ),
      record: vi.fn().mockResolvedValue(undefined),
    };

    projectStateMock = {
      project: signal<Partial<Project> | undefined>({
        username: 'alice',
        slug: 'novel',
      }),
      elements: signal(mockElements),
    };

    // Documents must be probed through DocumentService, which knows the
    // profile-scoped database name — never by opening IndexedDB directly.
    indexedDbOpen = vi.fn(() => {
      throw new Error('indexedDB.open must not be called directly');
    });
    vi.stubGlobal('indexedDB', { open: indexedDbOpen });

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        ProjectSyncService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: DocumentSyncPlannerService, useValue: plannerMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    });

    service = TestBed.inject(ProjectSyncService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('currentProgress', () => {
    it('should return initial idle progress', () => {
      const progress = service.currentProgress;
      expect(progress.phase).toBe(SyncPhase.Idle);
      expect(progress.overallProgress).toBe(0);
      expect(progress.message).toBe('Ready');
    });
  });

  describe('progress$', () => {
    it('should emit progress updates', () => {
      const progressUpdates: SyncProgress[] = [];
      service.progress$.subscribe(p => progressUpdates.push(p));

      // Initial value
      expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
      expect(progressUpdates[0].phase).toBe(SyncPhase.Idle);
    });
  });

  describe('cancel', () => {
    it('should update progress to cancelled state', () => {
      service.cancel();

      const progress = service.currentProgress;
      expect(progress.phase).toBe(SyncPhase.Idle);
      expect(progress.message).toBe('Sync cancelled');
    });
  });

  describe('syncDocuments', () => {
    it('should return success for empty element list', async () => {
      const result = await service.syncDocuments([]);

      expect(result.success).toBe(true);
      expect(result.syncedDocuments).toHaveLength(0);
    });

    it('should sync documents for given element IDs', async () => {
      const result = await service.syncDocuments(['doc-1', 'doc-3']);

      expect(result.success).toBe(true);
      expect(result.syncedDocuments).toContain('doc-1');
      expect(result.syncedDocuments).toContain('doc-3');
      expect(result.failedDocuments).toHaveLength(0);
    });

    it('should sync documents including descendants when parent folder is specified', async () => {
      const result = await service.syncDocuments(['folder-1']);

      expect(result.success).toBe(true);
      // Should include docs under folder-1
      expect(result.syncedDocuments).toContain('doc-1');
      expect(result.syncedDocuments).toContain('doc-2');
    });

    it('checks the full, profile-scoped document id in local mode', async () => {
      await service.syncDocuments(['doc-1']);

      expect(documentServiceMock.hasLocalContent).toHaveBeenCalledWith(
        docId('doc-1')
      );
      expect(indexedDbOpen).not.toHaveBeenCalled();
      expect(documentServiceMock.syncDocumentToServer).not.toHaveBeenCalled();
    });

    it('does not create sync-status signals', async () => {
      await service.syncDocuments(['folder-1', 'doc-3']);

      expect(documentServiceMock.getSyncStatusSignal).not.toHaveBeenCalled();
    });

    it('treats a missing local copy as an empty document in local mode', async () => {
      documentServiceMock.hasLocalContent.mockImplementation(id =>
        Promise.resolve(id === docId('doc-1'))
      );

      const result = await service.syncDocuments(['doc-1', 'doc-3']);

      expect(result.success).toBe(true);
      expect(result.syncedDocuments).toEqual(['doc-1']);
      expect(result.failedDocuments).toHaveLength(0);
      expect(result.warnings).toContain('"Standalone Doc" has no content');
    });

    it('fails when no project is loaded', async () => {
      projectStateMock.project.set(undefined);

      const result = await service.syncDocuments(['doc-1']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No project loaded');
    });

    it('should emit complete event when done', async () => {
      let completedResult: SyncResult | undefined;
      service.complete$.subscribe(r => {
        completedResult = r;
      });

      await service.syncDocuments(['doc-1']);

      expect(completedResult).toBeDefined();
      expect(completedResult!.success).toBe(true);
    });

    it('should update progress through phases', async () => {
      const phases: SyncPhase[] = [];
      service.progress$.subscribe(p => {
        if (!phases.includes(p.phase)) {
          phases.push(p.phase);
        }
      });

      await service.syncDocuments(['doc-1']);

      expect(phases).toContain(SyncPhase.Analyzing);
      expect(phases).toContain(SyncPhase.SyncingDocuments);
      expect(phases).toContain(SyncPhase.Complete);
    });

    it('should skip asset sync when includeAssets is false', async () => {
      const phases: SyncPhase[] = [];
      service.progress$.subscribe(p => phases.push(p.phase));

      await service.syncDocuments(['doc-1'], false);

      expect(phases).not.toContain(SyncPhase.SyncingAssets);
    });

    it('should include asset sync phase when includeAssets is true', async () => {
      const phases: SyncPhase[] = [];
      service.progress$.subscribe(p => phases.push(p.phase));

      await service.syncDocuments(['doc-1'], true);

      expect(phases).toContain(SyncPhase.SyncingAssets);
    });

    it('should handle cancellation during sync', async () => {
      // Start sync and cancel quickly
      const syncPromise = service.syncDocuments(['doc-1', 'doc-2', 'doc-3']);
      service.cancel();

      const result = await syncPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync cancelled by user');
    });
  });

  describe('syncDocuments in server mode', () => {
    beforeEach(() => {
      setupServiceMock.isServerMode.mockReturnValue(true);
      vi.stubGlobal('navigator', { onLine: true });
    });

    it('pulls each document from the server by its full id', async () => {
      const result = await service.syncDocuments(['folder-1', 'doc-3']);

      expect(plannerMock.plan).toHaveBeenCalledWith('alice', 'novel', [
        docId('doc-1'),
        docId('doc-2'),
        docId('doc-3'),
      ]);
      expect(documentServiceMock.syncDocumentToServer.mock.calls).toEqual([
        [docId('doc-1')],
        [docId('doc-2')],
        [docId('doc-3')],
      ]);
      expect(result.success).toBe(true);
      expect(result.syncedDocuments).toEqual(['doc-1', 'doc-2', 'doc-3']);
      expect(documentServiceMock.getSyncStatusSignal).not.toHaveBeenCalled();
    });

    it('skips documents that are open in an editor', async () => {
      documentServiceMock.getConnectedDocumentIds.mockReturnValue([
        docId('doc-1'),
      ]);

      const result = await service.syncDocuments(['doc-1', 'doc-3']);

      expect(plannerMock.plan).toHaveBeenCalledWith('alice', 'novel', [
        docId('doc-3'),
      ]);
      expect(documentServiceMock.syncDocumentToServer).toHaveBeenCalledTimes(1);
      expect(result.syncedDocuments).toEqual(['doc-1', 'doc-3']);
    });

    it('skips documents the planner proves unchanged and checkpoints the rest', async () => {
      const before = new Map();
      plannerMock.plan.mockResolvedValue({
        toSync: [docId('doc-3')],
        skipped: [docId('doc-1')],
        before,
      });
      documentServiceMock.syncDocumentToServer.mockResolvedValue('d3');

      const result = await service.syncDocuments(['doc-1', 'doc-3']);

      expect(documentServiceMock.syncDocumentToServer).toHaveBeenCalledWith(
        docId('doc-3')
      );
      expect(documentServiceMock.syncDocumentToServer).toHaveBeenCalledTimes(1);
      expect(result.syncedDocuments).toEqual(
        expect.arrayContaining(['doc-1', 'doc-3'])
      );
      expect(plannerMock.record).toHaveBeenCalledWith(
        'alice',
        'novel',
        before,
        new Map([[docId('doc-3'), 'd3']])
      );
    });

    it('falls back to the local copy when a server sync fails', async () => {
      documentServiceMock.syncDocumentToServer.mockRejectedValue(
        new Error('Sync timeout')
      );

      const result = await service.syncDocuments(['doc-1']);

      expect(documentServiceMock.hasLocalContent).toHaveBeenCalledWith(
        docId('doc-1')
      );
      expect(result.success).toBe(true);
      expect(result.syncedDocuments).toEqual(['doc-1']);
      expect(result.warnings[0]).toContain('using the copy on this device');
    });

    it('fails a document that could not be synced and has no local copy', async () => {
      documentServiceMock.syncDocumentToServer.mockResolvedValue(null);
      documentServiceMock.hasLocalContent.mockResolvedValue(false);

      const result = await service.syncDocuments(['doc-1']);

      expect(result.success).toBe(false);
      expect(result.failedDocuments).toEqual(['doc-1']);
      expect(plannerMock.record).toHaveBeenCalledWith(
        'alice',
        'novel',
        null,
        new Map()
      );
    });

    it('checks local copies instead of syncing when offline', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      documentServiceMock.hasLocalContent.mockImplementation(id =>
        Promise.resolve(id === docId('doc-1'))
      );

      const result = await service.syncDocuments(['doc-1', 'doc-3']);

      expect(documentServiceMock.syncDocumentToServer).not.toHaveBeenCalled();
      expect(result.syncedDocuments).toEqual(['doc-1']);
      expect(result.failedDocuments).toEqual(['doc-3']);
      expect(result.warnings[0]).toContain('Offline');
    });
  });

  describe('verifyLocalAvailability', () => {
    it('should return available true when all documents exist', async () => {
      const result = await service.verifyLocalAvailability(['doc-1']);

      expect(result.available).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(documentServiceMock.hasLocalContent).toHaveBeenCalledWith(
        docId('doc-1')
      );
      expect(indexedDbOpen).not.toHaveBeenCalled();
    });

    it('should return missing documents when some are unavailable', async () => {
      documentServiceMock.hasLocalContent.mockImplementation(id =>
        Promise.resolve(id === docId('doc-1'))
      );

      const result = await service.verifyLocalAvailability(['doc-1', 'doc-3']);

      expect(result.available).toBe(false);
      expect(result.missing).toEqual(['doc-3']);
    });

    it('reports every document missing when no project is loaded', async () => {
      projectStateMock.project.set(undefined);

      const result = await service.verifyLocalAvailability(['doc-1']);

      expect(result.missing).toEqual(['doc-1']);
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Force an error by making elements throw
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      const result = await service.syncDocuments(['doc-1']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('should set error phase on failure', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      await service.syncDocuments(['doc-1']);

      const progress = service.currentProgress;
      expect(progress.phase).toBe(SyncPhase.Error);
    });
  });
});
