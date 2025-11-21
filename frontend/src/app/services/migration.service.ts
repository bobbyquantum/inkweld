import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthenticationService } from '../../api-client/api/authentication.service';
import { ProjectsService } from '../../api-client/api/projects.service';
import { Project } from '../../api-client/model/project';
import { LoggerService } from './logger.service';
import { OfflineProjectService } from './offline-project.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { SetupService } from './setup.service';
import { UserService } from './user.service';

/**
 * Status of a migration operation
 */
export enum MigrationStatus {
  NotStarted = 'NotStarted',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Failed = 'Failed',
}

/**
 * Status of individual project migration
 */
export interface ProjectMigrationStatus {
  projectSlug: string;
  projectTitle: string;
  status: MigrationStatus;
  error?: string;
}

/**
 * Overall migration state
 */
export interface MigrationState {
  status: MigrationStatus;
  totalProjects: number;
  completedProjects: number;
  failedProjects: number;
  currentProject?: string;
  projectStatuses: ProjectMigrationStatus[];
  error?: string;
}

/**
 * Service to handle migration of offline data to a server
 *
 * Migration process:
 * 1. Project metadata - Sent to server via API
 * 2. Elements - Automatically synced via Yjs when WebSocket connects
 *    (Both offline and online modes use Yjs + IndexedDB, so sync is seamless)
 * 3. Documents - Automatically synced via Yjs when WebSocket connects
 *    (Both offline and online modes use Yjs + IndexedDB, so sync is seamless)
 *
 * The Yjs CRDT architecture ensures that offline data in IndexedDB automatically
 * syncs to the server's LevelDB when a WebSocket connection is established.
 * No explicit migration code is needed for elements or documents.
 */
@Injectable({
  providedIn: 'root',
})
export class MigrationService {
  private setupService = inject(SetupService);
  private offlineProjectService = inject(OfflineProjectService);
  private offlineElementsService = inject(OfflineProjectElementsService);
  private projectsService = inject(ProjectsService);
  private authenticationService = inject(AuthenticationService);
  private userService = inject(UserService);
  private logger = inject(LoggerService);

  readonly migrationState = signal<MigrationState>({
    status: MigrationStatus.NotStarted,
    totalProjects: 0,
    completedProjects: 0,
    failedProjects: 0,
    projectStatuses: [],
  });

  /**
   * Check if there are offline projects that need migration
   */
  hasOfflineProjects(): boolean {
    return this.offlineProjectService.projects().length > 0;
  }

  /**
   * Get count of offline projects
   */
  getOfflineProjectsCount(): number {
    return this.offlineProjectService.projects().length;
  }

  /**
   * Migrate all offline projects to the server
   *
   * @param serverUrl - The server URL to migrate to
   * @returns Promise that resolves when migration is complete
   */
  async migrateToServer(serverUrl: string): Promise<void> {
    const offlineProjects = this.offlineProjectService.projects();

    if (offlineProjects.length === 0) {
      this.logger.info('MigrationService', 'No offline projects to migrate');
      return;
    }

    this.logger.info(
      'MigrationService',
      `Starting migration of ${offlineProjects.length} projects to ${serverUrl}`
    );

    // Initialize migration state
    const projectStatuses: ProjectMigrationStatus[] = offlineProjects.map(
      project => ({
        projectSlug: project.slug,
        projectTitle: project.title,
        status: MigrationStatus.NotStarted,
      })
    );

    this.migrationState.set({
      status: MigrationStatus.InProgress,
      totalProjects: offlineProjects.length,
      completedProjects: 0,
      failedProjects: 0,
      projectStatuses,
    });

    // Migrate each project
    for (const project of offlineProjects) {
      await this.migrateProject(project);
    }

    // Update final state
    const finalState = this.migrationState();
    const allCompleted =
      finalState.completedProjects === finalState.totalProjects;
    const someFailed = finalState.failedProjects > 0;

    this.migrationState.update(state => ({
      ...state,
      status: allCompleted
        ? MigrationStatus.Completed
        : someFailed
          ? MigrationStatus.Failed
          : MigrationStatus.InProgress,
    }));

    this.logger.info(
      'MigrationService',
      `Migration completed: ${finalState.completedProjects}/${finalState.totalProjects} successful, ${finalState.failedProjects} failed`
    );
  }

  /**
   * Migrate a single project to the server
   */
  private async migrateProject(project: Project): Promise<void> {
    this.logger.debug(
      'MigrationService',
      `Migrating project: ${project.username}/${project.slug}`
    );

    // Update status to in progress
    this.updateProjectStatus(project.slug, MigrationStatus.InProgress);
    this.migrationState.update(state => ({
      ...state,
      currentProject: `${project.username}/${project.slug}`,
    }));

    try {
      // Step 1: Create project metadata on server
      await this.createProjectOnServer(project);

      // Step 2: Elements sync automatically via Yjs WebSocket
      // The offline elements are already stored in IndexedDB using Yjs.
      // When DocumentService connects to the server, the Yjs provider will
      // automatically sync the IndexedDB state to the server's LevelDB.
      // Document ID: username:slug:elements

      // Step 3: Documents sync automatically via Yjs WebSocket
      // All documents are stored in IndexedDB using Yjs (both online and offline).
      // When DocumentService opens each document, the Yjs provider will
      // automatically sync the IndexedDB state to the server's LevelDB.
      // Document ID format: username:slug:docId

      // Note: We don't explicitly trigger element/document sync here.
      // The sync happens automatically when the user opens the project in the editor
      // and DocumentService establishes WebSocket connections.

      // Mark as completed
      this.updateProjectStatus(project.slug, MigrationStatus.Completed);
      this.migrationState.update(state => ({
        ...state,
        completedProjects: state.completedProjects + 1,
      }));

      this.logger.info(
        'MigrationService',
        `Successfully migrated project: ${project.slug}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        'MigrationService',
        `Failed to migrate project ${project.slug}`,
        errorMessage
      );

      this.updateProjectStatus(
        project.slug,
        MigrationStatus.Failed,
        errorMessage
      );

      this.migrationState.update(state => ({
        ...state,
        failedProjects: state.failedProjects + 1,
      }));
    }
  }

  /**
   * Create a project on the server
   */
  private async createProjectOnServer(project: Project): Promise<void> {
    try {
      // Create project via API
      await firstValueFrom(
        this.projectsService.createProject({
          title: project.title,
          slug: project.slug,
          description: project.description || undefined,
        })
      );

      this.logger.debug(
        'MigrationService',
        `Created project on server: ${project.slug}`
      );
    } catch (error) {
      // Handle duplicate slug error (409 Conflict)
      if (error && typeof error === 'object' && 'status' in error) {
        const httpError = error as { status: number; message?: string };
        if (httpError.status === 409) {
          this.logger.warn(
            'MigrationService',
            `Project ${project.slug} already exists on server, skipping creation`
          );
          return;
        }
      }

      throw error;
    }
  }

  /**
   * Update the status of a specific project in the migration state
   */
  private updateProjectStatus(
    projectSlug: string,
    status: MigrationStatus,
    error?: string
  ): void {
    this.migrationState.update(state => ({
      ...state,
      projectStatuses: state.projectStatuses.map(ps =>
        ps.projectSlug === projectSlug ? { ...ps, status, error } : ps
      ),
    }));
  }

  /**
   * Reset migration state
   */
  resetMigrationState(): void {
    this.migrationState.set({
      status: MigrationStatus.NotStarted,
      totalProjects: 0,
      completedProjects: 0,
      failedProjects: 0,
      projectStatuses: [],
    });
  }

  /**
   * Register a new user on the server
   * @param username - Username for new account
   * @param password - Password for new account
   * @returns Promise that resolves when registration is complete
   */
  async registerOnServer(username: string, password: string): Promise<void> {
    this.logger.info('MigrationService', `Registering user: ${username}`);

    try {
      const response = await firstValueFrom(
        this.authenticationService.registerUser({
          username,
          password,
        })
      );

      // Store authentication token for subsequent API requests
      if (response.token) {
        localStorage.setItem('auth_token', response.token);
        this.logger.info('MigrationService', 'Authentication token stored');
      } else {
        throw new Error('Registration succeeded but no token was returned');
      }

      // Set the current user so the app knows we're logged in
      if (response.user) {
        await this.userService.setCurrentUser(response.user);
        this.logger.info(
          'MigrationService',
          'Current user set after registration'
        );
      }

      // Check if approval is required
      if (response.requiresApproval) {
        throw new Error(
          'This server requires admin approval. Migration cannot proceed.'
        );
      }

      this.logger.info(
        'MigrationService',
        `Successfully registered user: ${username}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'MigrationService',
        `Failed to register user ${username}`,
        errorMessage
      );
      throw error;
    }
  }

  /**
   * Log in to the server
   * @param username - Username
   * @param password - Password
   * @returns Promise that resolves when login is complete
   */
  async loginToServer(username: string, password: string): Promise<void> {
    this.logger.info('MigrationService', `Logging in user: ${username}`);

    try {
      const response = await firstValueFrom(
        this.authenticationService.login({
          username,
          password,
        })
      );

      // Store authentication token for subsequent API requests
      if (response.token) {
        localStorage.setItem('auth_token', response.token);
        this.logger.info('MigrationService', 'Authentication token stored');
      } else {
        throw new Error('Login succeeded but no token was returned');
      }

      // Set the current user so the app knows we're logged in
      if (response.user) {
        await this.userService.setCurrentUser(response.user);
        this.logger.info('MigrationService', 'Current user set after login');
      }

      this.logger.info(
        'MigrationService',
        `Successfully logged in user: ${username}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'MigrationService',
        `Failed to login user ${username}`,
        errorMessage
      );
      throw error;
    }
  }

  /**
   * Clean up offline data after successful migration
   * WARNING: This will delete all offline projects, elements, and user data
   */
  cleanupOfflineData(): void {
    this.logger.warn(
      'MigrationService',
      'Cleaning up offline data (projects, elements, user)'
    );

    // Debug: Check localStorage before cleanup
    console.log(
      '[Migration] Before cleanup - app-config:',
      localStorage.getItem('inkweld-app-config')
    );
    console.log(
      '[Migration] Before cleanup - auth_token:',
      localStorage.getItem('auth_token') ? 'EXISTS' : 'MISSING'
    );
    console.log(
      '[Migration] Before cleanup - offline-user:',
      localStorage.getItem('inkweld-offline-user')
    );

    // Clear offline projects
    const projects = this.offlineProjectService.projects();
    for (const project of projects) {
      this.offlineProjectService.deleteProject(project.username, project.slug);
    }

    // Clear elements storage (will clear all project elements)
    localStorage.removeItem('inkweld-offline-elements');

    // Clear offline user (no longer needed in server mode)
    localStorage.removeItem('inkweld-offline-user');

    // Debug: Check localStorage after cleanup
    console.log(
      '[Migration] After cleanup - app-config:',
      localStorage.getItem('inkweld-app-config')
    );
    console.log(
      '[Migration] After cleanup - auth_token:',
      localStorage.getItem('auth_token') ? 'EXISTS' : 'MISSING'
    );
    console.log(
      '[Migration] After cleanup - offline-user:',
      localStorage.getItem('inkweld-offline-user')
    );

    // Note: We don't clear IndexedDB documents automatically because:
    // 1. Documents might still be useful for offline editing
    // 2. DocumentService manages IndexedDB lifecycle
    // 3. IndexedDB will sync to server when user opens documents

    this.logger.info('MigrationService', 'Offline data cleanup completed');
  }
}
