import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthenticationService } from '@inkweld/api/authentication.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import { Project } from '@inkweld/model/project';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { UserService } from '../user/user.service';
import { LocalProjectService } from './local-project.service';
import { LocalProjectElementsService } from './local-project-elements.service';
import { MigrationService, MigrationStatus } from './migration.service';

describe('MigrationService', () => {
  let service: MigrationService;
  let localProjectService: {
    projects: ReturnType<typeof signal<Project[]>>;
    deleteProject: ReturnType<typeof vi.fn>;
  };
  let projectsServiceMock: {
    createProject: ReturnType<typeof vi.fn>;
  };
  let authServiceMock: {
    getCurrentUser: ReturnType<typeof vi.fn>;
    registerUser: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
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

    projectsServiceMock = {
      createProject: vi.fn().mockReturnValue(of(mockProjects[0])),
    };

    authServiceMock = {
      getCurrentUser: vi.fn().mockReturnValue(of({ username: 'testuser' })),
      registerUser: vi.fn(),
      login: vi.fn(),
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

    localProjectService = {
      projects: signal<Project[]>([]),
      deleteProject: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        MigrationService,
        { provide: LocalProjectService, useValue: localProjectService },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: AuthenticationService, useValue: authServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: SetupService, useValue: {} },
        { provide: LocalProjectElementsService, useValue: {} },
      ],
    });

    service = TestBed.inject(MigrationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

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
      localProjectService.projects.set(mockProjects);
      expect(service.hasLocalProjects()).toBe(true);
      expect(service.getLocalProjectsCount()).toBe(2);
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

  describe('migrateToServer', () => {
    it('should do nothing when no offline projects exist', async () => {
      await service.migrateToServer('http://localhost:8333');

      expect(projectsServiceMock.createProject).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'No local projects to migrate'
      );
    });

    it('should migrate all offline projects successfully', async () => {
      localProjectService.projects.set(mockProjects);
      projectsServiceMock.createProject.mockReturnValue(of(mockProjects[0]));

      await service.migrateToServer('http://localhost:8333');

      expect(projectsServiceMock.createProject).toHaveBeenCalledTimes(2);
      expect(projectsServiceMock.createProject).toHaveBeenCalledWith({
        title: 'Test Project 1',
        slug: 'test-project-1',
        description: 'Test description 1',
      });
      expect(projectsServiceMock.createProject).toHaveBeenCalledWith({
        title: 'Test Project 2',
        slug: 'test-project-2',
        description: 'Test description 2',
      });

      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.Completed);
      expect(state.totalProjects).toBe(2);
      expect(state.completedProjects).toBe(2);
      expect(state.failedProjects).toBe(0);
    });

    it('should handle 409 conflict (project already exists) gracefully', async () => {
      localProjectService.projects.set([mockProjects[0]]);
      projectsServiceMock.createProject.mockReturnValue(
        throwError(() => ({ status: 409, message: 'Conflict' }))
      );

      await service.migrateToServer('http://localhost:8333');

      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.Completed);
      expect(state.completedProjects).toBe(1);
      expect(state.failedProjects).toBe(0);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'MigrationService',
        'Project test-project-1 already exists on server, skipping creation'
      );
    });

    it('should handle project creation failure', async () => {
      localProjectService.projects.set([mockProjects[0]]);
      projectsServiceMock.createProject.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      await service.migrateToServer('http://localhost:8333');

      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.Failed);
      expect(state.completedProjects).toBe(0);
      expect(state.failedProjects).toBe(1);
      expect(state.projectStatuses[0].status).toBe(MigrationStatus.Failed);
      expect(state.projectStatuses[0].error).toBe('Network error');
    });

    it('should continue migrating other projects after one fails', async () => {
      localProjectService.projects.set(mockProjects);

      // First project fails, second succeeds
      projectsServiceMock.createProject
        .mockReturnValueOnce(throwError(() => new Error('Failed')))
        .mockReturnValueOnce(of(mockProjects[1]));

      await service.migrateToServer('http://localhost:8333');

      const state = service.migrationState();
      expect(state.status).toBe(MigrationStatus.Failed);
      expect(state.completedProjects).toBe(1);
      expect(state.failedProjects).toBe(1);
    });

    it('should update project statuses during migration', async () => {
      localProjectService.projects.set([mockProjects[0]]);
      projectsServiceMock.createProject.mockReturnValue(of(mockProjects[0]));

      await service.migrateToServer('http://localhost:8333');

      const state = service.migrationState();
      expect(state.projectStatuses.length).toBe(1);
      expect(state.projectStatuses[0].projectSlug).toBe('test-project-1');
      expect(state.projectStatuses[0].projectTitle).toBe('Test Project 1');
      expect(state.projectStatuses[0].status).toBe(MigrationStatus.Completed);
    });

    it('should handle projects with undefined description', async () => {
      const projectWithoutDescription: Project = {
        ...mockProjects[0],
        description: undefined,
      };
      localProjectService.projects.set([projectWithoutDescription]);
      projectsServiceMock.createProject.mockReturnValue(
        of(projectWithoutDescription)
      );

      await service.migrateToServer('http://localhost:8333');

      expect(projectsServiceMock.createProject).toHaveBeenCalledWith({
        title: 'Test Project 1',
        slug: 'test-project-1',
        description: undefined,
      });
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
      expect(localStorage.getItem('auth_token')).toBe('test-token-123');
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
      expect(localStorage.getItem('auth_token')).toBe('login-token-456');
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

      expect(localStorage.getItem('auth_token')).toBe('token-only');
      expect(userServiceMock.setCurrentUser).not.toHaveBeenCalled();
    });
  });

  describe('cleanupLocalData', () => {
    it('should delete all offline projects', () => {
      localProjectService.projects.set(mockProjects);

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
      localStorage.setItem('auth_token', 'should-remain');

      service.cleanupLocalData();

      expect(localStorage.getItem('inkweld-local-elements')).toBeNull();
      expect(localStorage.getItem('inkweld-local-user')).toBeNull();
      // auth_token should NOT be cleared
      expect(localStorage.getItem('auth_token')).toBe('should-remain');
    });

    it('should log cleanup operation', () => {
      service.cleanupLocalData();

      expect(loggerMock.warn).toHaveBeenCalledWith(
        'MigrationService',
        'Cleaning up local data (projects, elements, user)'
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'Local data cleanup completed'
      );
    });

    it('should handle empty projects list', () => {
      localProjectService.projects.set([]);

      service.cleanupLocalData();

      expect(localProjectService.deleteProject).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        'MigrationService',
        'Local data cleanup completed'
      );
    });
  });
});
