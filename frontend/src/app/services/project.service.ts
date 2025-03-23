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
  readonly projects = signal<ProjectDto[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<ProjectServiceError | undefined>(undefined);
  readonly hasProjects = computed(() => this.projects().length > 0);
  readonly initialized = signal(false);

  private readonly projectApi = inject(ProjectAPIService);
  private readonly storage = inject(StorageService);
  private readonly xsrfService = inject(XsrfService);
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
      // Try cached projects first if storage is available
      if (this.storage.isAvailable()) {
        const cachedProjects = await this.getCachedProjects();
        if (cachedProjects && cachedProjects.length > 0) {
          this.projects.set(cachedProjects);
          return;
        }
      }

      // Fallback to API with retry mechanism
      const projects = await firstValueFrom(
        this.projectApi.projectControllerGetAllProjects().pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
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

    try {
      // Try to find project in cached projects first
      if (this.storage.isAvailable()) {
        const cacheKey = `${username}/${slug}`;
        const cachedProject = await this.getCachedProject(cacheKey);
        if (cachedProject) {
          return cachedProject;
        }
      }

      // Fallback to API with retry mechanism
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
        await this.setCachedProject(`${username}/${slug}`, project);
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
