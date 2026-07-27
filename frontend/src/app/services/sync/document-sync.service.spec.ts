import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Project } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { SyncQueueService } from '@services/sync/sync-queue.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { DocumentSyncService } from './document-sync.service';

describe('DocumentSyncService', () => {
  let service: DocumentSyncService;
  let mockProjectState: Partial<ProjectStateService>;
  let mockSyncQueueService: Partial<SyncQueueService>;
  let mockSetupService: Partial<SetupService>;

  const mockProject = {
    id: 'p1',
    username: 'user',
    slug: 'proj',
  } as Project;

  beforeEach(() => {
    mockProjectState = {
      project: signal(mockProject),
      isDocumentUnavailable: vi.fn().mockResolvedValue(false),
    };

    mockSyncQueueService = {
      syncAllProjects: vi.fn().mockResolvedValue(undefined),
      queueState: signal({
        isActive: false,
        totalProjects: 1,
        completedProjects: 1,
        failedProjects: 0,
        currentProjectKey: null,
      }),
    };

    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        DocumentSyncService,
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: SyncQueueService, useValue: mockSyncQueueService },
        { provide: SetupService, useValue: mockSetupService },
      ],
    });

    service = TestBed.inject(DocumentSyncService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('checkAvailability', () => {
    it('sets documentUnavailable to true when isDocumentUnavailable returns true', async () => {
      (
        mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true);
      await service.checkAvailability('elem-1');
      expect(service.documentUnavailable()).toBe(true);
    });

    it('sets documentUnavailable to false when isDocumentUnavailable returns false', async () => {
      (
        mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      await service.checkAvailability('elem-1');
      expect(service.documentUnavailable()).toBe(false);
    });

    it('passes docType to isDocumentUnavailable', async () => {
      await service.checkAvailability('elem-1', 'worldbuilding');
      expect(mockProjectState.isDocumentUnavailable).toHaveBeenCalledWith(
        'elem-1',
        'worldbuilding'
      );
    });

    it('defaults docType to document', async () => {
      await service.checkAvailability('elem-1');
      expect(mockProjectState.isDocumentUnavailable).toHaveBeenCalledWith(
        'elem-1',
        'document'
      );
    });

    it('does nothing when elementId is empty', async () => {
      await service.checkAvailability('');
      expect(mockProjectState.isDocumentUnavailable).not.toHaveBeenCalled();
    });

    describe('auto-sync', () => {
      it('auto-triggers sync when document unavailable, online, and in server mode', async () => {
        (
          mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
        ).mockResolvedValue(true);
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

        await service.checkAvailability('elem-1');

        expect(mockSyncQueueService.syncAllProjects).toHaveBeenCalledWith(
          [mockProject],
          'user:proj:elem-1'
        );
      });

      it('does not auto-sync when offline', async () => {
        (
          mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
        ).mockResolvedValue(true);
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

        await service.checkAvailability('elem-1');

        expect(mockSyncQueueService.syncAllProjects).not.toHaveBeenCalled();
      });

      it('does not auto-sync in local mode', async () => {
        (
          mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
        ).mockResolvedValue(true);
        (mockSetupService.getMode as ReturnType<typeof vi.fn>).mockReturnValue(
          'local'
        );
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

        await service.checkAvailability('elem-1');

        expect(mockSyncQueueService.syncAllProjects).not.toHaveBeenCalled();
      });

      it('only auto-syncs once per document', async () => {
        (
          mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
        ).mockResolvedValue(true);
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

        await service.checkAvailability('elem-1');
        await service.checkAvailability('elem-1');

        expect(mockSyncQueueService.syncAllProjects).toHaveBeenCalledTimes(1);
      });

      it('auto-syncs again for a different document', async () => {
        (
          mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
        ).mockResolvedValue(true);
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

        await service.checkAvailability('elem-1');
        await service.checkAvailability('elem-2');

        expect(mockSyncQueueService.syncAllProjects).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('triggerSync', () => {
    it('calls syncAllProjects with the current project and priority document ID', async () => {
      await service.triggerSync('elem-1');
      expect(mockSyncQueueService.syncAllProjects).toHaveBeenCalledWith(
        [mockProject],
        'user:proj:elem-1'
      );
    });

    it('sets syncing to true during sync and false after', async () => {
      const syncPromise = service.triggerSync('elem-1');
      expect(service.syncing()).toBe(true);
      await syncPromise;
      expect(service.syncing()).toBe(false);
    });

    it('sets syncError when queueState reports failed projects', async () => {
      (mockSyncQueueService.queueState as ReturnType<typeof signal>).set({
        isActive: false,
        totalProjects: 1,
        completedProjects: 0,
        failedProjects: 1,
        currentProjectKey: null,
      });
      await service.triggerSync('elem-1');
      expect(service.syncError()).toBe(
        'Sync failed. Check your connection and try again.'
      );
    });

    it('clears syncError and updates availability on successful sync', async () => {
      (
        mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      await service.triggerSync('elem-1');
      expect(service.syncError()).toBeNull();
      expect(service.documentUnavailable()).toBe(false);
    });

    it('sets syncError when document still unavailable after successful sync', async () => {
      (
        mockProjectState.isDocumentUnavailable as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true);
      await service.triggerSync('elem-1');
      expect(service.syncError()).toBe(
        'Document still unavailable after sync. Try again.'
      );
    });

    it('does nothing if no project is loaded', async () => {
      (mockProjectState.project as ReturnType<typeof signal>).set(null);
      await service.triggerSync('elem-1');
      expect(mockSyncQueueService.syncAllProjects).not.toHaveBeenCalled();
    });

    it('passes docType to isDocumentUnavailable on re-check', async () => {
      await service.triggerSync('elem-1', 'worldbuilding');
      expect(mockProjectState.isDocumentUnavailable).toHaveBeenCalledWith(
        'elem-1',
        'worldbuilding'
      );
    });
  });
});
