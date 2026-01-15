import 'fake-indexeddb/auto';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectsService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { ProjectService } from '../project/project.service';
import { BackgroundSyncService } from './background-sync.service';
import { ProjectSyncService } from './project-sync.service';
import { StorageService } from './storage.service';

describe('BackgroundSyncService', () => {
  let service: BackgroundSyncService;
  let _setupService: SetupService;
  let projectSyncService: ProjectSyncService;
  let _projectService: ProjectService;
  let _projectsApi: ProjectsService;
  let _loggerService: LoggerService;

  const mockProjectsApi = {
    createProject: vi.fn(),
    updateProject: vi.fn(),
  };

  const mockProjectService = {
    updateLocalProjectWithServerData: vi.fn(),
    getProjectByUsernameAndSlug: vi.fn(),
    updateProject: vi.fn(),
  };

  const mockSetupService = {
    getMode: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default to server mode
    mockSetupService.getMode.mockReturnValue('server');

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageService,
        ProjectSyncService,
        BackgroundSyncService,
        { provide: SetupService, useValue: mockSetupService },
        { provide: ProjectsService, useValue: mockProjectsApi },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    });

    service = TestBed.inject(BackgroundSyncService);
    _setupService = TestBed.inject(SetupService);
    projectSyncService = TestBed.inject(ProjectSyncService);
    _projectService = TestBed.inject(
      ProjectService
    ) as unknown as ProjectService;
    _projectsApi = TestBed.inject(ProjectsService);
    _loggerService = TestBed.inject(LoggerService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    const storageService = TestBed.inject(StorageService);
    storageService.closeAll();
    // Reset IndexedDB for clean state
    indexedDB = new IDBFactory();
  });

  describe('initialize', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should skip initialization in offline mode', () => {
      mockSetupService.getMode.mockReturnValue('local');

      service.initialize();

      expect(mockLoggerService.debug).toHaveBeenCalledWith(
        'BackgroundSync',
        'Skipping initialization - not in server mode'
      );
    });

    it('should initialize in server mode', () => {
      mockSetupService.getMode.mockReturnValue('server');

      service.initialize();

      expect(mockLoggerService.info).toHaveBeenCalledWith(
        'BackgroundSync',
        'Background sync service initialized'
      );
    });

    it('should only initialize once', () => {
      service.initialize();
      service.initialize();

      // Only one initialization log
      const initCalls = (mockLoggerService.info as Mock).mock.calls.filter(
        (call: unknown[]) => call[1] === 'Background sync service initialized'
      );
      expect(initCalls.length).toBe(1);
    });
  });

  describe('syncPendingItems', () => {
    it('should skip sync when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      const result = await service.syncPendingItems();

      expect(result).toBe(false);
      expect(mockLoggerService.debug).toHaveBeenCalledWith(
        'BackgroundSync',
        'Offline, skipping sync'
      );
    });

    it('should return true when no pending items', async () => {
      const result = await service.syncPendingItems();

      expect(result).toBe(true);
    });

    it('should prevent concurrent syncs', async () => {
      // Start two syncs simultaneously
      const sync1 = service.syncPendingItems();
      const sync2 = service.syncPendingItems();

      const [result1, result2] = await Promise.all([sync1, sync2]);

      // One should succeed, one should skip
      expect([result1, result2]).toContain(true);
      expect([result1, result2]).toContain(false);
    });
  });

  describe('syncPendingCreations', () => {
    it('should sync pending project creations', async () => {
      // Set up a pending creation
      const projectKey = 'alice/my-project';
      await projectSyncService.markPendingCreation(projectKey, {
        title: 'My Project',
        slug: 'my-project',
        description: 'Test project',
      });

      // Mock successful API call
      mockProjectsApi.createProject.mockReturnValue(
        of({
          id: 'server-id-123',
          title: 'My Project',
          slug: 'my-project',
          description: 'Test project',
          username: 'alice',
        })
      );
      mockProjectService.updateLocalProjectWithServerData.mockResolvedValue(
        undefined
      );

      const result = await service.syncPendingItems();

      expect(result).toBe(true);
      expect(mockProjectsApi.createProject).toHaveBeenCalledWith({
        title: 'My Project',
        slug: 'my-project',
        description: 'Test project',
      });
      expect(
        mockProjectService.updateLocalProjectWithServerData
      ).toHaveBeenCalledWith('alice', 'my-project', expect.any(Object));
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        'BackgroundSync',
        `Successfully synced project creation: ${projectKey}`
      );
    });

    it('should handle API errors during creation sync', async () => {
      // Set up a pending creation
      const projectKey = 'alice/failing-project';
      await projectSyncService.markPendingCreation(projectKey, {
        title: 'Failing Project',
        slug: 'failing-project',
      });

      // Mock failed API call
      mockProjectsApi.createProject.mockReturnValue(
        throwError(() => new Error('Server error'))
      );

      const result = await service.syncPendingItems();

      expect(result).toBe(false);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'BackgroundSync',
        `Failed to sync project creation: ${projectKey}`,
        expect.any(Error)
      );

      // Should have marked sync error
      const state = projectSyncService.getSyncState(projectKey);
      expect(state().lastError).toBe('Server error');
    });
  });

  describe('syncPendingMetadata', () => {
    it('should sync pending metadata updates', async () => {
      // Set up pending metadata
      const projectKey = 'bob/existing-project';
      await projectSyncService.markPendingMetadata(projectKey, {
        title: 'Updated Title',
      });

      // Mock getting existing project
      mockProjectService.getProjectByUsernameAndSlug.mockResolvedValue({
        id: 'existing-id',
        title: 'Old Title',
        slug: 'existing-project',
        description: 'Some description',
        username: 'bob',
      });
      mockProjectService.updateProject.mockResolvedValue(undefined);

      const result = await service.syncPendingItems();

      expect(result).toBe(true);
      expect(
        mockProjectService.getProjectByUsernameAndSlug
      ).toHaveBeenCalledWith('bob', 'existing-project');
      expect(mockProjectService.updateProject).toHaveBeenCalledWith(
        'bob',
        'existing-project',
        expect.objectContaining({
          title: 'Updated Title',
          description: 'Some description',
        })
      );
    });

    it('should handle missing project during metadata sync', async () => {
      // Set up pending metadata
      const projectKey = 'bob/missing-project';
      await projectSyncService.markPendingMetadata(projectKey, {
        title: 'New Title',
      });

      // Mock project not found
      mockProjectService.getProjectByUsernameAndSlug.mockResolvedValue(null);

      const result = await service.syncPendingItems();

      // Should still succeed since we just skip missing projects
      expect(result).toBe(true);
      expect(mockProjectService.updateProject).not.toHaveBeenCalled();
    });
  });

  describe('ngOnDestroy', () => {
    it('should clean up event listeners', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      service.initialize();
      service.ngOnDestroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'online',
        expect.any(Function)
      );
    });
  });

  describe('network event handling', () => {
    it('should sync when coming online', async () => {
      service.initialize();

      // Create a pending creation to sync
      await projectSyncService.markPendingCreation('test/project', {
        title: 'Test',
        slug: 'project',
      });
      mockProjectsApi.createProject.mockReturnValue(
        of({ id: '1', title: 'Test', slug: 'project' })
      );
      mockProjectService.updateLocalProjectWithServerData.mockResolvedValue(
        undefined
      );

      // Simulate coming online
      window.dispatchEvent(new Event('online'));

      // Wait for async sync
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLoggerService.info).toHaveBeenCalledWith(
        'BackgroundSync',
        'Network connectivity restored, syncing pending items...'
      );
    });
  });
});
