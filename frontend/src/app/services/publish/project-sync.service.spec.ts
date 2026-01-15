import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSyncState } from '../../models/document-sync-state';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  ProjectSyncService,
  SyncPhase,
  SyncProgress,
  SyncResult,
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
    appConfig: ReturnType<typeof signal>;
  };
  let documentServiceMock: {
    getSyncStatusSignal: ReturnType<typeof vi.fn>;
  };
  let projectStateMock: {
    elements: ReturnType<typeof signal<Element[]>>;
  };

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
      appConfig: signal({ mode: 'local' }),
    };

    documentServiceMock = {
      getSyncStatusSignal: vi
        .fn()
        .mockReturnValue(signal(DocumentSyncState.Synced)),
    };

    projectStateMock = {
      elements: signal(mockElements),
    };

    // Mock indexedDB
    const mockIndexedDB = {
      open: vi.fn().mockImplementation(() => {
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          result: {
            objectStoreNames: { length: 1 },
            close: vi.fn(),
          },
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({} as Event);
          }
        }, 0);
        return request;
      }),
    };
    vi.stubGlobal('indexedDB', mockIndexedDB);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProjectSyncService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    });

    service = TestBed.inject(ProjectSyncService);
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

    it('should handle sync failures gracefully', async () => {
      // Mock IndexedDB to fail
      const failingIndexedDB = {
        open: vi.fn().mockImplementation(() => {
          const request = {
            onsuccess: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
            result: {
              objectStoreNames: { length: 0 }, // No data
              close: vi.fn(),
            },
          };
          setTimeout(() => {
            if (request.onsuccess) {
              request.onsuccess({} as Event);
            }
          }, 0);
          return request;
        }),
      };
      vi.stubGlobal('indexedDB', failingIndexedDB);

      const result = await service.syncDocuments(['doc-1']);

      expect(result.failedDocuments).toContain('doc-1');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should complete sync with errors when some documents fail', async () => {
      // Set up one document to fail
      const mixedIndexedDB = {
        open: vi.fn().mockImplementation((dbName: string) => {
          const request = {
            onsuccess: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
            result: {
              objectStoreNames: { length: dbName === 'doc-1' ? 1 : 0 },
              close: vi.fn(),
            },
          };
          setTimeout(() => {
            if (request.onsuccess) {
              request.onsuccess({} as Event);
            }
          }, 0);
          return request;
        }),
      };
      vi.stubGlobal('indexedDB', mixedIndexedDB);

      const result = await service.syncDocuments(['doc-1', 'doc-3']);

      expect(result.syncedDocuments).toContain('doc-1');
      expect(result.failedDocuments).toContain('doc-3');
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
      setupServiceMock.appConfig = signal({ mode: 'server' });
    });

    it('should wait for document sync via WebSocket', async () => {
      documentServiceMock.getSyncStatusSignal.mockReturnValue(
        signal(DocumentSyncState.Synced)
      );

      const result = await service.syncDocuments(['doc-1']);

      expect(result.success).toBe(true);
      expect(documentServiceMock.getSyncStatusSignal).toHaveBeenCalledWith(
        'doc-1'
      );
    });

    it('should handle offline documents in server mode', async () => {
      documentServiceMock.getSyncStatusSignal.mockReturnValue(
        signal(DocumentSyncState.Local)
      );

      const result = await service.syncDocuments(['doc-1']);

      expect(result.success).toBe(true);
    });
  });

  describe('verifyLocalAvailability', () => {
    it('should return available true when all documents exist', async () => {
      const result = await service.verifyLocalAvailability(['doc-1']);

      expect(result.available).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return missing documents when some are unavailable', async () => {
      // Mock IndexedDB to return no data for one document
      const mixedIndexedDB = {
        open: vi.fn().mockImplementation((dbName: string) => {
          const request = {
            onsuccess: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
            result: {
              objectStoreNames: { length: dbName === 'doc-1' ? 1 : 0 },
              close: vi.fn(),
            },
          };
          setTimeout(() => {
            if (request.onsuccess) {
              request.onsuccess({} as Event);
            }
          }, 0);
          return request;
        }),
      };
      vi.stubGlobal('indexedDB', mixedIndexedDB);

      const result = await service.verifyLocalAvailability(['doc-1', 'doc-3']);

      expect(result.available).toBe(false);
      expect(result.missing).toContain('doc-3');
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
