import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Project } from '@inkweld/index';
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentService } from '../project/document.service';
import { DocumentImportService } from '../project/document-import.service';
import { ProjectService } from '../project/project.service';
import { ProjectTemplateService } from '../project/project-template.service';
import { UnifiedUserService } from '../user/unified-user.service';
import { LocalProjectService } from './local-project.service';
import { LocalProjectElementsService } from './local-project-elements.service';
import { LocalStorageService } from './local-storage.service';
import { ProjectSyncService } from './project-sync.service';
import { UnifiedProjectService } from './unified-project.service';

describe('UnifiedProjectService', () => {
  let service: UnifiedProjectService;
  let setupService: MockedObject<SetupService>;
  let projectService: MockedObject<ProjectService>;
  let localProjectService: MockedObject<LocalProjectService>;

  const mockProject1: Project = {
    id: '1',
    title: 'Test Project 1',
    description: 'A test project',
    slug: 'test-project-1',
    username: 'testuser',
    createdDate: '2024-01-01T00:00:00Z',
    updatedDate: '2024-01-01T00:00:00Z',
  };

  const mockProject2: Project = {
    id: '2',
    title: 'Test Project 2',
    description: 'Another test project',
    slug: 'test-project-2',
    username: 'testuser',
    createdDate: '2024-01-01T00:00:00Z',
    updatedDate: '2024-01-01T00:00:00Z',
  };

  const mockOfflineProject: Project = {
    id: 'offline-1',
    title: 'Offline Project',
    description: 'An offline project',
    slug: 'offline-project',
    username: 'offlineuser',
    createdDate: '2024-01-01T00:00:00Z',
    updatedDate: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    const projectsSignal = signal([mockProject1, mockProject2]);
    const isLoadingSignal = signal(false);
    const initializedSignal = signal(true);
    const errorSignal = signal(null);

    const localProjectsSignal = signal([mockOfflineProject]);
    const offlineIsLoadingSignal = signal(false);
    const offlineInitializedSignal = signal(true);

    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
    } as unknown as MockedObject<SetupService>;

    projectService = {
      projects: projectsSignal,
      isLoading: isLoadingSignal,
      initialized: initializedSignal,
      error: errorSignal,
      loadAllProjects: vi.fn().mockResolvedValue(undefined),
      getProjectByUsernameAndSlug: vi.fn().mockResolvedValue(mockProject1),
      createProject: vi.fn().mockResolvedValue(mockProject1),
      updateProject: vi.fn().mockResolvedValue(mockProject1),
      deleteProject: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<ProjectService>;

    localProjectService = {
      projects: localProjectsSignal,
      isLoading: offlineIsLoadingSignal,
      initialized: offlineInitializedSignal,
      loadProjects: vi.fn(),
      getProject: vi.fn().mockResolvedValue(mockOfflineProject),
      createProject: vi.fn().mockResolvedValue(mockOfflineProject),
      updateProject: vi.fn().mockResolvedValue(mockOfflineProject),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      getProjectsByUsername: vi.fn().mockReturnValue([mockOfflineProject]),
      importProjects: vi.fn(),
    } as unknown as MockedObject<LocalProjectService>;

    const mockUserService = {
      currentUser: vi.fn().mockReturnValue({ username: 'testuser' }),
    };

    const mockProjectSyncService = {
      markPendingCreation: vi.fn().mockResolvedValue(undefined),
      clearPendingCreation: vi.fn().mockResolvedValue(undefined),
    };

    const mockLoggerService = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const mockDocumentService = {
      syncDocumentsToServer: vi
        .fn()
        .mockResolvedValue({ success: [], failed: [] }),
      syncWorldbuildingToServerBatch: vi
        .fn()
        .mockResolvedValue({ success: [], failed: [] }),
    };

    const mockTemplateService = {
      loadTemplate: vi.fn().mockResolvedValue({
        manifest: {},
        project: {},
        elements: [],
        documents: [],
        worldbuilding: [],
        schemas: [],
        relationships: [],
        customRelationshipTypes: [],
        tags: [],
        elementTags: [],
        publishPlans: [],
        timeSystems: [],
        snapshots: [],
        media: [],
      }),
    };

    const mockDocumentImportService = {
      writeDocumentContent: vi.fn().mockResolvedValue(undefined),
      writeWorldbuildingData: vi.fn().mockResolvedValue(undefined),
    };

    const mockLocalElements = {
      saveElements: vi.fn().mockResolvedValue(undefined),
      saveSchemas: vi.fn().mockResolvedValue(undefined),
      saveRelationships: vi.fn().mockResolvedValue(undefined),
      saveCustomRelationshipTypes: vi.fn().mockResolvedValue(undefined),
      savePublishPlans: vi.fn().mockResolvedValue(undefined),
      saveTimeSystems: vi.fn().mockResolvedValue(undefined),
      saveCustomTags: vi.fn().mockResolvedValue(undefined),
      saveElementTags: vi.fn().mockResolvedValue(undefined),
    };

    const mockLocalStorage = {
      saveMedia: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        UnifiedProjectService,
        { provide: SetupService, useValue: setupService },
        { provide: ProjectService, useValue: projectService },
        { provide: LocalProjectService, useValue: localProjectService },
        { provide: UnifiedUserService, useValue: mockUserService },
        { provide: ProjectSyncService, useValue: mockProjectSyncService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: DocumentService, useValue: mockDocumentService },
        { provide: ProjectTemplateService, useValue: mockTemplateService },
        { provide: DocumentImportService, useValue: mockDocumentImportService },
        {
          provide: LocalProjectElementsService,
          useValue: mockLocalElements,
        },
        { provide: LocalStorageService, useValue: mockLocalStorage },
      ],
    });

    service = TestBed.inject(UnifiedProjectService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('server mode', () => {
    beforeEach(() => {
      setupService.getMode.mockReturnValue('server');
    });

    it('should return server projects', () => {
      const projects = service.projects();
      expect(projects).toEqual([mockProject1, mockProject2]);
    });

    it('should return server isLoading', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should return server initialized', () => {
      expect(service.initialized()).toBe(true);
    });

    it('should return server error', () => {
      expect(service.error()).toBeNull();
    });

    it('should compute hasProjects correctly', () => {
      expect(service.hasProjects()).toBe(true);
    });

    it('should load projects from server', async () => {
      await service.loadProjects();
      expect(projectService.loadAllProjects).toHaveBeenCalled();
    });

    it('should get project from server', async () => {
      const project = await service.getProject('testuser', 'test-project-1');
      expect(project).toEqual(mockProject1);
      expect(projectService.getProjectByUsernameAndSlug).toHaveBeenCalledWith(
        'testuser',
        'test-project-1'
      );
    });

    it('should create project on server', async () => {
      const projectData: Partial<Project> = {
        title: 'New Project',
        slug: 'new-project',
      };
      const result = await service.createProject(projectData);
      expect(result).toEqual(mockProject1);
      expect(projectService.createProject).toHaveBeenCalled();
    });

    it('should create project with default values', async () => {
      const projectData: Partial<Project> = {};
      await service.createProject(projectData);
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Untitled Project',
          slug: 'untitled-project',
          username: 'testuser', // From mock user service
        })
      );
    });

    it('should update project on server', async () => {
      const updates: Partial<Project> = { title: 'Updated Title' };
      const result = await service.updateProject(
        'testuser',
        'test-project-1',
        updates
      );
      expect(result).toEqual(mockProject1);
      expect(projectService.getProjectByUsernameAndSlug).toHaveBeenCalledWith(
        'testuser',
        'test-project-1'
      );
      expect(projectService.updateProject).toHaveBeenCalled();
    });

    it('should delete project from server', async () => {
      await service.deleteProject('testuser', 'test-project-1');
      expect(projectService.deleteProject).toHaveBeenCalledWith(
        'testuser',
        'test-project-1'
      );
    });

    it('should filter projects by username', () => {
      const projects = service.getProjectsByUsername('testuser');
      expect(projects).toEqual([mockProject1, mockProject2]);
    });

    it('should throw error when importing in server mode', () => {
      expect(() => service.importProjects([mockProject1])).toThrow(
        'Import not yet supported in server mode'
      );
    });
  });

  describe('offline mode', () => {
    beforeEach(() => {
      setupService.getMode.mockReturnValue('local');
    });

    it('should return offline projects', () => {
      const projects = service.projects();
      expect(projects).toEqual([mockOfflineProject]);
    });

    it('should return offline isLoading', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should return offline initialized', () => {
      expect(service.initialized()).toBe(true);
    });

    it('should return undefined error in offline mode', () => {
      expect(service.error()).toBeUndefined();
    });

    it('should compute hasProjects correctly', () => {
      expect(service.hasProjects()).toBe(true);
    });

    it('should load projects from offline service', async () => {
      await service.loadProjects();
      expect(localProjectService.loadProjects).toHaveBeenCalled();
    });

    it('should get project from offline service', async () => {
      const project = await service.getProject(
        'offlineuser',
        'offline-project'
      );
      expect(project).toEqual(mockOfflineProject);
      expect(localProjectService.getProject).toHaveBeenCalledWith(
        'offlineuser',
        'offline-project'
      );
    });

    it('should create project in offline mode', async () => {
      const projectData: Partial<Project> = {
        title: 'New Offline Project',
        slug: 'new-offline-project',
      };
      const result = await service.createProject(projectData);
      expect(result).toEqual(mockOfflineProject);
      expect(localProjectService.createProject).toHaveBeenCalledWith(
        projectData
      );
    });

    it('should update project in offline mode', async () => {
      const updates: Partial<Project> = { title: 'Updated Offline Title' };
      const result = await service.updateProject(
        'offlineuser',
        'offline-project',
        updates
      );
      expect(result).toEqual(mockOfflineProject);
      expect(localProjectService.updateProject).toHaveBeenCalledWith(
        'offlineuser',
        'offline-project',
        updates
      );
    });

    it('should delete project from offline service', async () => {
      await service.deleteProject('offlineuser', 'offline-project');
      expect(localProjectService.deleteProject).toHaveBeenCalledWith(
        'offlineuser',
        'offline-project'
      );
    });

    it('should get projects by username from offline service', () => {
      const projects = service.getProjectsByUsername('offlineuser');
      expect(projects).toEqual([mockOfflineProject]);
      expect(localProjectService.getProjectsByUsername).toHaveBeenCalledWith(
        'offlineuser'
      );
    });

    it('should import projects in offline mode', () => {
      service.importProjects([mockProject1]);
      expect(localProjectService.importProjects).toHaveBeenCalledWith([
        mockProject1,
      ]);
    });
  });

  describe('no mode configured', () => {
    beforeEach(() => {
      setupService.getMode.mockReturnValue(null);
    });

    it('should return null when getting project', async () => {
      const project = await service.getProject('user', 'slug');
      expect(project).toBeNull();
    });

    it('should throw error when creating project', async () => {
      await expect(service.createProject({})).rejects.toThrow(
        'No mode configured'
      );
    });

    it('should throw error when updating project', async () => {
      await expect(service.updateProject('user', 'slug', {})).rejects.toThrow(
        'No mode configured'
      );
    });

    it('should return empty array when getting projects by username', () => {
      const projects = service.getProjectsByUsername('user');
      expect(projects).toEqual([]);
    });
  });

  describe('getMode', () => {
    it('should return current mode', () => {
      setupService.getMode.mockReturnValue('server');
      expect(service.getMode()).toBe('server');

      setupService.getMode.mockReturnValue('local');
      expect(service.getMode()).toBe('local');

      setupService.getMode.mockReturnValue(null);
      expect(service.getMode()).toBeNull();
    });
  });

  describe('applyTemplate with media', () => {
    it('should save media blobs to local storage', async () => {
      setupService.getMode.mockReturnValue('local');

      const mockBlob = new Blob(['image-data'], { type: 'image/png' });
      const mockTemplateService = TestBed.inject(
        ProjectTemplateService
      ) as unknown as MockedObject<ProjectTemplateService>;
      (
        mockTemplateService.loadTemplate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        manifest: {},
        project: {},
        elements: [],
        documents: [],
        worldbuilding: [],
        schemas: [],
        relationships: [],
        customRelationshipTypes: [],
        tags: [],
        elementTags: [],
        publishPlans: [],
        timeSystems: [],
        snapshots: [],
        media: [
          {
            mediaId: 'img-hero',
            filename: 'hero.png',
            archivePath: 'media/hero.png',
            mimeType: 'image/png',
            blob: mockBlob,
          },
          {
            mediaId: 'img-villain',
            filename: 'villain.jpg',
            archivePath: 'media/villain.jpg',
            mimeType: 'image/jpeg',
            // No blob - should be skipped
          },
        ],
      });

      const mockLocalStorage = TestBed.inject(
        LocalStorageService
      ) as unknown as MockedObject<LocalStorageService>;

      await service.createProject(
        { title: 'New Project', slug: 'new-project' },
        'worldbuilding-demo'
      );

      // Only the entry with a blob should be saved
      expect(mockLocalStorage.saveMedia).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage.saveMedia).toHaveBeenCalledWith(
        'offlineuser/offline-project',
        'img-hero',
        mockBlob,
        'hero.png'
      );
    });

    it('should not call saveMedia when template has no media', async () => {
      setupService.getMode.mockReturnValue('local');

      const mockLocalStorage = TestBed.inject(
        LocalStorageService
      ) as unknown as MockedObject<LocalStorageService>;

      await service.createProject(
        { title: 'New Project', slug: 'new-project' },
        'worldbuilding-empty'
      );

      expect(mockLocalStorage.saveMedia).not.toHaveBeenCalled();
    });
  });

  describe('applyTemplate with time systems', () => {
    it('should save time systems from the template archive', async () => {
      setupService.getMode.mockReturnValue('local');

      const mockTemplateService = TestBed.inject(
        ProjectTemplateService
      ) as unknown as MockedObject<ProjectTemplateService>;
      const timeSystems = [
        {
          id: 'moonveil-reckoning',
          name: 'Moonveil Reckoning',
          isBuiltIn: true,
          unitLabels: ['Cycle', 'Moon', 'Night'],
          subdivisions: [13, 28],
          format: 'C{u0} M{u1} N{u2}',
          parseSeparator: '-',
        },
      ];
      (
        mockTemplateService.loadTemplate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        manifest: {},
        project: {},
        elements: [],
        documents: [],
        worldbuilding: [],
        schemas: [],
        relationships: [],
        customRelationshipTypes: [],
        tags: [],
        elementTags: [],
        publishPlans: [],
        timeSystems,
        snapshots: [],
        media: [],
      });

      const mockLocalElements = TestBed.inject(
        LocalProjectElementsService
      ) as unknown as MockedObject<LocalProjectElementsService>;

      await service.createProject(
        { title: 'New Project', slug: 'new-project' },
        'worldbuilding-demo'
      );

      expect(mockLocalElements.saveTimeSystems).toHaveBeenCalledTimes(1);
      expect(mockLocalElements.saveTimeSystems).toHaveBeenCalledWith(
        'offlineuser',
        'offline-project',
        timeSystems
      );
    });

    it('should not call saveTimeSystems when template has no time systems', async () => {
      setupService.getMode.mockReturnValue('local');

      const mockLocalElements = TestBed.inject(
        LocalProjectElementsService
      ) as unknown as MockedObject<LocalProjectElementsService>;

      await service.createProject(
        { title: 'New Project', slug: 'new-project' },
        'worldbuilding-empty'
      );

      expect(mockLocalElements.saveTimeSystems).not.toHaveBeenCalled();
    });
  });
});
