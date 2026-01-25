import { TestBed } from '@angular/core/testing';
import { Project, ProjectsService } from '@inkweld/index';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { MediaSyncService, MediaSyncState } from '../local/media-sync.service';
import { SyncQueueService, SyncStage } from './sync-queue.service';

describe('SyncQueueService', () => {
  let service: SyncQueueService;
  let mockProjectsApi: { getProject: Mock };
  let mockMediaSyncService: {
    checkSyncStatus: Mock;
    downloadAllFromServer: Mock;
  };
  let mockSetupService: { getMode: Mock };
  let mockLogger: { info: Mock; warn: Mock; error: Mock; debug: Mock };

  const createMockProject = (id: string, slug: string): Project => ({
    id,
    slug,
    title: `Project ${slug}`,
    description: null,
    username: 'testuser',
    coverImage: null,
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  });

  const createMockMediaSyncState = (needsDownload = 0): MediaSyncState => ({
    isSyncing: false,
    lastChecked: new Date().toISOString(),
    needsDownload,
    needsUpload: 0,
    items: [],
    downloadProgress: 100,
  });

  beforeEach(() => {
    mockProjectsApi = {
      getProject: vi.fn().mockReturnValue(of({ id: '1', slug: 'test' })),
    };

    mockMediaSyncService = {
      checkSyncStatus: vi.fn().mockResolvedValue(createMockMediaSyncState()),
      downloadAllFromServer: vi.fn().mockResolvedValue(undefined),
    };

    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        SyncQueueService,
        { provide: ProjectsService, useValue: mockProjectsApi },
        { provide: MediaSyncService, useValue: mockMediaSyncService },
        { provide: SetupService, useValue: mockSetupService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(SyncQueueService);
  });

  describe('initial state', () => {
    it('should have initial queue state', () => {
      expect(service.queueState()).toEqual({
        isActive: false,
        totalProjects: 0,
        completedProjects: 0,
        failedProjects: 0,
        currentProjectKey: null,
      });
    });

    it('should not be syncing initially', () => {
      expect(service.isSyncing()).toBe(false);
    });

    it('should have 0 overall progress initially', () => {
      expect(service.overallProgress()).toBe(0);
    });
  });

  describe('syncAllProjects', () => {
    it('should not sync in local mode', async () => {
      mockSetupService.getMode.mockReturnValue('local');
      const projects = [createMockProject('1', 'test-project')];

      await service.syncAllProjects(projects);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SyncQueueService',
        'Sync only available in server mode'
      );
      expect(service.queueState().isActive).toBe(false);
    });

    it('should not sync with empty projects array', async () => {
      await service.syncAllProjects([]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'SyncQueueService',
        'No projects to sync'
      );
      expect(service.queueState().isActive).toBe(false);
    });

    it('should sync projects successfully', async () => {
      const projects = [
        createMockProject('1', 'project-1'),
        createMockProject('2', 'project-2'),
      ];

      await service.syncAllProjects(projects);

      // After sync completes
      expect(service.queueState().isActive).toBe(false);
      expect(service.queueState().totalProjects).toBe(2);
      expect(service.queueState().completedProjects).toBe(2);
      expect(service.queueState().failedProjects).toBe(0);
    });

    it('should create status signals for each project', async () => {
      const projects = [createMockProject('1', 'project-1')];

      // Start sync
      const syncPromise = service.syncAllProjects(projects);

      // Check that status was created
      const status = service.getProjectStatus('testuser/project-1');
      expect(status).toBeDefined();

      await syncPromise;

      // Check final status
      expect(status?.().stage).toBe(SyncStage.Completed);
    });

    it('should track overall progress', async () => {
      const projects = [
        createMockProject('1', 'project-1'),
        createMockProject('2', 'project-2'),
      ];

      await service.syncAllProjects(projects);

      // After all complete, progress should be 100%
      expect(service.overallProgress()).toBe(100);
    });

    it('should handle sync failures', async () => {
      mockProjectsApi.getProject.mockImplementation(() => {
        throw new Error('Network error');
      });

      const projects = [createMockProject('1', 'project-1')];

      await service.syncAllProjects(projects);

      expect(service.queueState().failedProjects).toBe(1);
      expect(service.queueState().completedProjects).toBe(0);

      const status = service.getProjectStatus('testuser/project-1');
      expect(status?.().stage).toBe(SyncStage.Failed);
      expect(status?.().error).toBeDefined();
    });

    it('should not start new sync while syncing', async () => {
      const projects1 = [createMockProject('1', 'project-1')];
      const projects2 = [createMockProject('2', 'project-2')];

      // Start first sync
      const syncPromise = service.syncAllProjects(projects1);

      // Try to start second sync immediately
      await service.syncAllProjects(projects2);

      await syncPromise;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SyncQueueService',
        'Sync already in progress'
      );
    });

    it('should download missing media during sync', async () => {
      // Mock that media needs downloading
      mockMediaSyncService.checkSyncStatus.mockResolvedValue(
        createMockMediaSyncState(3) // 3 items need download
      );

      const projects = [createMockProject('1', 'project-1')];

      await service.syncAllProjects(projects);

      // Should have checked sync status
      expect(mockMediaSyncService.checkSyncStatus).toHaveBeenCalledWith(
        'testuser/project-1'
      );
      // Should have downloaded missing media
      expect(mockMediaSyncService.downloadAllFromServer).toHaveBeenCalledWith(
        'testuser/project-1'
      );
    });

    it('should skip media download when all media is synced', async () => {
      // Mock that no media needs downloading
      mockMediaSyncService.checkSyncStatus.mockResolvedValue(
        createMockMediaSyncState(0) // No items need download
      );

      const projects = [createMockProject('1', 'project-1')];

      await service.syncAllProjects(projects);

      // Should have checked sync status
      expect(mockMediaSyncService.checkSyncStatus).toHaveBeenCalledWith(
        'testuser/project-1'
      );
      // Should NOT have downloaded since nothing needed
      expect(mockMediaSyncService.downloadAllFromServer).not.toHaveBeenCalled();
    });

    it('should continue sync even if media sync fails', async () => {
      mockMediaSyncService.checkSyncStatus.mockRejectedValue(
        new Error('Media endpoint not available')
      );

      const projects = [createMockProject('1', 'project-1')];

      await service.syncAllProjects(projects);

      // Sync should complete successfully (media error is non-fatal)
      expect(service.queueState().completedProjects).toBe(1);
      expect(service.queueState().failedProjects).toBe(0);
    });
  });

  describe('cancelSync', () => {
    it('should cancel active sync', () => {
      const projects = [
        createMockProject('1', 'project-1'),
        createMockProject('2', 'project-2'),
      ];

      // Start sync but don't wait
      void service.syncAllProjects(projects);

      // Cancel immediately
      service.cancelSync();

      expect(service.queueState().isActive).toBe(false);
    });

    it('should do nothing if not syncing', () => {
      service.cancelSync();

      expect(service.queueState().isActive).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        'SyncQueueService',
        'Cancelling sync'
      );
    });
  });

  describe('getProjectStatus', () => {
    it('should return undefined for unknown project', () => {
      expect(service.getProjectStatus('unknown/project')).toBeUndefined();
    });

    it('should return status signal for known project', async () => {
      const projects = [createMockProject('1', 'project-1')];
      await service.syncAllProjects(projects);

      const status = service.getProjectStatus('testuser/project-1');
      expect(status).toBeDefined();
      expect(status?.().projectKey).toBe('testuser/project-1');
    });
  });

  describe('isProjectSyncing', () => {
    it('should return false for unknown project', () => {
      expect(service.isProjectSyncing('unknown/project')).toBe(false);
    });

    it('should return false for completed project', async () => {
      const projects = [createMockProject('1', 'project-1')];
      await service.syncAllProjects(projects);

      expect(service.isProjectSyncing('testuser/project-1')).toBe(false);
    });
  });

  describe('isProjectInQueue', () => {
    it('should return false for unknown project', () => {
      expect(service.isProjectInQueue('unknown/project')).toBe(false);
    });

    it('should return true for project in queue', async () => {
      const projects = [createMockProject('1', 'project-1')];
      await service.syncAllProjects(projects);

      // After sync, project is still tracked
      expect(service.isProjectInQueue('testuser/project-1')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const projects = [createMockProject('1', 'project-1')];
      await service.syncAllProjects(projects);

      service.reset();

      expect(service.queueState()).toEqual({
        isActive: false,
        totalProjects: 0,
        completedProjects: 0,
        failedProjects: 0,
        currentProjectKey: null,
      });
      expect(service.getProjectStatus('testuser/project-1')).toBeUndefined();
    });
  });
});
