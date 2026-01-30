import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { ImagesService, Project, ProjectsService } from '@inkweld/index';
import { catchError, firstValueFrom, retry, throwError } from 'rxjs';

import { XsrfService } from '../auth/xsrf.service';
import { SetupService } from '../core/setup.service';
import { LocalStorageService } from '../local/local-storage.service';
import { ProjectSyncService } from '../local/project-sync.service';
import { StorageService } from '../local/storage.service';

export class ProjectServiceError extends Error {
  constructor(
    public code:
      | 'NETWORK_ERROR'
      | 'SESSION_EXPIRED'
      | 'SERVER_ERROR'
      | 'PROJECT_NOT_FOUND'
      | 'PROJECT_RENAMED',
    message: string,
    public readonly canUseCache: boolean = false
  ) {
    super(message);
    this.name = 'ProjectServiceError';
  }
}

/**
 * Error thrown when a project has been renamed.
 * Contains redirect information for the client to migrate local data.
 */
export class ProjectRenamedError extends ProjectServiceError {
  constructor(
    public readonly oldSlug: string,
    public readonly newSlug: string,
    public readonly username: string,
    public readonly renamedAt: string
  ) {
    super(
      'PROJECT_RENAMED',
      `Project renamed from ${oldSlug} to ${newSlug}`,
      false
    );
    this.name = 'ProjectRenamedError';
  }
}

/**
 * Type guard to check if response body is a project rename redirect
 */
function isProjectRenameRedirect(body: unknown): body is {
  renamed: true;
  oldSlug: string;
  newSlug: string;
  username: string;
  renamedAt: string;
} {
  return (
    typeof body === 'object' &&
    body !== null &&
    'renamed' in body &&
    (body as Record<string, unknown>)['renamed'] === true &&
    'oldSlug' in body &&
    'newSlug' in body &&
    'username' in body
  );
}

/**
 * Determines if an HTTP error is recoverable using cached data.
 * Auth errors (401/403) should NOT use cache - user needs to re-authenticate.
 * Network/server errors CAN use cache for offline resilience.
 */
function isRecoverableWithCache(error: unknown): boolean {
  if (error instanceof HttpErrorResponse) {
    // Network failures (status 0) or server unavailable errors - use cache
    if (
      error.status === 0 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    ) {
      return true;
    }
    // Auth errors - do NOT use cache, let interceptor handle redirect
    if (error.status === 401 || error.status === 403) {
      return false;
    }
  }
  return false;
}

const PROJECT_CACHE_CONFIG = {
  dbName: 'projectCache',
  version: 1,
  stores: {
    projects: null,
    projectsList: null,
  },
} as const;

const PROJECTS_LIST_CACHE_KEY = 'allProjects';
const MAX_RETRIES = 3;

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly projectApi = inject(ProjectsService);
  private readonly imagesApi = inject(ImagesService);
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly xsrfService = inject(XsrfService);
  private readonly setupService = inject(SetupService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly projectSync = inject(ProjectSyncService);

  readonly projects = signal<Project[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<ProjectServiceError | undefined>(undefined);
  readonly hasProjects = computed(() => this.projects().length > 0);
  readonly initialized = signal(false);

  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = this.storage
      .initializeDatabase(PROJECT_CACHE_CONFIG)
      .catch(error => {
        console.error('Project cache initialization failed:', error);
        throw new ProjectServiceError(
          'SERVER_ERROR',
          'Failed to initialize project cache'
        );
      });
  }

  async loadAllProjects(): Promise<void> {
    if (!this.initialized()) {
      this.initialized.set(true);
    }

    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      let cachedProjects: Project[] | undefined;

      // Get cached projects if available to display immediately
      if (this.storage.isAvailable()) {
        cachedProjects = await this.getCachedProjects();
        if (cachedProjects && cachedProjects.length > 0) {
          this.projects.set(cachedProjects);
          // Don't return - continue to fetch fresh data
        }
      }

      // Always fetch from API to get fresh data
      try {
        const projects = await firstValueFrom(
          this.projectApi.listUserProjects().pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              // Check if this error can be recovered using cache
              if (
                isRecoverableWithCache(error) &&
                cachedProjects &&
                cachedProjects.length > 0
              ) {
                console.warn(
                  'Network/server error, using cached projects:',
                  error instanceof HttpErrorResponse
                    ? `${error.status} ${error.statusText}`
                    : error
                );
                // Return a specific error to signal we should use cache
                return throwError(
                  () => new Error('Refresh failed, using cache')
                );
              }

              // For auth errors (401/403), don't catch - let it propagate
              // The AuthInterceptor will handle the redirect
              const projectError = this.formatError(error);
              this.error.set(projectError);
              return throwError(() => projectError);
            })
          )
        );

        if (projects) {
          // Assume projects is Project[]
          await this.setProjects(projects);
        }
      } catch (err) {
        // Only use cache for recoverable errors (network/server issues)
        const canRecover =
          err instanceof Error && err.message === 'Refresh failed, using cache';

        if (canRecover && cachedProjects && cachedProjects.length > 0) {
          console.info('Using cached projects due to network/server error');
          // Projects already set from cache above, just continue
        } else if (!canRecover) {
          // Re-throw auth errors and other non-recoverable errors
          throw err;
        }
      }
    } catch (err) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError(
              'SERVER_ERROR',
              'Failed to load projects data'
            );
      this.error.set(error);
      console.error('Projects loading error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async getProjectByUsernameAndSlug(
    username: string,
    slug: string
  ): Promise<Project> {
    this.isLoading.set(true);
    this.error.set(undefined);

    const cacheKey = `${username}/${slug}`;
    let cachedProject: Project | undefined;

    try {
      // Try to find project in cached projects first
      if (this.storage.isAvailable()) {
        cachedProject = await this.getCachedProject(cacheKey);
        if (cachedProject) {
          // Return cached project immediately for fast UI response
          // But continue fetching fresh data in the background
          setTimeout(
            () => void this.refreshProjectInBackground(username, slug),
            0
          );
          this.isLoading.set(false);
          return cachedProject;
        }
      }

      // No cache available, fetch from API with retry mechanism
      const project = await firstValueFrom(
        this.projectApi.getProject(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const projectError = this.formatError(error);
            this.error.set(projectError);
            return throwError(() => projectError);
          })
        )
      );

      if (project) {
        // Cache the individual project
        await this.setCachedProject(cacheKey, project);
      }
      return project;
    } catch (err: unknown) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError('SERVER_ERROR', 'Failed to load project');
      this.error.set(error);
      console.error('Project loading error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Refreshes a project in the background without blocking UI
   * This helps keep cached data fresh without disrupting the user experience
   */
  private async refreshProjectInBackground(
    username: string,
    slug: string
  ): Promise<void> {
    const cacheKey = `${username}/${slug}`;

    try {
      const project = await firstValueFrom(
        this.projectApi.getProject(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            console.warn(
              `Background refresh failed for project ${cacheKey}:`,
              error
            );
            // Don't re-throw, just complete the observable chain
            return throwError(() => error); // Or return EMPTY
          })
        )
      );

      if (project) {
        // Update the cache with fresh data
        await this.setCachedProject(cacheKey, project);

        // Also update the project in the projects list if it exists
        const currentProjects = this.projects();
        const projectIndex = currentProjects.findIndex(
          p => p.slug === slug && p.username === username
        );

        if (projectIndex >= 0) {
          const updatedProjects = [...currentProjects];
          updatedProjects[projectIndex] = project;
          await this.setProjects(updatedProjects); // Update list and cache
        }
      }
    } catch (error: unknown) {
      // Just log errors for background operations
      console.warn(`Background refresh failed for project ${cacheKey}:`, error);
    }
  }

  /**
   * Create a project on the server.
   *
   * For local-first creation with offline fallback, use UnifiedProjectService.createProject()
   * which wraps this method and handles network failures gracefully.
   */
  async createProject(projectData: Project): Promise<Project> {
    this.isLoading.set(true);
    this.error.set(undefined);

    const createRequest = {
      slug: projectData.slug,
      title: projectData.title,
      description: projectData.description || undefined,
    };

    try {
      const project = await firstValueFrom(
        this.projectApi.createProject(createRequest).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const projectError = this.formatError(error);
            return throwError(() => projectError);
          })
        )
      );

      // Update cached projects list with the new project
      const currentProjects = this.projects();
      const updatedProjects = [...currentProjects, project];
      await this.setProjects(updatedProjects);
      return project;
    } catch (err: unknown) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError('SERVER_ERROR', 'Failed to create project');

      // Check if this is a recoverable network error
      if (error.canUseCache || error.code === 'NETWORK_ERROR') {
        // Don't set error - let the caller handle local-first fallback
        throw error;
      }

      this.error.set(error);
      console.error('Project creation error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Create a local-only project placeholder for offline-first creation.
   * This stores the project in the local cache without syncing to server.
   * Call markPendingCreation on ProjectSyncService to queue for sync.
   *
   * @param projectData - The project data to create
   * @param username - The username for the project owner
   * @returns The created local project
   */
  async createLocalProject(
    projectData: { title: string; slug: string; description?: string },
    username: string
  ): Promise<Project> {
    const now = new Date().toISOString();
    const localProject: Project = {
      id: `local-pending-${crypto.randomUUID()}`,
      username,
      slug: projectData.slug,
      title: projectData.title,
      description: projectData.description ?? '',
      createdDate: now,
      updatedDate: now,
    };

    // Add to local cache and projects list
    const currentProjects = this.projects();
    const updatedProjects = [...currentProjects, localProject];
    await this.setProjects(updatedProjects);

    // Also cache individually
    const cacheKey = `${username}/${projectData.slug}`;
    await this.setCachedProject(cacheKey, localProject);

    console.info(
      `Created local project placeholder: ${cacheKey} (will sync when online)`
    );

    return localProject;
  }

  /**
   * Update a local project after successful server sync.
   * Replaces the local placeholder with the server-provided project data.
   */
  async updateLocalProjectWithServerData(
    username: string,
    slug: string,
    serverProject: Project
  ): Promise<void> {
    const cacheKey = `${username}/${slug}`;

    // Update cache
    await this.setCachedProject(cacheKey, serverProject);

    // Update projects list
    const currentProjects = this.projects();
    const updatedProjects = currentProjects.map(p =>
      p.slug === slug && p.username === username ? serverProject : p
    );
    await this.setProjects(updatedProjects);
  }

  async updateProject(
    username: string,
    slug: string,
    Project: Project
  ): Promise<Project> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const updateRequest = {
        title: Project.title,
        description: Project.description || undefined,
      };
      try {
        const project = await firstValueFrom(
          this.projectApi.updateProject(username, slug, updateRequest).pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              const projectError = this.formatError(error);
              return throwError(() => projectError);
            })
          )
        );

        // Update the project in cache
        await this.setCachedProject(`${username}/${slug}`, project);

        // Update the project in the projects list if it exists
        const currentProjects = this.projects();
        const updatedProjects = currentProjects.map(p =>
          p.slug === slug && p.username === username ? project : p
        );
        await this.setProjects(updatedProjects);

        // Clear any pending metadata for this project on success
        await this.projectSync.clearPendingMetadata(`${username}/${slug}`);
        return project;
      } catch (e) {
        const formatted =
          e instanceof ProjectServiceError ? e : this.formatError(e);

        // For recoverable network/server errors, update cache locally and queue metadata sync
        if (formatted.canUseCache) {
          const cacheKey = `${username}/${slug}`;
          const existing = await this.getCachedProject(cacheKey);
          const updated: Project = {
            ...(existing ??
              ({
                id: '',
                username,
                slug,
                createdDate: '',
                updatedDate: '',
              } as Project)),
            title: updateRequest.title ?? existing?.title ?? '',
            description:
              updateRequest.description ?? existing?.description ?? undefined,
          };

          await this.setCachedProject(cacheKey, updated);

          const currentProjects = this.projects();
          const updatedProjects = currentProjects.map(p =>
            p.slug === slug && p.username === username ? updated : p
          );
          await this.setProjects(updatedProjects);

          await this.projectSync.markPendingMetadata(cacheKey, {
            title: updateRequest.title,
            description: updateRequest.description,
          });

          // Do not set error to allow UI to proceed with local changes
          return updated;
        }

        // Non-recoverable errors should propagate
        this.error.set(formatted);
        console.error('Project update error:', formatted);
        throw formatted;
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      await firstValueFrom(
        this.projectApi.deleteProject(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const projectError = this.formatError(error);
            this.error.set(projectError);
            return throwError(() => projectError);
          })
        )
      );

      // Remove the project from cache
      if (this.storage.isAvailable()) {
        try {
          const db = await this.db;
          await this.storage.delete(db, 'projects', `${username}/${slug}`);
        } catch (error) {
          console.warn('Failed to remove cached project:', error);
        }
      }

      // Remove the project from the projects list
      const currentProjects = this.projects();
      const updatedProjects = currentProjects.filter(
        p => !(p.slug === slug && p.username === username)
      );
      await this.setProjects(updatedProjects);
    } catch (err: unknown) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError('SERVER_ERROR', 'Failed to delete project');
      this.error.set(error);
      console.error('Project deletion error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async getProjectCover(username: string, slug: string): Promise<Blob> {
    this.error.set(undefined);

    const projectKey = `${username}/${slug}`;

    // Offline-first: if we have a cached cover, return it immediately
    const cachedCover = await this.localStorage.getProjectCover(username, slug);
    if (cachedCover) {
      // If in server mode, try a background refresh to update cache
      if (this.setupService.getMode() !== 'local') {
        void (async () => {
          try {
            const freshBlob = await firstValueFrom(
              this.imagesApi
                .getProjectCover(username, slug)
                .pipe(retry(MAX_RETRIES))
            );
            await this.localStorage.saveProjectCover(username, slug, freshBlob);
          } catch {
            // Ignore refresh errors silently
          }
        })();
      }
      return cachedCover;
    }

    // If fully offline mode, and no cached cover, surface not found
    if (this.setupService.getMode() === 'local') {
      throw new ProjectServiceError(
        'PROJECT_NOT_FOUND',
        'Cover image not found'
      );
    }

    try {
      const blob = await firstValueFrom(
        this.imagesApi.getProjectCover(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const projectError = this.formatError(error);
            // Don't set error here if it's a 404, let the outer catch handle it
            if (projectError.code !== 'PROJECT_NOT_FOUND') {
              this.error.set(projectError);
            }
            return throwError(() => projectError); // Always rethrow formatted error
          })
        )
      );

      // Cache the cover for offline access
      try {
        await this.localStorage.saveProjectCover(username, slug, blob);
      } catch (cacheError) {
        console.warn('Failed to cache project cover:', cacheError);
      }

      return blob;
    } catch (err: unknown) {
      // For cover images, a 404 is expected when no cover image exists yet
      // So we should handle it specially
      if (
        err instanceof ProjectServiceError &&
        err.code === 'PROJECT_NOT_FOUND'
      ) {
        // Create a more specific error
        const coverError = new ProjectServiceError(
          'PROJECT_NOT_FOUND',
          'Cover image not found'
        );
        this.error.set(coverError);
        console.warn('Project cover image not found:', coverError);
        throw coverError;
      } else {
        // If server error but we have cached cover, return cache
        const offlineBlob = await this.localStorage.getProjectCover(
          username,
          slug
        );
        if (offlineBlob) {
          console.warn(
            `Server unavailable, using cached cover for ${projectKey}`
          );
          return offlineBlob;
        }

        const error =
          err instanceof ProjectServiceError
            ? err
            : new ProjectServiceError(
                'SERVER_ERROR',
                'Failed to get project cover image'
              );
        this.error.set(error);
        console.error('Project cover image loading error:', error);
        throw error;
      }
    }
  }

  async deleteProjectCover(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // In offline mode, just delete from IndexedDB cache
      if (this.setupService.getMode() === 'local') {
        await this.localStorage.deleteProjectCover(username, slug);
        return;
      }

      // Assume delete returns void or similar
      await firstValueFrom(
        this.imagesApi.deleteProjectCover(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError(err => throwError(() => this.formatError(err)))
        )
      );

      // Clear the cached cover from IndexedDB
      try {
        await this.localStorage.deleteProjectCover(username, slug);
      } catch (cacheError) {
        console.warn('Failed to clear cached cover image:', cacheError);
      }

      // Update the project in the projects list if it exists to reflect no cover
      const currentProjects = this.projects();
      const projectIndex = currentProjects.findIndex(
        p => p.slug === slug && p.username === username
      );

      if (projectIndex >= 0) {
        await this.loadAllProjects();
      }
    } catch (err: unknown) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError(
              'SERVER_ERROR',
              'Failed to delete project cover image'
            );
      this.error.set(error);
      console.error('Project cover deletion error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async uploadProjectCover(
    username: string,
    slug: string,
    coverImage: Blob
  ): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // In offline mode, save to IndexedDB and mark for sync
      if (this.setupService.getMode() === 'local') {
        await this.localStorage.saveProjectCover(username, slug, coverImage);
        await this.projectSync.markPendingUpload(
          `${username}/${slug}`,
          'cover'
        );
        return;
      }

      const formData = new FormData();
      formData.append('cover', coverImage);

      const url = `${this.imagesApi.configuration.basePath}/api/v1/projects/${username}/${slug}/cover`;
      try {
        await firstValueFrom(
          this.http
            .post(url, formData, {
              withCredentials: true,
            })
            .pipe(
              retry(MAX_RETRIES),
              catchError(err => throwError(() => this.formatError(err)))
            )
        );
      } catch (e) {
        const formatted = this.formatError(e);
        // For recoverable network/server errors, save locally and queue sync
        if (formatted.canUseCache) {
          await this.localStorage.saveProjectCover(username, slug, coverImage);
          await this.projectSync.markPendingUpload(
            `${username}/${slug}`,
            'cover'
          );
          // Do not rethrow to allow UX to proceed with local cache
          return;
        }
        // Non-recoverable errors should propagate
        throw formatted;
      }

      // Cache the cover image to IndexedDB for offline access
      await this.localStorage.saveProjectCover(username, slug, coverImage);

      // Refresh projects to get updated data
      await this.loadAllProjects();
    } catch (err: unknown) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError(
              'SERVER_ERROR',
              'Failed to upload project cover image'
            );
      this.error.set(error);
      console.error('Project cover upload error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearCache(): Promise<void> {
    if (this.storage.isAvailable()) {
      try {
        const db = await this.db;
        await this.storage.delete(db, 'projectsList', PROJECTS_LIST_CACHE_KEY);

        // Clear all projects from the 'projects' store
        // This is a simplification - in a real app you might want to implement a more
        // sophisticated approach to clear all keys from the store
        const currentProjects = this.projects();
        for (const project of currentProjects) {
          if (project.username && project.slug) {
            await this.storage.delete(
              db,
              'projects',
              `${project.username}/${project.slug}`
            );
          }
        }
      } catch (error: unknown) {
        // Keep type annotation
        console.warn('Failed to clear project cache:', error);
      }
    }
    this.projects.set([]);
  }

  private async setProjects(projects: Project[]): Promise<void> {
    if (this.storage.isAvailable()) {
      try {
        const db = await this.db;
        await this.storage.put(
          db,
          'projectsList',
          projects,
          PROJECTS_LIST_CACHE_KEY
        );

        // Also cache individual projects for faster access
        for (const project of projects) {
          if (project.username && project.slug) {
            await this.setCachedProject(
              `${project.username}/${project.slug}`,
              project
            );
          }
        }
      } catch (error) {
        console.warn('Failed to cache projects:', error);
      }
    }
    this.projects.set(projects);
  }

  private async setCachedProject(key: string, project: Project): Promise<void> {
    if (!this.storage.isAvailable()) return;

    try {
      const db = await this.db;
      await this.storage.put(db, 'projects', project, key);
    } catch (error) {
      console.warn(`Failed to cache project ${key}:`, error);
    }
  }

  private async getCachedProjects(): Promise<Project[] | undefined> {
    try {
      const db = await this.db;
      return await this.storage.get<Project[]>(
        db,
        'projectsList',
        PROJECTS_LIST_CACHE_KEY
      );
    } catch (error) {
      console.warn('Failed to get cached projects:', error);
      return undefined;
    }
  }

  private async getCachedProject(key: string): Promise<Project | undefined> {
    try {
      const db = await this.db;
      return await this.storage.get<Project>(db, 'projects', key);
    } catch (error) {
      console.warn(`Failed to get cached project ${key}:`, error);
      return undefined;
    }
  }

  private formatError(error: unknown): ProjectServiceError {
    if (error instanceof HttpErrorResponse) {
      const canUseCache = isRecoverableWithCache(error);

      // Check for project rename redirect (301 with redirect body)
      if (error.status === 301 && isProjectRenameRedirect(error.error)) {
        return new ProjectRenamedError(
          error.error.oldSlug,
          error.error.newSlug,
          error.error.username,
          error.error.renamedAt
        );
      }

      if (error.status === 0) {
        return new ProjectServiceError(
          'NETWORK_ERROR',
          'Server unavailable',
          canUseCache
        );
      }
      if (error.status === 401) {
        return new ProjectServiceError(
          'SESSION_EXPIRED',
          'Session expired',
          false
        );
      }
      if (error.status === 404) {
        return new ProjectServiceError(
          'PROJECT_NOT_FOUND',
          'Project not found',
          false
        );
      }
      // 502, 503, 504 - server errors that can use cache
      if (
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504
      ) {
        return new ProjectServiceError(
          'SERVER_ERROR',
          'Server temporarily unavailable',
          canUseCache
        );
      }
    }
    return new ProjectServiceError(
      'SERVER_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      false
    );
  }
}
