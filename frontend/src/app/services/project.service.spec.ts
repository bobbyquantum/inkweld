import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import { ProjectDto } from '../../api-client/model/project-dto';
import { ProjectService, ProjectServiceError } from './project.service';
import { StorageService } from './storage.service';
import { XsrfService } from './xsrf.service';

describe('ProjectService', () => {
  let service: ProjectService;
  let mockProjectAPIService: jest.Mocked<ProjectAPIService>;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockXsrfService: jest.Mocked<XsrfService>;
  let mockDB: IDBDatabase;

  // Mock project data
  const mockProjects: ProjectDto[] = [
    {
      id: '1',
      title: 'Project 1',
      slug: 'project-1',

      username: 'testuser',
    } as ProjectDto,
    {
      id: '2',
      title: 'Project 2',
      slug: 'project-2',
      username: 'testuser',
    } as ProjectDto,
  ];

  const mockProject: ProjectDto = {
    id: '1',
    title: 'Project 1',
    slug: 'project-1',
    username: 'testuser',
  } as ProjectDto;

  beforeEach(() => {
    // Create mock DB
    mockDB = {} as IDBDatabase;
    // Create mock API service with type assertions to avoid type errors in tests
    mockProjectAPIService = {
      projectControllerGetAllProjects: jest
        .fn()
        .mockReturnValue(of(mockProjects)),
      projectControllerGetProjectByUsernameAndSlug: jest
        .fn()
        .mockReturnValue(of(mockProject)),
      projectControllerCreateProject: jest
        .fn()
        .mockReturnValue(of(mockProject)),
      projectControllerUpdateProject: jest
        .fn()
        .mockReturnValue(of(mockProject)),
      projectControllerDeleteProject: jest.fn().mockReturnValue(of({})),
    } as any as jest.Mocked<ProjectAPIService>;

    mockStorageService = {
      initializeDatabase: jest.fn().mockResolvedValue(mockDB),
      isAvailable: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    mockXsrfService = {
      getXsrfToken: jest.fn().mockReturnValue('mock-token'),
    } as unknown as jest.Mocked<XsrfService>;

    TestBed.configureTestingModule({
      providers: [
        ProjectService,
        { provide: ProjectAPIService, useValue: mockProjectAPIService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: XsrfService, useValue: mockXsrfService },
      ],
    });

    service = TestBed.inject(ProjectService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadAllProjects', () => {
    it('should load projects from API when cache is empty', async () => {
      // Set empty cache
      mockStorageService.get.mockResolvedValue(undefined);

      await service.loadAllProjects();

      // Verify API was called
      expect(
        mockProjectAPIService.projectControllerGetAllProjects
      ).toHaveBeenCalled();

      // Verify projects were cached
      expect(mockStorageService.put).toHaveBeenCalled();

      // Verify projects were set in signal
      expect(service.projects()).toEqual(mockProjects);

      // Verify loading state was correctly toggled
      expect(service.isLoading()).toBe(false);
    });

    it('should handle API errors correctly', async () => {
      // Set empty cache
      mockStorageService.get.mockResolvedValue(undefined);

      // Mock API error
      const errorResponse = new HttpErrorResponse({
        error: 'test error',
        status: 500,
        statusText: 'Server Error',
      });
      mockProjectAPIService.projectControllerGetAllProjects.mockReturnValue(
        throwError(() => errorResponse)
      );

      try {
        await service.loadAllProjects();
        // Should not reach here
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectServiceError);
        expect((error as ProjectServiceError).code).toBe('SERVER_ERROR');
        expect(service.error()).toBeDefined();
        expect(service.isLoading()).toBe(false);
      }
    });
  });

  describe('getProjectByUsernameAndSlug', () => {
    it('should get project from API when not in cache', async () => {
      // Set empty cache
      mockStorageService.get.mockResolvedValue(undefined);

      const result = await service.getProjectByUsernameAndSlug(
        'testuser',
        'project-1'
      );

      // Verify API was called
      expect(
        mockProjectAPIService.projectControllerGetProjectByUsernameAndSlug
      ).toHaveBeenCalledWith('testuser', 'project-1');

      // Verify project was cached
      expect(mockStorageService.put).toHaveBeenCalled();

      // Verify returned project
      expect(result).toEqual(mockProject);
    });

    it('should use cached project when available', async () => {
      // Set cache with project
      mockStorageService.get.mockResolvedValue(mockProject);

      const result = await service.getProjectByUsernameAndSlug(
        'testuser',
        'project-1'
      );

      // Verify API was NOT called
      expect(
        mockProjectAPIService.projectControllerGetProjectByUsernameAndSlug
      ).not.toHaveBeenCalled();

      // Verify returned project from cache
      expect(result).toEqual(mockProject);
    });
  });

  describe('createProject', () => {
    it('should create a project and update cache', async () => {
      const newProject = {
        ...mockProject,
        id: '3',
        title: 'New Project',
        slug: 'new-project',
      };
      // Use any to bypass the type checking for the mock
      (
        mockProjectAPIService.projectControllerCreateProject as any
      ).mockReturnValue(of(newProject));

      // Initialize projects signal with existing projects
      service.projects.set(mockProjects);

      const result = await service.createProject(newProject);

      // Verify API call
      expect(
        mockProjectAPIService.projectControllerCreateProject
      ).toHaveBeenCalledWith('mock-token', newProject);

      // Verify project was cached
      expect(mockStorageService.put).toHaveBeenCalled();

      // Verify projects list was updated
      expect(service.projects().length).toBe(mockProjects.length + 1);

      // Verify returned project
      expect(result).toEqual(newProject);
    });
  });

  describe('updateProject', () => {
    it('should update a project and update cache', async () => {
      const updatedProject = { ...mockProject, title: 'Updated Project' };
      // Use any to bypass the type checking for the mock
      (
        mockProjectAPIService.projectControllerUpdateProject as any
      ).mockReturnValue(of(updatedProject));

      // Initialize projects signal with existing projects
      service.projects.set(mockProjects);

      const result = await service.updateProject(
        'testuser',
        'project-1',
        updatedProject
      );

      // Verify API call
      expect(
        mockProjectAPIService.projectControllerUpdateProject
      ).toHaveBeenCalledWith(
        'testuser',
        'project-1',
        'mock-token',
        updatedProject
      );

      // Verify project was cached
      expect(mockStorageService.put).toHaveBeenCalled();

      // Verify returned project
      expect(result).toEqual(updatedProject);
    });
  });

  describe('deleteProject', () => {
    it('should delete a project and update cache', async () => {
      // Initialize projects signal with existing projects
      service.projects.set(mockProjects);

      await service.deleteProject('testuser', 'project-1');

      // Verify API call
      expect(
        mockProjectAPIService.projectControllerDeleteProject
      ).toHaveBeenCalledWith('testuser', 'project-1', 'mock-token');

      // Verify project was removed from cache
      expect(mockStorageService.delete).toHaveBeenCalled();

      // Verify projects list was updated (first project removed)
      expect(service.projects().length).toBe(mockProjects.length - 1);
      expect(service.projects()[0].id).toBe('2');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached projects', async () => {
      // Initialize projects signal with existing projects
      service.projects.set(mockProjects);

      await service.clearCache();

      // Verify cache was cleared
      expect(mockStorageService.delete).toHaveBeenCalled();

      // Verify projects signal was cleared
      expect(service.projects().length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should correctly format network errors', async () => {
      // Mock network error
      const errorResponse = new HttpErrorResponse({
        error: 'test error',
        status: 0,
      });

      mockProjectAPIService.projectControllerGetAllProjects.mockReturnValue(
        throwError(() => errorResponse)
      );

      try {
        await service.loadAllProjects();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectServiceError);
        expect((error as ProjectServiceError).code).toBe('NETWORK_ERROR');
      }
    });

    it('should correctly format session expired errors', async () => {
      // Mock 401 error
      const errorResponse = new HttpErrorResponse({
        error: 'test error',
        status: 401,
      });

      mockProjectAPIService.projectControllerGetAllProjects.mockReturnValue(
        throwError(() => errorResponse)
      );

      try {
        await service.loadAllProjects();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectServiceError);
        expect((error as ProjectServiceError).code).toBe('SESSION_EXPIRED');
      }
    });

    it('should correctly format not found errors', async () => {
      // Mock 404 error
      const errorResponse = new HttpErrorResponse({
        error: 'test error',
        status: 404,
      });

      mockProjectAPIService.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        throwError(() => errorResponse)
      );

      try {
        await service.getProjectByUsernameAndSlug('testuser', 'nonexistent');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectServiceError);
        expect((error as ProjectServiceError).code).toBe('PROJECT_NOT_FOUND');
      }
    });
  });
});
