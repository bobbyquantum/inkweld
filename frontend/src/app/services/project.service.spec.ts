import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import {
  createServiceFactory,
  SpectatorService,
  SpyObject,
} from '@ngneat/spectator/jest';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Observable } from 'rxjs';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import { ProjectDto } from '../../api-client/model/project-dto';
import { apiErr, apiOk } from '../../testing/utils';
import { ProjectService, ProjectServiceError } from './project.service';
import { StorageService } from './storage.service';
import { XsrfService } from './xsrf.service';

const date = new Date().toISOString();
const BASE: ProjectDto[] = [
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
const createService = createServiceFactory({
  service: ProjectService,
});

/* Convenience alias that includes Spectator's spy mix-ins */
type ApiMock = DeepMockProxy<ProjectAPIService> & SpyObject<ProjectAPIService>;
type StoreMock = DeepMockProxy<StorageService>;
type XsrfMock = DeepMockProxy<XsrfService>;

describe('ProjectService', () => {
  let spec: SpectatorService<ProjectService>;
  let api: ApiMock;
  let store: StoreMock;
  let xsrf: XsrfMock;

  beforeEach(() => {
    api = mockDeep<ProjectAPIService>() as ApiMock;
    store = mockDeep<StorageService>() as StoreMock;
    xsrf = mockDeep<XsrfService>() as XsrfMock;

    // Storage baseline
    store.initializeDatabase.mockResolvedValue(DB);
    store.isAvailable.mockReturnValue(true);

    // XSRF baseline
    xsrf.getXsrfToken.mockReturnValue('token');

    // API baseline
    api.projectControllerGetAllProjects.mockReturnValue(apiOk(BASE));
    api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
      apiOk(BASE[0])
    );
    api.projectControllerCreateProject.mockImplementation(
      (_t, dto) =>
        apiOk(dto) as unknown as Observable<HttpResponse<ProjectDto>> &
          Observable<ProjectDto>
    );
    const mockImpl = (_u: string, _s: string, _t: string, dto: ProjectDto) =>
      apiOk(dto) as unknown as Observable<HttpResponse<ProjectDto>> &
        Observable<ProjectDto>;
    api.projectControllerUpdateProject.mockImplementation(mockImpl);
    api.projectControllerDeleteProject.mockReturnValue(apiOk(null));
    api.coverControllerGetProjectCover.mockReturnValue(apiOk(new Blob()));
    api.coverControllerDeleteCover.mockReturnValue(apiOk(undefined));
    api.coverControllerUploadCover.mockReturnValue(apiOk(undefined));

    spec = createService({
      providers: [
        { provide: ProjectAPIService, useValue: api },
        { provide: StorageService, useValue: store },
        { provide: XsrfService, useValue: xsrf },
      ],
    });
  });

  it('loads projects from API when cache is empty', async () => {
    store.get.mockResolvedValue(undefined);

    await spec.service.loadAllProjects();

    expect(api.projectControllerGetAllProjects).toHaveBeenCalled();
    expect(store.put).toHaveBeenCalledWith(
      DB,
      'projectsList',
      BASE,
      'allProjects'
    );
    expect(spec.service.projects()).toEqual(BASE);
    expect(spec.service.error()).toBeUndefined();
  });

  describe('getProjectByUsernameAndSlug', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerGetProjectByUsernameAndSlug.mockReset();
      store.get.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      spec.service.error.set(undefined);
    });

    it('returns a project from cache if available', async () => {
      // Mock cached project
      store.get.mockResolvedValue(BASE[0]);

      const result = await spec.service.getProjectByUsernameAndSlug(
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
      expect(
        api.projectControllerGetProjectByUsernameAndSlug
      ).not.toHaveBeenCalled();

      // Result should match the cached project
      expect(result).toEqual(BASE[0]);
    });

    it('fetches from API if not in cache and caches result', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API response
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiOk(BASE[0])
      );

      const result = await spec.service.getProjectByUsernameAndSlug(
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
      expect(
        api.projectControllerGetProjectByUsernameAndSlug
      ).toHaveBeenCalledWith('alice', 'project-1');

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
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiErr(new Error('Test error'))
      );

      // Should be able to get the project even though the API would fail
      const result = await spec.service.getProjectByUsernameAndSlug(
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
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiOk(BASE[1])
      );

      const result = await spec.service.getProjectByUsernameAndSlug(
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
      expect(
        api.projectControllerGetProjectByUsernameAndSlug
      ).toHaveBeenCalledWith('bob', 'project-2');

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
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // Should throw an error
      await expect(
        spec.service.getProjectByUsernameAndSlug('alice', 'project-1')
      ).rejects.toThrow();

      // Error should be set with correct code
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles not found errors correctly', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock 404 error
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      // Should throw an error
      await expect(
        spec.service.getProjectByUsernameAndSlug('alice', 'nonexistent')
      ).rejects.toThrow();

      // Error should be set with correct code
      expect(spec.service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('internal project refresh functionality', () => {
    // Instead of directly testing private methods, we'll test the behavior
    // through the public methods that use the private functionality

    it('updates cache with refreshed project data', async () => {
      const updatedProject: ProjectDto = {
        ...BASE[0],
        title: 'Updated Project 1',
        createdDate: date,
        updatedDate: date,
      };
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiOk(updatedProject)
      );

      // We can't call refreshProjectInBackground directly as it's private
      // But we can test its effect after a call to getProjectByUsernameAndSlug
      await spec.service.getProjectByUsernameAndSlug('alice', 'project-1');

      // Should update cache with the new data
      expect(store.put).toHaveBeenCalledWith(
        DB,
        'projects',
        updatedProject,
        'alice/project-1'
      );
      // Should not set error
      expect(spec.service.error()).toBeUndefined();
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
      api.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        apiErr(new Error('Test error'))
      );

      // Should be able to get the project even though the API would fail
      const result = await spec.service.getProjectByUsernameAndSlug(
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
      api.projectControllerGetAllProjects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      store.get.mockReset();
      store.put.mockReset();
      spec.service.error.set(undefined);

      // Reset the projects signal
      spec.service.projects.set([]);
    });

    it('loads projects from API and caches them', async () => {
      // Mock API response
      api.projectControllerGetAllProjects.mockReturnValue(apiOk(BASE));

      // Mock cache miss for projects list
      store.get.mockImplementation(() => {
        return Promise.resolve(undefined);
      });

      await spec.service.loadAllProjects();

      // Should have called the API with token
      expect(api.projectControllerGetAllProjects).toHaveBeenCalledWith();

      // Should have set the projects signal
      expect(spec.service.projects()).toEqual(BASE);
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
      api.projectControllerGetAllProjects.mockClear();

      await spec.service.loadAllProjects();

      // Should have set the projects signal from cache
      expect(spec.service.projects()).toEqual(BASE);

      // API should still be called to refresh in background
      expect(api.projectControllerGetAllProjects).toHaveBeenCalledWith();
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
      api.projectControllerGetAllProjects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 500 }))
      );

      await spec.service.loadAllProjects();

      // Should still set projects from cache
      expect(spec.service.projects()).toEqual(BASE);
    });

    it('handles API errors when no cache is available', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API error
      api.projectControllerGetAllProjects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(spec.service.loadAllProjects()).rejects.toThrow();

      // Error should be set
      expect(spec.service.error()).toBeDefined();
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');

      // Projects signal should remain empty
      expect(spec.service.projects()).toEqual([]);
    });
  });

  /* -------------------------------------------------------------- */
  /* createProject                                                 */
  /* -------------------------------------------------------------- */
  describe('createProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerCreateProject.mockReset();
      api.projectControllerGetAllProjects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      spec.service.error.set(undefined);
    });

    it('creates a new project and updates cache', async () => {
      const newProject: ProjectDto = {
        title: 'New Project',
        slug: 'new-project',
        username: 'alice',
        description: 'A new project description',
        createdDate: date,
        updatedDate: date,
      };

      // Clear previous calls
      api.projectControllerGetAllProjects.mockClear();

      // Mock API response
      api.projectControllerCreateProject.mockReturnValue(apiOk(newProject));

      const result = await spec.service.createProject(newProject);

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
      const newProject: ProjectDto = {
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

      await expect(spec.service.createProject(newProject)).rejects.toThrow(
        ProjectServiceError
      );
      expect(spec.service.error()?.code).toBe('SERVER_ERROR');
    });

    it('handles network errors correctly', async () => {
      const newProject: ProjectDto = {
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

      await expect(spec.service.createProject(newProject)).rejects.toThrow(
        ProjectServiceError
      );
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });
  });

  /* -------------------------------------------------------------- */
  /* updateProject                                                  */
  /* -------------------------------------------------------------- */
  describe('updateProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerUpdateProject.mockReset();
      api.projectControllerGetAllProjects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      spec.service.error.set(undefined);
    });

    it('updates a project and refreshes cache', async () => {
      const updatedProject: ProjectDto = {
        ...BASE[0],
        title: 'Updated Title',
        description: 'Updated description',
        createdDate: date,
        updatedDate: date,
      };

      // Setup successful API responses
      api.projectControllerUpdateProject.mockReturnValue(apiOk(updatedProject));
      api.projectControllerGetAllProjects.mockReturnValue(apiOk(BASE));

      const result = await spec.service.updateProject(
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
      const updatedProject: ProjectDto = {
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
        spec.service.updateProject('alice', 'nonexistent', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(spec.service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      const updatedProject: ProjectDto = {
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
        spec.service.updateProject('alice', 'project-1', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      const updatedProject: ProjectDto = {
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
        spec.service.updateProject('alice', 'project-1', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(spec.service.error()?.code).toBe('SESSION_EXPIRED');
    });
  });

  /* -------------------------------------------------------------- */
  /* deleteProject                                                 */
  /* -------------------------------------------------------------- */
  describe('deleteProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.projectControllerDeleteProject.mockReset();
      api.projectControllerGetAllProjects.mockReset();
      store.delete.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      spec.service.error.set(undefined);
    });

    it('deletes a project and refreshes the project list', async () => {
      // Clear previous calls
      api.projectControllerGetAllProjects.mockClear();

      // Mock API response
      api.projectControllerDeleteProject.mockReturnValue(apiOk(null));

      await spec.service.deleteProject('alice', 'project-1');

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
        spec.service.deleteProject('alice', 'nonexistent')
      ).rejects.toThrow(ProjectServiceError);
      expect(spec.service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.projectControllerDeleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(
        spec.service.deleteProject('alice', 'project-1')
      ).rejects.toThrow(ProjectServiceError);
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      // Set up API to fail with 401
      api.projectControllerDeleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 401 }))
      );

      await expect(
        spec.service.deleteProject('alice', 'project-1')
      ).rejects.toThrow(ProjectServiceError);
      expect(spec.service.error()?.code).toBe('SESSION_EXPIRED');
    });
  });

  /* -------------------------------------------------------------- */
  /* getProjectCover                                               */
  /* -------------------------------------------------------------- */
  describe('getProjectCover', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.coverControllerGetProjectCover.mockReset();
      spec.service.error.set(undefined);
    });

    it('retrieves project cover blob from API', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });
      api.coverControllerGetProjectCover.mockReturnValue(apiOk(coverBlob));

      const result = await spec.service.getProjectCover('alice', 'project-1');

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
        spec.service.getProjectCover('alice', 'nonexistent')
      ).rejects.toThrow();
      expect(spec.service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.coverControllerGetProjectCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // The service seems to handle this error internally rather than throwing
      await expect(
        spec.service.getProjectCover('alice', 'project-1')
      ).rejects.toThrow();
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });
  });

  /* -------------------------------------------------------------- */
  /* deleteProjectCover                                            */
  /* -------------------------------------------------------------- */
  describe('deleteProjectCover', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.coverControllerDeleteCover.mockReset();
      api.projectControllerGetAllProjects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      store.delete.mockReset();
      spec.service.error.set(undefined);
    });

    it('deletes a project cover and refreshes project', async () => {
      // Set up API to succeed
      api.coverControllerDeleteCover.mockReturnValue(apiOk(undefined));
      api.projectControllerGetAllProjects.mockReturnValue(apiOk(BASE));

      await spec.service.deleteProjectCover('alice', 'project-1');

      // Should call API without token parameter (cover controller doesn't use token)
      expect(api.coverControllerDeleteCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail with 404
      api.coverControllerDeleteCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      // The service throws the error
      await expect(
        spec.service.deleteProjectCover('alice', 'nonexistent')
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(spec.service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.coverControllerDeleteCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // The service throws the error
      await expect(
        spec.service.deleteProjectCover('alice', 'project-1')
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('uploadProjectCover', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.coverControllerUploadCover.mockReset();
      api.projectControllerGetAllProjects.mockReset();
      xsrf.getXsrfToken.mockReset();
      xsrf.getXsrfToken.mockReturnValue('test-token');
      spec.service.error.set(undefined);
    });

    it('uploads a project cover and refreshes project', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to succeed
      api.coverControllerUploadCover.mockReturnValue(apiOk(undefined));
      api.projectControllerGetAllProjects.mockReturnValue(apiOk(BASE));

      await spec.service.uploadProjectCover('alice', 'project-1', coverBlob);

      // Should call API without token parameter (cover controller doesn't use token)
      expect(api.coverControllerUploadCover).toHaveBeenCalledWith(
        'alice',
        'project-1',
        coverBlob
      );

      // Verify loadAllProjects is called with token
      expect(api.projectControllerGetAllProjects).toHaveBeenCalledWith();
    });

    it('handles API errors correctly', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to fail with 413
      api.coverControllerUploadCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 413 }))
      );

      await expect(
        spec.service.uploadProjectCover('alice', 'project-1', coverBlob)
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(spec.service.error()?.code).toBe('SERVER_ERROR');
      expect(spec.service.error()?.message).toContain(
        'An unexpected error occurred'
      );
    });

    it('handles network errors correctly', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to fail with network error
      api.coverControllerUploadCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(
        spec.service.uploadProjectCover('alice', 'project-1', coverBlob)
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(spec.service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });

      // Set up API to fail with 401
      api.coverControllerUploadCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 401 }))
      );

      await expect(
        spec.service.uploadProjectCover('alice', 'project-1', coverBlob)
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(spec.service.error()?.code).toBe('SESSION_EXPIRED');
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
      spec.service.projects.set(BASE);

      await spec.service.clearCache();

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
      expect(spec.service.projects()).toEqual([]);
    });

    it('handles case when storage is unavailable', async () => {
      // Mock storage is unavailable
      store.isAvailable.mockReturnValue(false);
      // Mock the current projects
      spec.service.projects.set(BASE);

      await spec.service.clearCache();

      // Should check if storage is available
      expect(store.isAvailable).toHaveBeenCalled();

      // Should not try to clear any caches
      expect(store.delete).not.toHaveBeenCalled();

      // Should still reset the projects signal
      expect(spec.service.projects()).toEqual([]);
    });

    it('handles errors when clearing cache', async () => {
      // Mock storage is available but delete fails
      store.isAvailable.mockReturnValue(true);
      store.delete.mockRejectedValue(new Error('Storage error'));

      // Mock the current projects
      spec.service.projects.set(BASE);

      // Should not throw even if cache clearing fails
      await expect(spec.service.clearCache()).resolves.not.toThrow();

      // Should still reset the projects signal
      expect(spec.service.projects()).toEqual([]);
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
    const out = (spec.service as any).formatError(err) as ProjectServiceError;
    expect(out.code).toBe(code);
  });

  it('handles non-HttpErrorResponse errors', () => {
    const err = new Error('Generic error');
    const out = (spec.service as any).formatError(err) as ProjectServiceError;
    expect(out.code).toBe('SERVER_ERROR');
    expect(out.message).toBe('Generic error');
  });

  it('throws SERVER_ERROR when API & cache both fail', async () => {
    store.get.mockResolvedValue(undefined);
    api.projectControllerGetAllProjects.mockReturnValue(
      apiErr(new HttpErrorResponse({ status: 500 }))
    );

    await expect(spec.service.loadAllProjects()).rejects.toBeInstanceOf(
      ProjectServiceError
    );
    expect(spec.service.error()?.code).toBe('SERVER_ERROR');
  });

  it('refreshes cache in background', async () => {
    const fresh: ProjectDto[] = [
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
    api.projectControllerGetAllProjects.mockReturnValue(apiOk(fresh));

    await spec.service.loadAllProjects(); // wait until the method resolves

    expect(spec.service.projects()).toEqual(fresh);
  });
});
