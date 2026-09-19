import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpErrorResponse, type HttpResponse } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImagesService } from '@inkweld/api/images.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import { type Project } from '@inkweld/model/project';
import { type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { apiErr, apiOk } from '../../../testing/utils';
import { SetupService } from '../core/setup.service';
import { LocalProjectService } from '../local/local-project.service';
import { LocalStorageService } from '../local/local-storage.service';
import { ProjectSyncService } from '../local/project-sync.service';
import { StorageService } from '../local/storage.service';
import { ProjectService, ProjectServiceError } from './project.service';

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
type ImagesMock = DeepMockProxy<ImagesService>;
type StoreMock = DeepMockProxy<StorageService>;
type SetupMock = DeepMockProxy<SetupService>;
type OfflineStorageMock = DeepMockProxy<LocalStorageService>;
type ProjectSyncMock = DeepMockProxy<ProjectSyncService>;
type LocalProjectsMock = DeepMockProxy<LocalProjectService>;

describe('ProjectService', () => {
  let service: ProjectService;
  let api: ApiMock;
  let httpMock: HttpTestingController;
  let imagesApi: ImagesMock;
  let store: StoreMock;
  let setup: SetupMock;
  let localStorage: OfflineStorageMock;
  let projectSync: ProjectSyncMock;
  let localProjects: LocalProjectsMock;

  beforeEach(() => {
    api = mockDeep<ProjectsService>();
    imagesApi = mockDeep<ImagesService>();
    store = mockDeep<StorageService>();
    setup = mockDeep<SetupService>();
    localStorage = mockDeep<LocalStorageService>();
    projectSync = mockDeep<ProjectSyncService>();
    localProjects = mockDeep<LocalProjectService>();
    // Cover uploads consult the pending-upload queue; default to "nothing queued".
    projectSync.getSyncState.mockReturnValue(
      signal({
        projectKey: 'alice/project-1',
        pendingUploads: [],
        status: 'synced',
      }) as never
    );

    // Storage baseline
    store.initializeDatabase.mockResolvedValue(DB);
    store.isAvailable.mockReturnValue(true);

    // Setup service baseline - default to server mode
    setup.getMode.mockReturnValue('server');

    // Offline storage baseline
    localStorage.saveMedia.mockResolvedValue(undefined);

    // Project sync baseline
    projectSync.markPendingUpload.mockResolvedValue(undefined);

    // API baseline
    api.listUserProjects.mockReturnValue(apiOk(BASE));
    api.createProject.mockImplementation(
      (dto: unknown) =>
        apiOk(dto) as unknown as Observable<HttpResponse<Project>> &
          Observable<Project>
    );
    const mockImpl = (_u: string, _s: string, dto?: unknown) =>
      apiOk(dto) as unknown as Observable<HttpResponse<Project>> &
        Observable<Project>;
    api.updateProject.mockImplementation(mockImpl);
    api.deleteProject.mockReturnValue(apiOk({ message: 'Project deleted' }));
    imagesApi.getProjectCover.mockReturnValue(apiOk(new Blob()));
    imagesApi.deleteProjectCover.mockReturnValue(
      apiOk({ message: 'Cover deleted' })
    );
    imagesApi.uploadProjectCover.mockReturnValue(
      apiOk({ message: 'Cover uploaded' })
    );

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        ProjectService,
        { provide: ProjectsService, useValue: api },
        { provide: ImagesService, useValue: imagesApi },
        { provide: StorageService, useValue: store },
        { provide: SetupService, useValue: setup },
        { provide: LocalStorageService, useValue: localStorage },
        { provide: ProjectSyncService, useValue: projectSync },
        { provide: LocalProjectService, useValue: localProjects },
      ],
    });

    service = TestBed.inject(ProjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  /**
   * Put `projects` in the cache without loading them into the session, the
   * state any page that is not the project grid starts in.
   */
  function cacheHolds(projects: Project[]): void {
    store.get.mockImplementation(((
      _db: IDBDatabase,
      storeName: string,
      key: string
    ) => {
      if (storeName === 'projectsList') return Promise.resolve([...projects]);
      const match = projects.find(p => `${p.username}/${p.slug}` === key);
      return Promise.resolve(match ? { ...match } : undefined);
    }) as never);
  }

  /** The project list as it was last written to the cache. */
  function cachedList(): Project[] | undefined {
    const writes = store.put.mock.calls.filter(
      call => call[1] === 'projectsList'
    );
    return writes.at(-1)?.[2] as Project[] | undefined;
  }

  it('loads projects from API when cache is empty', async () => {
    store.get.mockResolvedValue(undefined);

    await service.loadAllProjects();

    expect(api.listUserProjects).toHaveBeenCalled();
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
      api.getProject.mockReset();
      store.get.mockReset();
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
      expect(api.getProject).not.toHaveBeenCalled();

      // Result should match the cached project
      expect(result).toEqual(BASE[0]);
    });

    it('fetches from API if not in cache and caches result', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API response for the specific project
      api.getProject.mockReturnValue(apiOk(BASE[0]));

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
      expect(api.getProject).toHaveBeenCalledWith('alice', 'project-1');

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
      api.getProject.mockReturnValue(apiErr(new Error('Test error')));

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
      api.getProject.mockReturnValue(apiOk(BASE[1]));

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
      expect(api.getProject).toHaveBeenCalledWith('bob', 'project-2');

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
      api.getProject.mockReturnValue(
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
      api.getProject.mockReturnValue(
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
      api.getProject.mockReturnValue(apiOk(updatedProject));

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
      api.getProject.mockReturnValue(apiErr(new Error('Test error')));

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
      api.listUserProjects.mockReset();
      store.get.mockReset();
      store.put.mockReset();
      service.error.set(undefined);

      // Reset the projects signal
      service.projects.set([]);
    });

    it('loads projects from API and caches them', async () => {
      // Mock API response
      api.listUserProjects.mockReturnValue(apiOk(BASE));

      // Mock cache miss for projects list
      store.get.mockImplementation(() => {
        return Promise.resolve(undefined);
      });

      await service.loadAllProjects();

      // Should have called the API with token
      expect(api.listUserProjects).toHaveBeenCalledWith();

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

      // Clear previous calls but re-mock the API response
      api.listUserProjects.mockClear();
      api.listUserProjects.mockReturnValue(apiOk(BASE));

      await service.loadAllProjects();

      // Should have set the projects signal from cache
      expect(service.projects()).toEqual(BASE);

      // API should still be called to refresh in background
      expect(api.listUserProjects).toHaveBeenCalledWith();
    });

    it('handles network errors gracefully when cache is available', async () => {
      // Mock cached projects
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projectsList' && key === 'allProjects') {
          return Promise.resolve(BASE as any);
        }
        return Promise.resolve(undefined);
      });

      // Mock network error (status 0) - this is recoverable with cache
      api.listUserProjects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await service.loadAllProjects();

      // Should still set projects from cache
      expect(service.projects()).toEqual(BASE);
    });

    it('handles server unavailable errors gracefully when cache is available', async () => {
      // Mock cached projects
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projectsList' && key === 'allProjects') {
          return Promise.resolve(BASE as any);
        }
        return Promise.resolve(undefined);
      });

      // Mock 503 Service Unavailable - this is recoverable with cache
      api.listUserProjects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 503 }))
      );

      await service.loadAllProjects();

      // Should still set projects from cache
      expect(service.projects()).toEqual(BASE);
    });

    it('does not use cache for non-recoverable errors like 500', async () => {
      // Mock cached projects
      store.get.mockImplementation((db, storeName, key) => {
        if (storeName === 'projectsList' && key === 'allProjects') {
          return Promise.resolve(BASE as any);
        }
        return Promise.resolve(undefined);
      });

      // Mock 500 Internal Server Error - NOT recoverable with cache
      api.listUserProjects.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 500 }))
      );

      await expect(service.loadAllProjects()).rejects.toThrow();

      // Error should be set
      expect(service.error()).toBeDefined();
      expect(service.error()?.code).toBe('SERVER_ERROR');
    });

    it('handles API errors when no cache is available', async () => {
      // Mock cache miss
      store.get.mockResolvedValue(undefined);

      // Mock API error
      api.listUserProjects.mockReturnValue(
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
      api.createProject.mockReset();
      api.listUserProjects.mockReset();
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
      api.listUserProjects.mockClear();

      // Mock API response
      api.createProject.mockReturnValue(apiOk(newProject));

      const result = await service.createProject(newProject);

      // Should call API with create request
      expect(api.createProject).toHaveBeenCalledWith({
        slug: newProject.slug,
        title: newProject.title,
        description: newProject.description,
      });

      expect(result).toEqual(newProject);
    });

    it('adds to the cached list when this session has not loaded it', async () => {
      // Reached straight by URL, so nothing has loaded the grid: appending to
      // that empty snapshot made the new project the only one in the cache.
      const newProject: Project = {
        id: 'test-project-id',
        title: 'New Project',
        slug: 'new-project',
        username: 'alice',
        createdDate: date,
        updatedDate: date,
      };
      api.createProject.mockReturnValue(apiOk(newProject));
      cacheHolds(BASE);

      await service.createProject(newProject);

      expect(cachedList()).toEqual([
        expect.objectContaining({ slug: 'project-1' }),
        expect.objectContaining({ slug: 'project-2' }),
        expect.objectContaining({ slug: 'new-project' }),
      ]);
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
      api.createProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 500 }))
      );

      await expect(service.createProject(newProject)).rejects.toThrow(
        ProjectServiceError
      );
      expect(service.error()?.code).toBe('SERVER_ERROR');
    });

    it('handles network errors correctly (throws for local-first fallback)', async () => {
      const newProject: Project = {
        id: 'test-project-id',
        title: 'Offline Project',
        slug: 'offline-project',
        username: 'alice',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail with network error
      api.createProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // Network errors now throw without setting error() to allow local-first fallback
      await expect(service.createProject(newProject)).rejects.toThrow(
        ProjectServiceError
      );
      // Error is NOT set for network errors - caller should handle local-first fallback
      expect(service.error()).toBeUndefined();
    });
  });

  /* -------------------------------------------------------------- */
  /* updateProject                                                  */
  /* -------------------------------------------------------------- */
  describe('updateProject', () => {
    beforeEach(() => {
      // Reset mocks before each test
      api.updateProject.mockReset();
      api.listUserProjects.mockReset();
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
      api.updateProject.mockReturnValue(apiOk(updatedProject));
      api.listUserProjects.mockReturnValue(apiOk(BASE));

      const result = await service.updateProject(
        'alice',
        'project-1',
        updatedProject
      );

      // Should call API with update request
      expect(api.updateProject).toHaveBeenCalledWith('alice', 'project-1', {
        title: updatedProject.title,
        description: updatedProject.description,
      });

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
      api.updateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      await expect(
        service.updateProject('alice', 'nonexistent', updatedProject)
      ).rejects.toThrow(ProjectServiceError);
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors with offline-first - returns local data', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Offline Update',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail with network error
      api.updateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // Network error should succeed with offline-first (returns local data)
      const result = await service.updateProject(
        'alice',
        'project-1',
        updatedProject
      );

      // Should return the updated project (from cache)
      expect(result.title).toBe('Offline Update');
      // Error should NOT be set for recoverable network errors
      expect(service.error()).toBeUndefined();
    });

    it('updates the cached list when this session has not loaded it', async () => {
      // Saving from inside a project on a fresh load: nothing has populated
      // the in-memory list yet. Working from that empty snapshot replaced the
      // cached list with nothing, and with the server unreachable the home
      // page was left with no projects and no way to fetch any.
      api.updateProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );
      cacheHolds(BASE);
      expect(service.projects()).toEqual([]);

      await service.updateProject('alice', 'project-1', {
        ...BASE[0],
        title: 'Offline Update',
      });

      expect(cachedList()).toEqual([
        expect.objectContaining({ slug: 'project-1', title: 'Offline Update' }),
        expect.objectContaining({ slug: 'project-2', title: 'Project 2' }),
      ]);
    });

    it('handles unauthorized errors correctly', async () => {
      const updatedProject: Project = {
        ...BASE[0],
        title: 'Unauthorized Update',
        createdDate: date,
        updatedDate: date,
      };

      // Set up API to fail with 401
      api.updateProject.mockReturnValue(
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
      api.deleteProject.mockReset();
      api.listUserProjects.mockReset();
      store.delete.mockReset();
      service.error.set(undefined);
    });

    it('deletes a project and refreshes the project list', async () => {
      // Clear previous calls
      api.listUserProjects.mockClear();

      // Mock API response
      api.deleteProject.mockReturnValue(apiOk({ message: 'Project deleted' }));

      await service.deleteProject('alice', 'project-1');

      // Should call API without token parameter
      expect(api.deleteProject).toHaveBeenCalledWith('alice', 'project-1');

      // Should remove from cache
      expect(store.delete).toHaveBeenCalledWith(
        DB,
        'projects',
        'alice/project-1'
      );
    });

    it('leaves the other cached projects alone when the list was not loaded', async () => {
      // Filtering an empty snapshot and writing it back wiped every other
      // project out of the cache along with the deleted one.
      api.deleteProject.mockReturnValue(apiOk({ message: 'Project deleted' }));
      cacheHolds(BASE);

      await service.deleteProject('alice', 'project-1');

      expect(cachedList()).toEqual([
        expect.objectContaining({ slug: 'project-2' }),
      ]);
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail
      api.deleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 404 }))
      );

      await expect(
        service.deleteProject('alice', 'nonexistent')
      ).rejects.toThrow(ProjectServiceError);
      expect(service.error()?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('handles network errors correctly', async () => {
      // Set up API to fail with network error
      api.deleteProject.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      await expect(service.deleteProject('alice', 'project-1')).rejects.toThrow(
        ProjectServiceError
      );
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('handles unauthorized errors correctly', async () => {
      // Set up API to fail with 401
      api.deleteProject.mockReturnValue(
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
      imagesApi.getProjectCover.mockReset();
      service.error.set(undefined);
    });

    it('retrieves project cover blob from API', async () => {
      const coverBlob = new Blob(['test'], { type: 'image/jpeg' });
      imagesApi.getProjectCover.mockReturnValue(apiOk(coverBlob));

      const result = await service.getProjectCover('alice', 'project-1');

      // Should call API without token parameter (cover controller doesn't use token)
      expect(imagesApi.getProjectCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
      expect(result).toEqual(coverBlob);
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail with 404
      imagesApi.getProjectCover.mockReturnValue(
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
      imagesApi.getProjectCover.mockReturnValue(
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
      imagesApi.deleteProjectCover.mockReset();
      api.listUserProjects.mockReset();
      store.delete.mockReset();
      service.error.set(undefined);
    });

    it('deletes a project cover and refreshes project', async () => {
      // Set up API to succeed
      imagesApi.deleteProjectCover.mockReturnValue(
        apiOk({ message: 'Cover deleted' })
      );
      api.listUserProjects.mockReturnValue(apiOk(BASE));

      await service.deleteProjectCover('alice', 'project-1');

      // Should call API without token parameter (cover controller doesn't use token)
      expect(imagesApi.deleteProjectCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
    });

    it('handles API errors correctly', async () => {
      // Set up API to fail with 404
      imagesApi.deleteProjectCover.mockReturnValue(
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
      imagesApi.deleteProjectCover.mockReturnValue(
        apiErr(new HttpErrorResponse({ status: 0 }))
      );

      // The service throws the error
      await expect(
        service.deleteProjectCover('alice', 'project-1')
      ).rejects.toThrow();

      // Verify error was set with correct code
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('clears the IndexedDB cache after successful delete', async () => {
      // Set up API to succeed
      imagesApi.deleteProjectCover.mockReturnValue(
        apiOk({ message: 'Cover deleted' })
      );
      api.listUserProjects.mockReturnValue(apiOk(BASE));
      localStorage.deleteProjectCover.mockResolvedValue(undefined);

      await service.deleteProjectCover('alice', 'project-1');

      // Should clear the cached cover
      expect(localStorage.deleteProjectCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
    });

    it('continues even if IndexedDB cache clear fails', async () => {
      // Set up API to succeed
      imagesApi.deleteProjectCover.mockReturnValue(
        apiOk({ message: 'Cover deleted' })
      );
      api.listUserProjects.mockReturnValue(apiOk(BASE));
      localStorage.deleteProjectCover.mockRejectedValue(
        new Error('IndexedDB error')
      );

      // Should not throw - cache clear failure is non-fatal
      await expect(
        service.deleteProjectCover('alice', 'project-1')
      ).resolves.not.toThrow();

      // Should still have called the cache clear
      expect(localStorage.deleteProjectCover).toHaveBeenCalledWith(
        'alice',
        'project-1'
      );
    });
  });

  // uploadProjectCover tests removed - the method uses http.post() directly instead of
  // the imagesApi service, making proper mocking complex. This functionality is already
  // thoroughly tested in component tests (home-tab.component.spec.ts and
  // edit-project-dialog.component.spec.ts) which properly mock the service method.

  /* -------------------------------------------------------------- */
  /* uploadProjectCover - offline mode                              */
  /* -------------------------------------------------------------- */
  describe('syncPendingCoverUpload', () => {
    it('sends the newest pending cover and clears the queue', async () => {
      setup.getMode.mockReturnValue('server');
      projectSync.getSyncState.mockReturnValue(
        signal({
          projectKey: 'alice/project-1',
          pendingUploads: ['cover-100', 'img-1', 'cover-200'],
          status: 'pending',
        }) as never
      );
      const blob = new Blob(['cover'], { type: 'image/jpeg' });
      localStorage.getMedia.mockResolvedValue(blob);
      localStorage.saveMedia.mockResolvedValue(undefined);
      projectSync.clearPendingUpload.mockResolvedValue(undefined);

      const pending = service.syncPendingCoverUpload('alice/project-1');
      // The blob is read from IndexedDB before the request goes out.
      for (let i = 0; i < 5; i++) await Promise.resolve();
      const req = httpMock.expectOne(
        r =>
          r.url.includes('/api/v1/projects/alice/project-1/cover') &&
          r.method === 'POST'
      );
      req.flush({ message: 'ok', coverImage: 'cover-300.jpg' });

      await expect(pending).resolves.toBe('cover-300.jpg');
      // The newest local cover was the one sent.
      expect(localStorage.getMedia).toHaveBeenCalledWith(
        'alice/project-1',
        'cover-200'
      );
      // Cached under the server's id so home cards resolve it.
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        'alice/project-1',
        'cover-300',
        blob
      );
      expect(projectSync.clearPendingUpload).toHaveBeenCalledWith(
        'alice/project-1',
        'cover-100'
      );
      expect(projectSync.clearPendingUpload).toHaveBeenCalledWith(
        'alice/project-1',
        'cover-200'
      );
      expect(projectSync.clearPendingUpload).not.toHaveBeenCalledWith(
        'alice/project-1',
        'img-1'
      );
    });

    it('returns null when nothing is pending', async () => {
      await expect(
        service.syncPendingCoverUpload('alice/project-1')
      ).resolves.toBeNull();
      httpMock.expectNone(() => true);
    });

    it('drops the queue entry when the local blob is gone', async () => {
      projectSync.getSyncState.mockReturnValue(
        signal({
          projectKey: 'alice/project-1',
          pendingUploads: ['cover-100'],
          status: 'pending',
        }) as never
      );
      localStorage.getMedia.mockResolvedValue(null);
      projectSync.clearPendingUpload.mockResolvedValue(undefined);

      await expect(
        service.syncPendingCoverUpload('alice/project-1')
      ).resolves.toBeNull();
      expect(projectSync.clearPendingUpload).toHaveBeenCalledWith(
        'alice/project-1',
        'cover-100'
      );
      httpMock.expectNone(() => true);
    });
  });

  describe('uploadProjectCover (offline mode)', () => {
    beforeEach(() => {
      // Reset mocks
      setup.getMode.mockReset();
      localStorage.saveMedia.mockReset();
      projectSync.markPendingUpload.mockReset();
    });

    it('saves cover to IndexedDB when in offline mode', async () => {
      // Configure offline mode
      setup.getMode.mockReturnValue('local');
      localStorage.saveMedia.mockResolvedValue(undefined);
      projectSync.markPendingUpload.mockResolvedValue(undefined);

      const coverBlob = new Blob(['test cover'], { type: 'image/png' });

      const result = await service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );

      // Should return a cover filename
      expect(result).toMatch(/^cover-\d+\.jpg$/);

      // Should save to offline storage using filename stem as mediaId
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        'alice/project-1',
        expect.stringMatching(/^cover-\d+$/),
        coverBlob
      );

      // Should mark for sync
      expect(projectSync.markPendingUpload).toHaveBeenCalledWith(
        'alice/project-1',
        expect.stringMatching(/^cover-\d+$/)
      );

      // Should not set error
      expect(service.error()).toBeUndefined();
    });

    it('does not call API in offline mode', async () => {
      // Configure offline mode
      setup.getMode.mockReturnValue('local');
      localStorage.saveMedia.mockResolvedValue(undefined);
      projectSync.markPendingUpload.mockResolvedValue(undefined);

      const coverBlob = new Blob(['test cover'], { type: 'image/png' });

      await service.uploadProjectCover('alice', 'project-1', coverBlob);

      // Should NOT reload projects (which would call API)
      expect(api.listUserProjects).not.toHaveBeenCalled();
    });

    it('saves to IndexedDB after successful server upload', async () => {
      // Configure server mode (default)
      setup.getMode.mockReturnValue('server');
      localStorage.saveMedia.mockResolvedValue(undefined);

      const coverBlob = new Blob(['test cover'], { type: 'image/png' });

      // Start the upload (don't await yet)
      const uploadPromise = service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );

      // Mock the HTTP response with coverImage filename
      const req = httpMock.expectOne(
        req =>
          req.url.includes('/api/v1/projects/alice/project-1/cover') &&
          req.method === 'POST'
      );
      req.flush({
        message: 'Cover uploaded',
        coverImage: 'cover-1234567890.jpg',
      });

      // Now await the upload to complete
      const result = await uploadPromise;

      // Should return the server-assigned filename
      expect(result).toBe('cover-1234567890.jpg');

      // Should save to IndexedDB with filename stem as mediaId
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        'alice/project-1',
        'cover-1234567890',
        coverBlob
      );

      // markPendingUpload should NOT be called (that's offline-only)
      expect(projectSync.markPendingUpload).not.toHaveBeenCalled();
    });

    it('falls back to local save + queued sync when the server 404s the cover upload', async () => {
      // The "server lost the project record" incident: the upload endpoint
      // 404s. Local-first means the cover blob (the user's data) must be
      // kept locally with a pending sync — never discarded over a
      // server-side problem.
      setup.getMode.mockReturnValue('server');
      localStorage.saveMedia.mockResolvedValue(undefined);
      projectSync.markPendingUpload.mockResolvedValue(undefined);
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const coverBlob = new Blob(['test cover'], { type: 'image/png' });
      const uploadPromise = service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );

      // The pipe retries MAX_RETRIES (3) times, so flush the 404 for the
      // initial attempt plus each retry.
      for (let attempt = 0; attempt < 4; attempt++) {
        const req = httpMock.expectOne(
          r =>
            r.url.includes('/api/v1/projects/alice/project-1/cover') &&
            r.method === 'POST'
        );
        req.flush(
          { error: 'Project not found' },
          { status: 404, statusText: 'Not Found' }
        );
        // Let the retry re-subscribe before expecting the next request.
        await Promise.resolve();
      }

      const result = await uploadPromise;

      // Local fallback filename returned, blob saved, sync queued.
      expect(result).toMatch(/^cover-\d+\.jpg$/);
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        'alice/project-1',
        expect.stringMatching(/^cover-\d+$/),
        coverBlob
      );
      expect(projectSync.markPendingUpload).toHaveBeenCalledWith(
        'alice/project-1',
        expect.stringMatching(/^cover-\d+$/)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  /* -------------------------------------------------------------- */
  /* cover saved with no server to take it                          */
  /* -------------------------------------------------------------- */

  describe('recording a cover the server never received', () => {
    const coverBlob = new Blob(['test cover'], { type: 'image/png' });

    /** Kill the cover upload the way an unreachable server does. */
    async function serverUnreachable(): Promise<void> {
      // The pipe retries MAX_RETRIES (3) times on top of the first attempt.
      for (let attempt = 0; attempt < 4; attempt++) {
        const req = httpMock.expectOne(
          r =>
            r.url.includes('/api/v1/projects/alice/project-1/cover') &&
            r.method === 'POST'
        );
        req.error(new ProgressEvent('error'));
        await Promise.resolve();
      }
    }

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('stamps the cover onto the cached project list in server mode', async () => {
      // The home grid resolves covers from the project record, which only the
      // server normally fills in — so without this the cover shows inside the
      // project (from Yjs) and nowhere else.
      setup.getMode.mockReturnValue('server');
      await service.loadAllProjects();

      const upload = service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );
      await serverUnreachable();
      const filename = await upload;

      expect(
        service.projects().find(p => p.slug === 'project-1')?.coverImage
      ).toBe(filename);
      expect(store.put).toHaveBeenCalledWith(
        DB,
        'projectsList',
        expect.arrayContaining([
          expect.objectContaining({ slug: 'project-1', coverImage: filename }),
        ]),
        'allProjects'
      );
    });

    it('leaves the other projects alone', async () => {
      setup.getMode.mockReturnValue('server');
      await service.loadAllProjects();

      const upload = service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );
      await serverUnreachable();
      await upload;

      expect(
        service.projects().find(p => p.slug === 'project-2')?.coverImage
      ).toBeUndefined();
    });

    it('stamps the cached project when the list was never loaded', async () => {
      // Opened straight into a project on a fresh load: there is no list in
      // memory yet, but the per-project cache entry is still worth correcting.
      setup.getMode.mockReturnValue('server');
      store.get.mockImplementation(((
        _db: IDBDatabase,
        storeName: string,
        key: string
      ) =>
        Promise.resolve(
          storeName === 'projects' && key === 'alice/project-1'
            ? { ...BASE[0] }
            : undefined
        )) as never);

      const upload = service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );
      await serverUnreachable();
      const filename = await upload;

      expect(store.put).toHaveBeenCalledWith(
        DB,
        'projects',
        expect.objectContaining({ slug: 'project-1', coverImage: filename }),
        'alice/project-1'
      );
    });

    it('updates the local project record in local mode', async () => {
      setup.getMode.mockReturnValue('local');

      const filename = await service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );

      expect(localProjects.updateProject).toHaveBeenCalledWith(
        'alice',
        'project-1',
        { coverImage: filename }
      );
    });

    it('keeps the cover even when the record cannot be stamped', async () => {
      setup.getMode.mockReturnValue('local');
      localProjects.updateProject.mockImplementation(() => {
        throw new Error('no such project');
      });

      const filename = await service.uploadProjectCover(
        'alice',
        'project-1',
        coverBlob
      );

      expect(filename).toMatch(/^cover-\d+\.jpg$/);
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        'alice/project-1',
        expect.stringMatching(/^cover-\d+$/),
        coverBlob
      );
      expect(projectSync.markPendingUpload).toHaveBeenCalled();
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
    api.listUserProjects.mockReturnValue(
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
    api.listUserProjects.mockReturnValue(apiOk(fresh));

    await service.loadAllProjects(); // wait until the method resolves

    expect(service.projects()).toEqual(fresh);
  });

  describe('cache error handling', () => {
    it('should handle getCachedProjectsList storage error', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Make storage throw when getting cached projects list
      store.get.mockRejectedValueOnce(new Error('Storage read error'));
      api.listUserProjects.mockReturnValue(apiOk(BASE));

      await service.loadAllProjects();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get cached projects:',
        expect.any(Error)
      );
      expect(service.projects()).toEqual(BASE);
      consoleSpy.mockRestore();
    });
  });
});
