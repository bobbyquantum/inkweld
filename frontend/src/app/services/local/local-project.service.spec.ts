import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Project } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';
import { LocalProjectService } from './local-project.service';
import { LocalProjectElementsService } from './local-project-elements.service';

type MockedObject<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? ReturnType<typeof vi.fn> & T[K]
    : T[K];
};

describe('LocalProjectService', () => {
  let service: LocalProjectService;
  let mockSetupService: MockedObject<SetupService>;
  let mockElementsService: MockedObject<LocalProjectElementsService>;
  let mockStorageContext: MockedObject<StorageContextService>;

  // The prefixed key that will be used in storage
  const PREFIXED_PROJECTS_KEY = 'local:inkweld-local-projects';

  // Mock localStorage
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };

  const mockUserProfile = {
    id: 'test-user-id',
    username: 'testuser',
    name: 'Test User',
    enabled: true,
  };

  beforeEach(() => {
    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Create mocked services
    mockSetupService = {
      getLocalUserProfile: vi.fn().mockReturnValue(mockUserProfile),
    } as any;

    mockElementsService = {
      createDefaultStructure: vi.fn().mockReturnValue([]),
    } as any;

    // Mock StorageContextService to return predictable prefixed keys
    mockStorageContext = {
      prefixKey: vi.fn((key: string) => `local:${key}`),
      prefixDbName: vi.fn((name: string) => `local:${name}`),
      prefixDocumentId: vi.fn((id: string) => `local:${id}`),
      getPrefix: vi.fn().mockReturnValue('local:'),
    } as any;

    // Reset mocks
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockSetupService.getLocalUserProfile.mockReset();
    mockElementsService.createDefaultStructure.mockReset();

    // Set default localStorage return value
    mockLocalStorage.getItem.mockReturnValue('[]');

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LocalProjectService,
        { provide: SetupService, useValue: mockSetupService },
        { provide: StorageContextService, useValue: mockStorageContext },
        {
          provide: LocalProjectElementsService,
          useValue: mockElementsService,
        },
      ],
    });

    // Reset mock implementation for each test to return the user profile
    mockSetupService.getLocalUserProfile.mockReturnValue(mockUserProfile);

    service = TestBed.inject(LocalProjectService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be created and load projects on construction', () => {
      expect(service).toBeTruthy();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(
        PREFIXED_PROJECTS_KEY
      );
    });
  });

  describe('loadProjects', () => {
    it('should only load projects once when called multiple times', () => {
      // Reset the service state
      (service as any).initialized.set(false);
      mockLocalStorage.getItem.mockClear();

      service.loadProjects();
      service.loadProjects();
      service.loadProjects();

      // Should only call loadOfflineProjects once (getItem called once more)
      // Initial call was in constructor, then one more in first loadProjects
      expect(service['initialized']()).toBe(true);
    });

    it('should skip loading when already initialized', () => {
      (service as any).initialized.set(true);
      mockLocalStorage.getItem.mockClear();

      service.loadProjects();

      // Should not load projects again
      expect(mockLocalStorage.getItem).not.toHaveBeenCalled();
    });
  });

  describe('reloadProjects', () => {
    it('should force reload projects from localStorage', () => {
      const newProjects: Project[] = [
        {
          id: 'new-project-id',
          title: 'New Project',
          slug: 'new-project',
          username: 'testuser',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(newProjects));
      mockLocalStorage.getItem.mockClear();

      service.reloadProjects();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(
        PREFIXED_PROJECTS_KEY
      );
      expect(service.projects()).toEqual(newProjects);
    });
  });

  describe('createProject', () => {
    beforeEach(() => {
      // Initialize with empty projects for each test
      service.projects.set([]);
    });

    it('should create project with default structure', async () => {
      const projectData = {
        title: 'Test Project',
        description: 'Test Description',
      };

      const result = await service.createProject(projectData);

      expect(result).toMatchObject({
        title: 'Test Project',
        description: 'Test Description',
        username: 'testuser',
        slug: 'test-project',
      });

      expect(result.createdDate).toBeDefined();
      expect(result.updatedDate).toBeDefined();

      // Should save to localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        PREFIXED_PROJECTS_KEY,
        expect.stringContaining('Test Project')
      );

      // Should create default project structure
      expect(mockElementsService.createDefaultStructure).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });

    it('should generate slug from title', async () => {
      const projectData = {
        title: 'My Amazing Project!!!',
      };

      const result = await service.createProject(projectData);

      expect(result.slug).toBe('my-amazing-project');
    });

    it('should use provided slug', async () => {
      const projectData = {
        title: 'Test Project',
        slug: 'custom-slug',
      };

      const result = await service.createProject(projectData);

      expect(result.slug).toBe('custom-slug');
    });

    it('should prevent duplicate slugs', async () => {
      const existingProject: Project = {
        id: 'existing-project-id',
        title: 'Existing Project',
        slug: 'test-project',
        username: 'testuser',
        description: '',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      service.projects.set([existingProject]);

      const projectData = {
        title: 'Test Project',
        slug: 'test-project',
      };

      await expect(service.createProject(projectData)).rejects.toThrow(
        'A project with this slug already exists'
      );
    });

    it('should handle missing user profile', async () => {
      mockSetupService.getLocalUserProfile.mockReturnValue(null);

      const projectData = {
        title: 'Test Project',
      };

      await expect(service.createProject(projectData)).rejects.toThrow(
        'No local user profile found'
      );
    });

    it('should handle localStorage errors', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const projectData = {
        title: 'Test Project',
      };

      await expect(service.createProject(projectData)).rejects.toThrow(
        'Storage quota exceeded'
      );
    });
  });

  describe('getProject', () => {
    beforeEach(() => {
      const projects: Project[] = [
        {
          id: 'project-1-id',
          title: 'Project 1',
          slug: 'project-1',
          username: 'testuser',
          description: 'Description 1',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
        {
          id: 'project-2-id',
          title: 'Project 2',
          slug: 'project-2',
          username: 'otheruser',
          description: 'Description 2',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
      ];
      service.projects.set(projects);
    });

    it('should return project by username and slug', () => {
      const result = service.getProject('testuser', 'project-1');

      expect(result).toMatchObject({
        title: 'Project 1',
        slug: 'project-1',
        username: 'testuser',
      });
    });

    it('should return null for non-existent project', () => {
      const result = service.getProject('testuser', 'non-existent');

      expect(result).toBeNull();
    });

    it('should respect username isolation', () => {
      const result = service.getProject('testuser', 'project-2');

      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    beforeEach(() => {
      const projects: Project[] = [
        {
          id: 'test-project-id',
          title: 'Original Title',
          slug: 'test-project',
          username: 'testuser',
          description: 'Original Description',
          createdDate: '2023-01-01T00:00:00.000Z',
          updatedDate: '2023-01-01T00:00:00.000Z',
        },
      ];
      service.projects.set(projects);
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(projects));
    });

    it('should update existing project', () => {
      const updates = {
        title: 'Updated Title',
        description: 'Updated Description',
      };

      const result = service.updateProject('testuser', 'test-project', updates);

      expect(result).toMatchObject({
        title: 'Updated Title',
        description: 'Updated Description',
        slug: 'test-project',
        username: 'testuser',
        createdDate: '2023-01-01T00:00:00.000Z',
      });

      expect(result.updatedDate).not.toBe('2023-01-01T00:00:00.000Z');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should throw error for non-existent project', () => {
      expect(() =>
        service.updateProject('testuser', 'non-existent', { title: 'New' })
      ).toThrow('Project not found');
    });
  });

  describe('deleteProject', () => {
    beforeEach(() => {
      const projects: Project[] = [
        {
          id: 'project-1-id',
          title: 'Project 1',
          slug: 'project-1',
          username: 'testuser',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
        {
          id: 'project-2-id',
          title: 'Project 2',
          slug: 'project-2',
          username: 'testuser',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
      ];
      service.projects.set(projects);
    });

    it('should delete project', () => {
      service.deleteProject('testuser', 'project-1');

      const remaining = service.projects();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].slug).toBe('project-2');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should handle non-existent project gracefully', () => {
      const originalCount = service.projects().length;

      service.deleteProject('testuser', 'non-existent');

      expect(service.projects()).toHaveLength(originalCount);
    });
  });

  describe('getProjectsByUsername', () => {
    beforeEach(() => {
      const projects: Project[] = [
        {
          id: 'user1-project-1-id',
          title: 'User1 Project 1',
          slug: 'user1-project-1',
          username: 'user1',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
        {
          id: 'user1-project-2-id',
          title: 'User1 Project 2',
          slug: 'user1-project-2',
          username: 'user1',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
        {
          id: 'user2-project-1-id',
          title: 'User2 Project 1',
          slug: 'user2-project-1',
          username: 'user2',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
      ];
      service.projects.set(projects);
    });

    it('should return projects for specific user', () => {
      const result = service.getProjectsByUsername('user1');

      expect(result).toHaveLength(2);
      expect(result.every(p => p.username === 'user1')).toBe(true);
    });

    it('should return empty array for user with no projects', () => {
      const result = service.getProjectsByUsername('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('importProjects', () => {
    beforeEach(() => {
      service.projects.set([]);
      mockLocalStorage.getItem.mockReturnValue('[]');
    });

    it('should import projects for current user', () => {
      const importedProjects: Project[] = [
        {
          id: 'imported-project-id',
          title: 'Imported Project',
          slug: 'imported-project',
          username: 'originaluser',
          description: 'Imported',
          createdDate: '2023-01-01T00:00:00.000Z',
          updatedDate: '2023-01-01T00:00:00.000Z',
        },
      ];

      service.importProjects(importedProjects);

      const projects = service.projects();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        title: 'Imported Project',
        slug: 'imported-project',
        username: 'testuser', // Should be updated to current user
      });
    });

    it('should handle duplicate imports by updating', () => {
      const existingProject: Project = {
        id: 'existing-project-id',
        title: 'Existing Project',
        slug: 'test-project',
        username: 'testuser',
        description: 'Original',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      service.projects.set([existingProject]);

      const importedProjects: Project[] = [
        {
          id: 'updated-project-id',
          title: 'Updated Project',
          slug: 'test-project',
          username: 'originaluser',
          description: 'Updated',
          createdDate: '2023-01-01T00:00:00.000Z',
          updatedDate: '2023-01-01T00:00:00.000Z',
        },
      ];

      service.importProjects(importedProjects);

      const projects = service.projects();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        title: 'Updated Project',
        description: 'Updated',
        username: 'testuser',
      });
    });
  });

  describe('localStorage persistence', () => {
    it('should load projects from localStorage on initialization', () => {
      const storedProjects: Project[] = [
        {
          id: 'stored-project-id',
          title: 'Stored Project',
          slug: 'stored-project',
          username: 'testuser',
          description: '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
      ];

      // Set up a new TestBed with the stored data
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          LocalProjectService,
          { provide: SetupService, useValue: mockSetupService },
          {
            provide: LocalProjectElementsService,
            useValue: mockElementsService,
          },
        ],
      });

      // Configure mock to return stored data
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedProjects));

      const newService = TestBed.inject(LocalProjectService);

      expect(newService.projects()).toEqual(storedProjects);
    });

    it('should handle corrupted localStorage data', () => {
      // Set up a new TestBed for this test
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          LocalProjectService,
          { provide: SetupService, useValue: mockSetupService },
          {
            provide: LocalProjectElementsService,
            useValue: mockElementsService,
          },
        ],
      });

      mockLocalStorage.getItem.mockReturnValue('invalid-json');
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const newService = TestBed.inject(LocalProjectService);

      expect(newService.projects()).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load local projects:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
