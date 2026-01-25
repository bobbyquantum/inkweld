import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthenticationService } from '@inkweld/api/authentication.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import { Project } from '@inkweld/model/project';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';
import { UserService } from '../user/user.service';
import { LocalProjectService } from './local-project.service';
import { LocalProjectElementsService } from './local-project-elements.service';
import { LocalStorageService } from './local-storage.service';
import { MigrationService, MigrationStatus } from './migration.service';

describe('MigrationService', () => {
  let service: MigrationService;
  let storageContextServiceMock: {
    getServerUrl: ReturnType<typeof vi.fn>;
    getActiveConfig: ReturnType<typeof vi.fn>;
    updateConfigUserProfile: ReturnType<typeof vi.fn>;
    storagePrefix: ReturnType<typeof signal>;
  };
  let localProjectService: {
    projects: ReturnType<typeof signal<Project[]>>;
    getNonMigratedProjects: ReturnType<typeof vi.fn>;
    markProjectAsMigrated: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
  };
  let localElementsServiceMock: {
    loadElements: ReturnType<typeof vi.fn>;
    elements: ReturnType<typeof signal>;
  };
  let authServiceMock: {
    getCurrentUser: ReturnType<typeof vi.fn>;
    registerUser: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };
  let authTokenServiceMock: {
    setToken: ReturnType<typeof vi.fn>;
    getToken: ReturnType<typeof vi.fn>;
    hasToken: ReturnType<typeof vi.fn>;
    clearToken: ReturnType<typeof vi.fn>;
  };
  let userServiceMock: {
    currentUser: ReturnType<typeof signal>;
    loadCurrentUser: ReturnType<typeof vi.fn>;
    setCurrentUser: ReturnType<typeof vi.fn>;
  };
  let loggerMock: {
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let localStorageMock: {
    listMedia: ReturnType<typeof vi.fn>;
    getMedia: ReturnType<typeof vi.fn>;
    saveMedia: ReturnType<typeof vi.fn>;
    deleteMedia: ReturnType<typeof vi.fn>;
  };
  let projectsApiMock: {
    createProject: ReturnType<typeof vi.fn>;
  };

  const mockProjects: Project[] = [
    {
      id: 'offline-1',
      title: 'Test Project 1',
      slug: 'test-project-1',
      description: 'Test description 1',
      username: 'testuser',
      createdDate: '2024-01-01',
      updatedDate: '2024-01-01',
    },
    {
      id: 'offline-2',
      title: 'Test Project 2',
      slug: 'test-project-2',
      description: 'Test description 2',
      username: 'testuser',
      createdDate: '2024-01-02',
      updatedDate: '2024-01-02',
    },
  ];

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    authServiceMock = {
      getCurrentUser: vi.fn().mockReturnValue(of({ username: 'testuser' })),
      registerUser: vi.fn(),
      login: vi.fn(),
    };

    authTokenServiceMock = {
      setToken: vi.fn(),
      getToken: vi.fn().mockReturnValue(null),
      hasToken: vi.fn().mockReturnValue(false),
      clearToken: vi.fn(),
    };

    userServiceMock = {
      currentUser: signal(null),
      loadCurrentUser: vi.fn().mockResolvedValue(false),
      setCurrentUser: vi.fn().mockResolvedValue(undefined),
    };

    loggerMock = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    localStorageMock = {
      listMedia: vi.fn().mockResolvedValue([]),
      getMedia: vi.fn().mockResolvedValue(null),
      saveMedia: vi.fn().mockResolvedValue(undefined),
      deleteMedia: vi.fn().mockResolvedValue(undefined),
    };

    projectsApiMock = {
      createProject: vi.fn().mockReturnValue(
        of({
          id: 'server-project-1',
          title: 'Test Project',
          slug: 'test-project',
          username: 'testuser',
        })
      ),
    };

    storageContextServiceMock = {
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
      getActiveConfig: vi.fn().mockReturnValue({
        id: 'test-config-123',
        serverUrl: 'http://localhost:8333',
        displayName: 'Test Server',
        userProfile: {
          name: 'Test User',
          username: 'testuser',
        },
      }),
      updateConfigUserProfile: vi.fn(),
      storagePrefix: signal('local'),
    };

    localProjectService = {
      projects: signal<Project[]>([]),
      getNonMigratedProjects: vi.fn().mockReturnValue([]),
      markProjectAsMigrated: vi.fn(),
      deleteProject: vi.fn(),
    };

    localElementsServiceMock = {
      loadElements: vi.fn().mockResolvedValue(undefined),
      elements: signal([]),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        MigrationService,
        { provide: LocalProjectService, useValue: localProjectService },
        { provide: AuthenticationService, useValue: authServiceMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: StorageContextService, useValue: storageContextServiceMock },
        {
          provide: LocalProjectElementsService,
          useValue: localElementsServiceMock,
        },
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: ProjectsService, useValue: projectsApiMock },
      ],
    });

    service = TestBed.inject(MigrationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Helper to set mock projects (updates both signal and getNonMigratedProjects mock)
  const setMockProjects = (projects: Project[]) => {
    localProjectService.projects.set(projects);
    localProjectService.getNonMigratedProjects.mockReturnValue(projects);
  };

  describe('initial state', () => {
    it('should have initial migration state', () => {
      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.NotStarted);
      expect(state.totalProjects).toBe(0);
      expect(state.completedProjects).toBe(0);
      expect(state.failedProjects).toBe(0);
      expect(state.projectStatuses).toEqual([]);
    });

    it('should return false when no offline projects exist', () => {
      expect(service.hasLocalProjects()).toBe(false);
      expect(service.getLocalProjectsCount()).toBe(0);
    });

    it('should detect offline projects when they exist', () => {
      setMockProjects(mockProjects);
      expect(service.hasLocalProjects()).toBe(true);
      expect(service.getLocalProjectsCount()).toBe(2);
    });

    it('should return empty array from getLocalProjects when no projects exist', () => {
      expect(service.getLocalProjects()).toEqual([]);
    });

    it('should return local projects from getLocalProjects', () => {
      setMockProjects(mockProjects);
      expect(service.getLocalProjects()).toEqual(mockProjects);
    });
  });

  describe('resetMigrationState', () => {
    it('should reset migration state to initial values', () => {
      service.migrationState.set({
        status: MigrationStatus.Completed,
        totalProjects: 5,
        completedProjects: 3,
        failedProjects: 2,
        projectStatuses: [
          {
            projectSlug: 'test',
            projectTitle: 'Test',
            status: MigrationStatus.Completed,
          },
        ],
        currentProject: 'test-project',
        error: 'Some error',
      });

      service.resetMigrationState();

      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.NotStarted);
      expect(state.totalProjects).toBe(0);
      expect(state.completedProjects).toBe(0);
      expect(state.failedProjects).toBe(0);
      expect(state.projectStatuses).toEqual([]);
      expect(state.currentProject).toBeUndefined();
      expect(state.error).toBeUndefined();
    });
  });

  describe('migrateToServerMode', () => {
    it('should do nothing when no local projects exist', async () => {
      await service.migrateToServerMode('config-123', 'testuser');

      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'No local projects to migrate'
      );
    });

    it('should migrate local projects to server mode storage', async () => {
      setMockProjects(mockProjects);

      await service.migrateToServerMode('config-123', 'testuser');

      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.Completed);
      expect(state.totalProjects).toBe(2);
      expect(state.completedProjects).toBe(2);
      expect(state.failedProjects).toBe(0);
    });

    it('should mark projects as migrated after successful migration', async () => {
      setMockProjects([mockProjects[0]]);

      await service.migrateToServerMode('config-123', 'testuser');

      // markProjectAsMigrated(slug, targetSlug, serverUrl, targetUsername)
      expect(localProjectService.markProjectAsMigrated).toHaveBeenCalledWith(
        'test-project-1',
        'test-project-1',
        'http://localhost:8333',
        'testuser'
      );
    });

    it('should update project statuses during migration', async () => {
      setMockProjects([mockProjects[0]]);

      await service.migrateToServerMode('config-123', 'testuser');

      const state = service.migrationState();
      expect(state.projectStatuses.length).toBe(1);
      expect(state.projectStatuses[0].projectSlug).toBe('test-project-1');
      expect(state.projectStatuses[0].projectTitle).toBe('Test Project 1');
      expect(state.projectStatuses[0].status).toBe(MigrationStatus.Completed);
    });

    it('should only migrate selected projects when projectSlugs is provided', async () => {
      setMockProjects(mockProjects);

      await service.migrateToServerMode('config-123', 'testuser', [
        'test-project-1',
      ]);

      expect(localProjectService.markProjectAsMigrated).toHaveBeenCalledTimes(
        1
      );
      // markProjectAsMigrated(slug, targetSlug, serverUrl, targetUsername)
      expect(localProjectService.markProjectAsMigrated).toHaveBeenCalledWith(
        'test-project-1',
        'test-project-1',
        'http://localhost:8333',
        'testuser'
      );

      const state = service.migrationState();
      expect(state.totalProjects).toBe(1);
      expect(state.completedProjects).toBe(1);
    });

    it('should do nothing when projectSlugs is empty array', async () => {
      setMockProjects(mockProjects);

      await service.migrateToServerMode('config-123', 'testuser', []);

      expect(localProjectService.markProjectAsMigrated).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'No local projects to migrate'
      );
    });

    it('should do nothing when projectSlugs contains no matching slugs', async () => {
      setMockProjects(mockProjects);

      await service.migrateToServerMode('config-123', 'testuser', [
        'non-existent-project',
      ]);

      expect(localProjectService.markProjectAsMigrated).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'No local projects to migrate'
      );
    });

    it('should use renamed slug when slugRenames map is provided', async () => {
      setMockProjects([mockProjects[0]]);

      const renames = new Map([['test-project-1', 'renamed-project-1']]);

      await service.migrateToServerMode(
        'config-123',
        'testuser',
        ['test-project-1'],
        renames
      );

      // markProjectAsMigrated(slug, targetSlug, serverUrl, targetUsername)
      // The renamed slug should be used for targetSlug
      expect(localProjectService.markProjectAsMigrated).toHaveBeenCalledWith(
        'test-project-1',
        'renamed-project-1',
        'http://localhost:8333',
        'testuser'
      );
    });
  });

  describe('migrateToServer (deprecated wrapper)', () => {
    it('should call migrateToServerMode with current config', async () => {
      setMockProjects([mockProjects[0]]);

      await service.migrateToServer('http://localhost:8333');

      // markProjectAsMigrated(slug, targetSlug, serverUrl, targetUsername)
      expect(localProjectService.markProjectAsMigrated).toHaveBeenCalledWith(
        'test-project-1',
        'test-project-1',
        'http://localhost:8333',
        'testuser'
      );
    });

    it('should throw error when no current config exists', async () => {
      storageContextServiceMock.getActiveConfig.mockReturnValue(null);

      await expect(
        service.migrateToServer('http://localhost:8333')
      ).rejects.toThrow('No server configuration found');
    });

    it('should throw error when no current user exists', async () => {
      storageContextServiceMock.getActiveConfig.mockReturnValue({
        id: 'test-config-123',
        serverUrl: 'http://localhost:8333',
        displayName: 'Test Server',
        userProfile: undefined, // No user profile
      });

      await expect(
        service.migrateToServer('http://localhost:8333')
      ).rejects.toThrow('No current user found');
    });
  });

  describe('registerOnServer', () => {
    it('should register user and store token', async () => {
      authServiceMock.registerUser.mockReturnValue(
        of({
          token: 'test-token-123',
          user: { id: '1', username: 'testuser', name: 'Test User' },
          requiresApproval: false,
        })
      );

      await service.registerOnServer('testuser', 'password123');

      expect(authServiceMock.registerUser).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'password123',
      });
      expect(authTokenServiceMock.setToken).toHaveBeenCalledWith(
        'test-token-123'
      );
      expect(userServiceMock.setCurrentUser).toHaveBeenCalledWith({
        id: '1',
        username: 'testuser',
        name: 'Test User',
      });
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'Authentication token stored'
      );
    });

    it('should throw error when no token is returned', async () => {
      authServiceMock.registerUser.mockReturnValue(
        of({
          user: { id: '1', username: 'testuser' },
          requiresApproval: false,
        })
      );

      await expect(
        service.registerOnServer('testuser', 'password')
      ).rejects.toThrow('Registration succeeded but no token was returned');
    });

    it('should throw error when approval is required', async () => {
      authServiceMock.registerUser.mockReturnValue(
        of({
          token: 'test-token',
          user: { id: '1', username: 'testuser' },
          requiresApproval: true,
        })
      );

      await expect(
        service.registerOnServer('testuser', 'password')
      ).rejects.toThrow(
        'This server requires admin approval. Migration cannot proceed.'
      );
    });

    it('should handle registration failure', async () => {
      authServiceMock.registerUser.mockReturnValue(
        throwError(() => new Error('Username already exists'))
      );

      await expect(
        service.registerOnServer('testuser', 'password')
      ).rejects.toThrow('Username already exists');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('loginToServer', () => {
    it('should login user and store token', async () => {
      authServiceMock.login.mockReturnValue(
        of({
          token: 'login-token-456',
          user: { id: '1', username: 'testuser', name: 'Test User' },
        })
      );

      await service.loginToServer('testuser', 'password123');

      expect(authServiceMock.login).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'password123',
      });
      expect(authTokenServiceMock.setToken).toHaveBeenCalledWith(
        'login-token-456'
      );
      expect(userServiceMock.setCurrentUser).toHaveBeenCalledWith({
        id: '1',
        username: 'testuser',
        name: 'Test User',
      });
    });

    it('should throw error when no token is returned', async () => {
      authServiceMock.login.mockReturnValue(
        of({
          user: { id: '1', username: 'testuser' },
        })
      );

      await expect(
        service.loginToServer('testuser', 'password')
      ).rejects.toThrow('Login succeeded but no token was returned');
    });

    it('should handle login failure', async () => {
      authServiceMock.login.mockReturnValue(
        throwError(() => new Error('Invalid credentials'))
      );

      await expect(
        service.loginToServer('testuser', 'wrong-password')
      ).rejects.toThrow('Invalid credentials');
      expect(loggerMock.error).toHaveBeenCalledWith(
        'MigrationService',
        'Failed to login user testuser',
        'Invalid credentials'
      );
    });

    it('should not set user when response has no user', async () => {
      authServiceMock.login.mockReturnValue(
        of({
          token: 'token-only',
        })
      );

      await service.loginToServer('testuser', 'password');

      expect(authTokenServiceMock.setToken).toHaveBeenCalledWith('token-only');
      expect(userServiceMock.setCurrentUser).not.toHaveBeenCalled();
    });
  });

  describe('cleanupLocalData', () => {
    it('should delete all offline projects', () => {
      setMockProjects(mockProjects);

      service.cleanupLocalData();

      expect(localProjectService.deleteProject).toHaveBeenCalledTimes(2);
      expect(localProjectService.deleteProject).toHaveBeenCalledWith(
        'testuser',
        'test-project-1'
      );
      expect(localProjectService.deleteProject).toHaveBeenCalledWith(
        'testuser',
        'test-project-2'
      );
    });

    it('should clear offline localStorage items', () => {
      localStorage.setItem('inkweld-local-elements', 'test-elements');
      localStorage.setItem('inkweld-local-user', 'test-user');

      service.cleanupLocalData();

      expect(localStorage.getItem('inkweld-local-elements')).toBeNull();
      expect(localStorage.getItem('inkweld-local-user')).toBeNull();
    });

    it('should log cleanup operation', () => {
      service.cleanupLocalData();

      expect(loggerMock.warn).toHaveBeenCalledWith(
        'MigrationService',
        'Cleaning up all local data (projects, elements, user)'
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'Local data cleanup completed'
      );
    });

    it('should handle empty projects list', () => {
      setMockProjects([]);

      service.cleanupLocalData();

      expect(localProjectService.deleteProject).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'Local data cleanup completed'
      );
    });

    it('should only delete selected projects when projectSlugs is provided', () => {
      setMockProjects(mockProjects);

      service.cleanupLocalData(['test-project-1']);

      expect(localProjectService.deleteProject).toHaveBeenCalledTimes(1);
      expect(localProjectService.deleteProject).toHaveBeenCalledWith(
        'testuser',
        'test-project-1'
      );
    });

    it('should not clear local elements or user when cleaning up specific projects', () => {
      localStorage.setItem('inkweld-local-elements', 'test-elements');
      localStorage.setItem('inkweld-local-user', 'test-user');
      setMockProjects(mockProjects);

      service.cleanupLocalData(['test-project-1']);

      // These should still exist after selective cleanup
      expect(localStorage.getItem('inkweld-local-elements')).toBe(
        'test-elements'
      );
      expect(localStorage.getItem('inkweld-local-user')).toBe('test-user');
    });

    it('should log selective cleanup when projectSlugs is provided', () => {
      setMockProjects(mockProjects);

      service.cleanupLocalData(['test-project-1', 'test-project-2']);

      expect(loggerMock.warn).toHaveBeenCalledWith(
        'MigrationService',
        'Cleaning up 2 migrated project(s)'
      );
    });
  });
});
