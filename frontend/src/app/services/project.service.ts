import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, retry, throwError } from 'rxjs';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import { ProjectDto } from '../../api-client/model/project-dto';
import { StorageService } from './storage.service';
import { XsrfService } from './xsrf.service';

export class ProjectServiceError extends Error {
  constructor(
    public code:
      | 'NETWORK_ERROR'
      | 'SESSION_EXPIRED'
      | 'SERVER_ERROR'
      | 'PROJECT_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'ProjectServiceError';
  }
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
  private readonly projectApi = inject(ProjectAPIService);
  private readonly storage = inject(StorageService);
  private readonly xsrfService = inject(XsrfService);

  readonly projects = signal<ProjectDto[]>([]);
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
      let cachedProjects: ProjectDto[] | undefined;

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
          this.projectApi.projectControllerGetAllProjects().pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              // If we have cached data, log the error but don't propagate it
              if (cachedProjects && cachedProjects.length > 0) {
                console.warn(
                  'Failed to refresh projects, using cached data:',
                  error
                );
                return throwError(() => error);
              }

              // Otherwise, handle error normally
              const projectError = this.formatError(error);
              this.error.set(projectError);
              return throwError(() => projectError);
            })
          )
        );

        if (projects) {
          await this.setProjects(projects);
        }
      } catch (err) {
        // If we have cached data, we can survive API errors
        if (!cachedProjects || cachedProjects.length === 0) {
          throw err; // Re-throw if we don't have cache data
        }
        // Otherwise just log the error
        console.warn('Using cached projects due to API error:', err);
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
  ): Promise<ProjectDto> {
    this.isLoading.set(true);
    this.error.set(undefined);

    const cacheKey = `${username}/${slug}`;
    let cachedProject: ProjectDto | undefined;

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
        this.projectApi
          .projectControllerGetProjectByUsernameAndSlug(username, slug)
          .pipe(
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
    } catch (err) {
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
        this.projectApi
          .projectControllerGetProjectByUsernameAndSlug(username, slug)
          .pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              console.warn(
                `Background refresh failed for project ${cacheKey}:`,
                error
              );
              return throwError(() => error);
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
          this.projects.set(updatedProjects);
        }
      }
    } catch (error) {
      // Just log errors for background operations
      console.warn(`Background refresh failed for project ${cacheKey}:`, error);
    }
  }

  async createProject(projectDto: ProjectDto): Promise<ProjectDto> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const project = await firstValueFrom(
        this.projectApi
          .projectControllerCreateProject(
            this.xsrfService.getXsrfToken(),
            projectDto
          )
          .pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              const projectError = this.formatError(error);
              this.error.set(projectError);
              return throwError(() => projectError);
            })
          )
      );

      // Update cached projects list with the new project
      const currentProjects = this.projects();
      const updatedProjects = [...currentProjects, project];
      await this.setProjects(updatedProjects);

      return project;
    } catch (err) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError('SERVER_ERROR', 'Failed to create project');
      this.error.set(error);
      console.error('Project creation error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateProject(
    username: string,
    slug: string,
    projectDto: ProjectDto
  ): Promise<ProjectDto> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const project = await firstValueFrom(
        this.projectApi
          .projectControllerUpdateProject(
            username,
            slug,
            this.xsrfService.getXsrfToken(),
            projectDto
          )
          .pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              const projectError = this.formatError(error);
              this.error.set(projectError);
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

      return project;
    } catch (err) {
      const error =
        err instanceof ProjectServiceError
          ? err
          : new ProjectServiceError('SERVER_ERROR', 'Failed to update project');
      this.error.set(error);
      console.error('Project update error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      await firstValueFrom(
        this.projectApi
          .projectControllerDeleteProject(
            username,
            slug,
            this.xsrfService.getXsrfToken()
          )
          .pipe(
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
    } catch (err) {
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

    try {
      return await firstValueFrom(
        this.projectApi.projectControllerGetProjectCover(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const projectError = this.formatError(error);
            this.error.set(projectError);
            return throwError(() => projectError);
          })
        )
      );
    } catch (err) {
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
      await firstValueFrom(
        this.projectApi.projectControllerDeleteCover(username, slug).pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const projectError = this.formatError(error);
            this.error.set(projectError);
            return throwError(() => projectError);
          })
        )
      );

      // Update the project in the projects list if it exists to reflect no cover
      const currentProjects = this.projects();
      const projectIndex = currentProjects.findIndex(
        p => p.slug === slug && p.username === username
      );

      if (projectIndex >= 0) {
        // We don't need to modify anything specific for the cover image
        // as the API response doesn't include that information
        // Just refresh the project data
        await this.loadAllProjects();
      }
    } catch (err) {
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
      await firstValueFrom(
        this.projectApi
          .projectControllerUploadCover(username, slug, coverImage)
          .pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              const projectError = this.formatError(error);
              this.error.set(projectError);
              return throwError(() => projectError);
            })
          )
      );

      // Refresh projects to get updated data
      await this.loadAllProjects();
    } catch (err) {
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
      } catch (error) {
        console.warn('Failed to clear project cache:', error);
      }
    }
    this.projects.set([]);
  }

  private async setProjects(projects: ProjectDto[]): Promise<void> {
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

  private async setCachedProject(
    key: string,
    project: ProjectDto
  ): Promise<void> {
    if (!this.storage.isAvailable()) return;

    try {
      const db = await this.db;
      await this.storage.put(db, 'projects', project, key);
    } catch (error) {
      console.warn(`Failed to cache project ${key}:`, error);
    }
  }

  private async getCachedProjects(): Promise<ProjectDto[] | undefined> {
    try {
      const db = await this.db;
      return await this.storage.get<ProjectDto[]>(
        db,
        'projectsList',
        PROJECTS_LIST_CACHE_KEY
      );
    } catch (error) {
      console.warn('Failed to get cached projects:', error);
      return undefined;
    }
  }

  private async getCachedProject(key: string): Promise<ProjectDto | undefined> {
    try {
      const db = await this.db;
      return await this.storage.get<ProjectDto>(db, 'projects', key);
    } catch (error) {
      console.warn(`Failed to get cached project ${key}:`, error);
      return undefined;
    }
  }

  private formatError(error: unknown): ProjectServiceError {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new ProjectServiceError('NETWORK_ERROR', 'Server unavailable');
      }
      if (error.status === 401) {
        return new ProjectServiceError('SESSION_EXPIRED', 'Session expired');
      }
      if (error.status === 404) {
        return new ProjectServiceError(
          'PROJECT_NOT_FOUND',
          'Project not found'
        );
      }
    }
    return new ProjectServiceError(
      'SERVER_ERROR',
      'Failed to load project data'
    );
  }
}
