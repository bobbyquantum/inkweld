import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { ProjectsService } from '@inkweld/api/projects.service';
import { Project } from '../../api-client/model/project';
import { apiErr, apiOk } from '../../testing/utils';
import { ProjectService, ProjectServiceError } from './project.service';
import { StorageService } from './storage.service';
import { XsrfService } from './xsrf.service';

const date = new Date().toISOString();
const BASE: Project[] = [
  {
    id: '1',
    title: 'Project 1',
    slug: 'project-1',
    username: 'alice',
    createdDate: date,
    updatedDate: date,
  },
  {
    id: '2',
    title: 'Project 2',
    slug: 'project-2',
    username: 'alice',
    createdDate: date,
    updatedDate: date,
  },
];
const DB = {} as IDBDatabase;

/* Convenience alias for mock */
type ApiMock = DeepMockProxy<ProjectsService>;
type StoreMock = DeepMockProxy<StorageService>;
type XsrfMock = DeepMockProxy<XsrfService>;

describe('ProjectService', () => {
  let service: ProjectService;
  let api: ApiMock;
  let store: StoreMock;
  let xsrf: XsrfMock;

  beforeEach(() => {
    api = mockDeep<ProjectsService>();
    store = mockDeep<StorageService>() as StoreMock;
    xsrf = mockDeep<XsrfService>() as XsrfMock;

    // Storage baseline
    store.initializeDatabase.mockResolvedValue(DB);
    store.isAvailable.mockReturnValue(true);

    // XSRF baseline
    xsrf.getXsrfToken.mockReturnValue('token');

    // API baseline
    api.getApiV1Projects.mockReturnValue(apiOk(BASE));
    api.getApiV1ProjectsUsernameSlug.mockReturnValue(apiOk(BASE[0]));
    api.projectControllerCreateProject.mockImplementation(
      (_t: unknown, dto: unknown) =>
        apiOk(dto) as unknown as Observable<HttpResponse<Project>> &
          Observable<Project>
    );
    const mockImpl = (_u: string, _s: string, _t: string, dto: Project) =>
      apiOk(dto) as unknown as Observable<HttpResponse<Project>> &
        Observable<Project>;
    api.projectControllerUpdateProject.mockImplementation(mockImpl);
    api.projectControllerDeleteProject.mockReturnValue(apiOk(null));
    api.coverControllerGetProjectCover.mockReturnValue(apiOk(new Blob()));
    api.deleteApiV1ProjectsUsernameSlugCover.mockReturnValue(apiOk(undefined));
    api.postApiV1ProjectsUsernameSlugCover.mockReturnValue(apiOk(undefined));

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProjectService,
        { provide: ProjectsService, useValue: api },
        { provide: StorageService, useValue: store },
        { provide: XsrfService, useValue: xsrf },
      ],
    });

    service = TestBed.inject(ProjectService);
  });

  it('loads projects from API when cache is empty', async () => {
    store.get.mockResolvedValue(undefined);

    await service.loadAllProjects();

    expect(api.getApiV1Projects).toHaveBeenCalled();
    expect(store.put).toHaveBeenCalledWith(
      DB,
      'projectsList',
      BASE,
      'allProjects'
    );
    expect(service.projects()).toEqual(BASE);
    expect(service.error()).toBeUndefined();
  });

  describe('getProjectByUsernameAndSlug', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.getApiV1ProjectsUsernameSlug.mockReset();
      store.get.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      service.error.set(undefined);
    });

    it('returns a project from cache if available', async () => {
      // Mock cached project
      store.get.mockResolvedValue(BASE[0]);

      const result = await service.getProjectByUsernameAndSlug(
        'alice',
        'project-1'
      );

      // Should check cache first
      expect(store.get).toHaveBeenCalledWith(
        expect.anything(),
        'projects',
        'alice/project-1'
      );

      // API should not be called
      expect(api.getApiV1ProjectsUsernameSlug).not.toHaveBeenCalled();

      // Result should match the cached project
      expect(result).toEqual(BASE[0]);
    });

    it('fetches from API if not in cache and caches result', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API response
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(apiOk(BASE[0]));

      const result = await service.getProjectByUsernameAndSlug(
        'alice',
        'project-1'
      );

      // Should check cache first
      expect(store.get).toHaveBeenCalledWith(
        expect.anything(),
        'projects',
        'alice/project-1'
      );

      // API should be called with token
      expect(api.getApiV1ProjectsUsernameSlug).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );

      // Result should match API response
      expect(result).toEqual(BASE[0]);

      // Result should be cached
      expect(store.put).toHaveBeenCalledWith(
        expect.anything(),
        'projects',
        BASE[0],
        'alice/project-1'
      );
    });

    it('handles API errors gracefully when refreshing', async () => {
      // Mock the store to always return the BASE[0] project for 'alice/project-1' key
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projects' && key === 'alice/project-1') {
          return Promise.resolve(BASE[0] as any);
        }
        return Promise.resolve(undefined);
      });

      // Mock the API to fail
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(
        apiErr(new Error('Test error'))
      );

      // Should be able to get the project even though the API would fail
      const result = await service.getProjectByUsernameAndSlug(
        'alice',
        'project-1'
      );

      // We should still get data back from cache
      expect(result).toEqual(BASE[0]);
    });

    it('returns API result for uncached project', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API response
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(apiOk(BASE[1]));

      const result = await service.getProjectByUsernameAndSlug(
        'bob',
        'project-2'
      );

      // Should check cache first
      expect(store.get).toHaveBeenCalledWith(
        expect.anything(),
        'projects',
        'bob/project-2'
      );

      // API should be called with token
      expect(api.getApiV1ProjectsUsernameSlug).toHaveBeenCalledWith(
        'bob',
        'project-2'
      );

      // Result should match API response
      expect(result).toEqual(BASE[1]);

      // Result should be cached
      expect(store.put).toHaveBeenCalledWith(
        expect.anything(),
        'projects',
        BASE[1],
        'bob/project-2'
      );
    });

    it('handles network errors correctly', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock network error
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // Should throw an error
      await expect(
        service.getProjectByUsernameAndSlug('alice', 'project-1')
      ).rejects.toThrow();

      // Error should be set with correct code
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles not found errors correctly', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock 404 error
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      // Should throw an error
      await expect(
        service.getProjectByUsernameAndSlug('alice', 'nonexistent')
      ).rejects.toThrow();

      // Error should be set with correct code
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('internal project refresh functionality', () => {
    // Instead of directly testing private methods, we'll test the behavior
    // through the public methods that use the private functionality

    it('updates cache with refreshed project data', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Updated Project 1',
        createdDate: date,
        updatedDate: date,
      };
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(apiOk(updatedProject));

      // We can't call refreshProjectInBackground directly as it's private
      // But we can test its effect after a call to getProjectByUsernameAndSlug
      await service.getProjectByUsernameAndSlug('alice', 'project-1');

      // Should update cache with the new data
      expect(store.put).toHaveBeenCalledWith(
        DB,
        'projects',
        updatedProject,
        'alice/project-1'
      );
      // Should not set error
      expect(service.error()).toBeUndefined();
    });

    it('handles API errors gracefully when refreshing', async () => {
      // Mock the store to always return the BASE[0] project for 'alice/project-1' key
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projects' && key === 'alice/project-1') {
          return Promise.resolve(BASE[0] as any);
        }
        return Promise.resolve(undefined);
      });

      // Mock the API to fail
      api.getApiV1ProjectsUsernameSlug.mockReturnValue(
        apiErr(new Error('Test error'))
      );

      // Should be able to get the project even though the API would fail
      const result = await service.getProjectByUsernameAndSlug(
        'alice',
        'project-1'
      );

      // We should still get data back from cache
      expect(result).toEqual(BASE[0]);
    });
  });

  describe('loadAllProjects', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.getApiV1Projects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      store.get.mockReset();
      store.put.mockReset();
      service.error.set(undefined);

      // Reset the projects signal
      service.projects.set([]);
    });

    it('loads projects from API and caches them', async () => {
      // Mock API response
      api.getApiV1Projects.mockReturnValue(apiOk(BASE));

      // Mock cache miss for projects list
      store.get.mockImplementation(() => {
        return Promise.resolve(undefined);
      });

      await service.loadAllProjects();

      // Should have called the API with token
      expect(api.getApiV1Projects).toHaveBeenCalledWith();

      // Should have set the projects signal
      expect(service.projects()).toEqual(BASE);
    });

    it('returns cached projects when available and refreshes in background', async () => {
      // Mock cached projects
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projectsList' && key === 'allProjects') {
          return Promise.resolve(BASE as any);
        }
        return Promise.resolve(undefined);
      });

      // Clear previous calls
      api.getApiV1Projects.mockClear();

      await service.loadAllProjects();

      // Should have set the projects signal from cache
      expect(service.projects()).toEqual(BASE);

      // API should still be called to refresh in background
      expect(api.getApiV1Projects).toHaveBeenCalledWith();
    });

    it('handles API errors gracefully when cache is available', async () => {
      // Mock cached projects
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projectsList' && key === 'allProjects') {
          return Promise.resolve(BASE as any);
        }
        return Promise.resolve(undefined);
      });

      // Mock API error
      api.getApiV1Projects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 500 }))
      );

      await service.loadAllProjects();

      // Should still set projects from cache
      expect(service.projects()).toEqual(BASE);
    });

    it('handles API errors when no cache is available', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API error
      api.getApiV1Projects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(service.loadAllProjects()).rejects.toThrow();

      // Error should be set
      expect(service.error()).toBeDefined();
      expect(service.error()?.code).toBe('NETWORK_ERROR');

      // Projects signal should remain empty
      expect(service.projects()).toEqual([]);
    });
  });

  /* -------------------------------------------------------------- */
  /* createProject                                                 */
  /* -------------------------------------------------------------- */
  describe('createProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerCreateProject.mockReset();
      api.getApiV1Projects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      service.error.set(undefined);
    });

    it('creates a new project and updates cache', async () => {
      const newProject: Project = {
        id: 'test-project-id',
        title: 'New Project',
        slug: 'new-project',
        username: 'alice',
        description: 'A new project description',
        createdDate: date,
        updatedDate: date,
      };

      // Clear previous calls
      api.getApiV1Projects.mockClear();

      // Mock API response
      api.projectControllerCreateProject.mockReturnValue(apiOk(newProject));

      const result = await service.createProject(newProject);

      // Verify the token is used
      expect(xsrf.getXsrfToken).toHaveBeenCalled();

      // Should call API with token parameter first
      expect(api.projectControllerCreateProject).toHaveBeenCalledWith(
        'test-token',
        newProject
      );

      expect(result).toEqual(newProject);
    });

    it('handles API errors correctly', async () => {
      const newProject: Project = {
        id: 'test-project-id',
        title: 'Error Project',
        slug: 'error-project',
        username: 'alice',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail
      api.projectControllerCreateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 500 }))
      );

      await expect(service.createProject(newProject)).rejects.toThrow(
        ProjectServiceError
      );
      expect(service.error()?.code).toBe('SERVER_ERROR');
    });

    it('handles network errors correctly', async () => {
      const newProject: Project = {
        id: 'test-project-id',
        title: 'Offline Project',
        slug: 'offline-project',
        username: 'alice',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail with network error
      api.projectControllerCreateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(service.createProject(newProject)).rejects.toThrow(
        ProjectServiceError
      );
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });
  });

  /* -------------------------------------------------------------- */
  /* updateProject                                                  */
  /* -------------------------------------------------------------- */
  describe('updateProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerUpdateProject.mockReset();
      api.getApiV1Projects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      service.error.set(undefined);
    });

    it('updates a project and refreshes cache', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Updated Title',
        description: 'Updated description',
        createdDate: date,
        updatedDate: date,
      };

      // Setup successful API responses
      api.projectControllerUpdateProject.mockReturnValue(apiOk(updatedProject));
      api.getApiV1Projects.mockReturnValue(apiOk(BASE));

      const result = await service.updateProject(
        'alice',
        'project-1',
        updatedProject
      );

      // Verify the token is used
      expect(xsrf.getXsrfToken).toHaveBeenCalled();

      // Should call API with token parameter
      expect(api.projectControllerUpdateProject).toHaveBeenCalledWith(
        'alice',
        'project-1',
        'test-token',
        updatedProject
      );

      // Result should match the API response
      expect(result).toEqual(updatedProject);
    });

    it('handles API errors correctly', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Updated Title',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail
      api.projectControllerUpdateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      await expect(
        service.updateProject('alice', 'nonexistent', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Offline Update',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail with network error
      api.projectControllerUpdateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(
        service.updateProject('alice', 'project-1', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Unauthorized Update',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail with 401
      api.projectControllerUpdateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 401 }))
      );

      await expect(
        service.updateProject('alice', 'project-1', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(service.error()?.code).toBe('SESSION_EXPIRED');
    });
  });

  /* -------------------------------------------------------------- */
  /* deleteProject                                                 */
  /* -------------------------------------------------------------- */
  describe('deleteProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerDeleteProject.mockReset();
      api.getApiV1Projects.mockReset();
      store.delete.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      service.error.set(undefined);
    });

    it('deletes a project and refreshes the project list', async () => {
      // Clear previous calls
      api.getApiV1Projects.mockClear();

      // Mock API response
      api.projectControllerDeleteProject.mockReturnValue(apiOk(null));

      await service.deleteProject('alice', 'project-1');

      // Verify the token is used
      expect(xsrf.getXsrfToken).toHaveBeenCalled();

      // Should call API with token parameter
      expect(api.projectControllerDeleteProject).toHaveBeenCalledWith(
        'alice',
        'project-1',
        'test-token'
      );

      // Should remove from cache
      expect(store.delete).toHaveBeenCalledWith(
        DB,
        'projects',
        'alice/project-1'
      );
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail
      api.projectControllerDeleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      await expect(
        service.deleteProject('alice', 'nonexistent')
      ).rejects.toThrow(ProjectServiceError);
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.projectControllerDeleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(service.deleteProject('alice', 'project-1')).rejects.toThrow(
        ProjectServiceError
      );
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      // Set up API to fail with 401
      api.projectControllerDeleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 401 }))
      );

      await expect(service.deleteProject('alice', 'project-1')).rejects.toThrow(
        ProjectServiceError
      );
      expect(service.error()?.code).toBe('SESSION_EXPIRED');
    });
  });

  /* -------------------------------------------------------------- */
  /* getProjectCover                                               */
  /* -------------------------------------------------------------- */
  describe('getProjectCover', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.coverControllerGetProjectCover.mockReset();
      service.error.set(undefined);
    });

    it('retrieves project cover blob from API', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });
      api.coverControllerGetProjectCover.mockReturnValue(apiOk(coverBlob));

      const result = await service.getProjectCover('alice', 'project-1');

      // Should call API without token parameter (cover controller doesn't use token)
      expect(api.coverControllerGetProjectCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
      expect(result).toEqual(coverBlob);
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail with 404
      api.coverControllerGetProjectCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      // The service seems to handle this error internally rather than throwing
      await expect(
        service.getProjectCover('alice', 'nonexistent')
      ).rejects.toThrow();
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.coverControllerGetProjectCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // The service seems to handle this error internally rather than throwing
      await expect(
        service.getProjectCover('alice', 'project-1')
      ).rejects.toThrow();
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });
  });

  /* -------------------------------------------------------------- */
  /* deleteProjectCover                                            */
  /* -------------------------------------------------------------- */
  describe('deleteProjectCover', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.deleteApiV1ProjectsUsernameSlugCover.mockReset();
      api.getApiV1Projects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      store.delete.mockReset();
      service.error.set(undefined);
    });

    it('deletes a project cover and refreshes project', async () => {
      // Set up API to succeed
      api.deleteApiV1ProjectsUsernameSlugCover.mockReturnValue(apiOk(undefined));
      api.getApiV1Projects.mockReturnValue(apiOk(BASE));

      await service.deleteProjectCover('alice', 'project-1');

      // Should call API without token parameter (cover controller doesn't use token)
      expect(api.deleteApiV1ProjectsUsernameSlugCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail with 404
      api.deleteApiV1ProjectsUsernameSlugCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      // The service throws the error
      await expect(
        service.deleteProjectCover('alice', 'nonexistent')
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.deleteApiV1ProjectsUsernameSlugCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // The service throws the error
      await expect(
        service.deleteProjectCover('alice', 'project-1')
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('uploadProjectCover', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.postApiV1ProjectsUsernameSlugCover.mockReset();
      api.getApiV1Projects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      service.error.set(undefined);
    });

    it('uploads a project cover and refreshes project', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to succeed
      api.postApiV1ProjectsUsernameSlugCover.mockReturnValue(apiOk(undefined));
      api.getApiV1Projects.mockReturnValue(apiOk(BASE));

      await service.uploadProjectCover('alice', 'project-1', coverBlob);

      // Should call API without token parameter (cover controller doesn't use token)
      expect(api.postApiV1ProjectsUsernameSlugCover).toHaveBeenCalledWith(
        'alice',
        'project-1',
        coverBlob
      );

      // Verify loadAllProjects is called with token
      expect(api.getApiV1Projects).toHaveBeenCalledWith();
    });

    it('handles API errors correctly', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to fail with 413
      api.postApiV1ProjectsUsernameSlugCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 413 }))
      );

      await expect(
        service.uploadProjectCover('alice', 'project-1', coverBlob)
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(service.error()?.code).toBe('SERVER_ERROR');
      expect(service.error()?.message).toContain(
        'An unexpected error occurred'
      );
    });

    it('handles network errors correctly', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to fail with network error
      api.postApiV1ProjectsUsernameSlugCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(
        service.uploadProjectCover('alice', 'project-1', coverBlob)
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to fail with 401
      api.postApiV1ProjectsUsernameSlugCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 401 }))
      );

      await expect(
        service.uploadProjectCover('alice', 'project-1', coverBlob)
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(service.error()?.code).toBe('SESSION_EXPIRED');
    });
  });

  /* -------------------------------------------------------------- */
  /* clearCache                                                    */
  /* -------------------------------------------------------------- */
  describe('clearCache', () => {
    beforeEach(() => {
      // Reset mocks
      store.delete.mockReset();
      store.isAvailable.mockReset();
    });

    it('clears all project caches when storage is available', async () => {
      // Mock storage is available
      store.isAvailable.mockReturnValue(true);
      // Mock the current projects
      service.projects.set(BASE);

      await service.clearCache();

      // Should check if storage is available
      expect(store.isAvailable).toHaveBeenCalled();

      // Should try to clear the projects list
      expect(store.delete).toHaveBeenCalledWith(
        expect.anything(),
        'projectsList',
        'allProjects'
      );

      // Should clear each project cache
      for (const project of BASE) {
        expect(store.delete).toHaveBeenCalledWith(
          expect.anything(),
          'projects',
          `${project.username}/${project.slug}`
        );
      }

      // Should reset the projects signal
      expect(service.projects()).toEqual([]);
    });

    it('handles case when storage is unavailable', async () => {
      // Mock storage is unavailable
      store.isAvailable.mockReturnValue(false);
      // Mock the current projects
      service.projects.set(BASE);

      await service.clearCache();

      // Should check if storage is available
      expect(store.isAvailable).toHaveBeenCalled();

      // Should not try to clear any caches
      expect(store.delete).not.toHaveBeenCalled();

      // Should still reset the projects signal
      expect(service.projects()).toEqual([]);
    });

    it('handles errors when clearing cache', async () => {
      // Mock storage is available but delete fails
      store.isAvailable.mockReturnValue(true);
      store.delete.mockRejectedValue(new Error('Storage error'));

      // Mock the current projects
      service.projects.set(BASE);

      // Should not throw even if cache clearing fails
      await expect(service.clearCache()).resolves.not.toThrow();

      // Should still reset the projects signal
      expect(service.projects()).toEqual([]);
    });
  });

  /* -------------------------------------------------------------- */
  /* Error mapping                                                  */
  /* -------------------------------------------------------------- */
  it.each`
    status | code
    ${0}   | ${'NETWORK_ERROR'}
    ${401} | ${'SESSION_EXPIRED'}
    ${404} | ${'PROJECT_NOT_FOUND'}
    ${500} | ${'SERVER_ERROR'}
  `('formats HTTP $status → $code', ({ status, code }) => {
    const err = new HttpErrorResponse({ status });
    const out = (service as any).formatError(err) as ProjectServiceError;
    expect(out.code).toBe(code);
  });

  it('handles non-HttpErrorResponse errors', () => {
    const err = new Error('Generic error');
    const out = (service as any).formatError(err) as ProjectServiceError;
    expect(out.code).toBe('SERVER_ERROR');
    expect(out.message).toBe('Generic error');
  });

  it('throws SERVER_ERROR when API & cache both fail', async () => {
    store.get.mockResolvedValue(undefined);
    api.getApiV1Projects.mockReturnValue(
      apiErr(new HttpErrorResponse({ status: 500 }))
    );

    await expect(service.loadAllProjects()).rejects.toBeInstanceOf(
      ProjectServiceError
    );
    expect(service.error()?.code).toBe('SERVER_ERROR');
  });

  it('refreshes cache in background', async () => {
    const fresh: Project[] = [
      ...BASE,
      {
        id: '3',
        title: 'Project 3',
        slug: 'project-3',
        username: 'alice',
        createdDate: date,
        updatedDate: date,
      },
    ];

    store.get.mockResolvedValue(BASE);
    api.getApiV1Projects.mockReturnValue(apiOk(fresh));

    await service.loadAllProjects(); // wait until the method resolves

    expect(service.projects()).toEqual(fresh);
  });
});
