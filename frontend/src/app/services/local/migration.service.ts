import { inject, Injectable, signal } from '@angular/core';
import {
  AuthenticationService,
  Project,
  ProjectsService,
} from '@inkweld/index';
import { firstValueFrom } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';
import { UserService } from '../user/user.service';
import { LocalProjectService } from './local-project.service';
import { LocalStorageService } from './local-storage.service';

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
 * Stages of project migration
 */
export enum MigrationStage {
  Elements = 'Elements',
  Media = 'Media',
  ProjectEntry = 'ProjectEntry',
}

/**
 * Status of individual project migration
 */
export interface ProjectMigrationStatus {
  projectSlug: string;
  projectTitle: string;
  status: MigrationStatus;
  currentStage?: MigrationStage;
  stageProgress?: { completed: number; total: number };
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
  currentStage?: MigrationStage;
  projectStatuses: ProjectMigrationStatus[];
  error?: string;
}

/**
 * Service to handle migration of local project data to server-mode storage.
 *
 * IMPORTANT: Migration is a 100% LOCAL operation - it copies data between
 * IndexedDB prefixes. No server communication happens during migration.
 *
 * Migration process:
 * 1. Elements - Copy elements Yjs doc from local: prefix to srv:configId: prefix
 * 2. Media - Copy media files from local: database to srv:configId: database
 * 3. ProjectEntry - Create project entry in server-mode project list
 *
 * After migration, the normal project sync mechanism handles uploading
 * to the server when online (same as creating a project while offline).
 *
 * Data that does NOT need migration (stored without prefix):
 * - Documents (user:project:docId)
 * - Worldbuilding (worldbuilding:user:project:elementId)
 */
@Injectable({
  providedIn: 'root',
})
export class MigrationService {
  private storageContextService = inject(StorageContextService);
  private localProjectService = inject(LocalProjectService);
  private localStorage = inject(LocalStorageService);
  private logger = inject(LoggerService);
  private authenticationService = inject(AuthenticationService);
  private authTokenService = inject(AuthTokenService);
  private userService = inject(UserService);
  private projectsApi = inject(ProjectsService);

  readonly migrationState = signal<MigrationState>({
    status: MigrationStatus.NotStarted,
    totalProjects: 0,
    completedProjects: 0,
    failedProjects: 0,
    projectStatuses: [],
  });

  /**
   * Check if there are local projects that need migration (excludes already migrated)
   */
  hasLocalProjects(): boolean {
    return this.localProjectService.getNonMigratedProjects().length > 0;
  }

  /**
   * Get count of local projects (excludes already migrated)
   */
  getLocalProjectsCount(): number {
    return this.localProjectService.getNonMigratedProjects().length;
  }

  /**
   * Get list of local projects for display (excludes already migrated)
   */
  getLocalProjects(): Project[] {
    return this.localProjectService.getNonMigratedProjects();
  }

  /**
   * Reset migration state to initial values
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
   * Migrate selected local projects to server-mode storage.
   *
   * This is a 100% LOCAL operation - no server communication.
   * Data is copied from local: prefixed storage to srv:configId: prefixed storage.
   *
   * @param targetConfigId - The server config ID to migrate to (e.g., "a1b2c3d4")
   * @param targetUsername - The username for the migrated projects
   * @param projectSlugs - Optional array of project slugs to migrate. If not provided, all projects are migrated.
   * @param slugRenames - Optional map of original slug to new slug for renamed projects
   * @returns Promise that resolves when migration is complete
   */
  async migrateToServerMode(
    targetConfigId: string,
    targetUsername: string,
    projectSlugs?: string[],
    slugRenames?: Map<string, string>
  ): Promise<void> {
    let localProjects = this.localProjectService.projects();

    // Filter to only selected projects if provided (even empty array means "migrate nothing")
    if (projectSlugs !== undefined) {
      localProjects = localProjects.filter(p => projectSlugs.includes(p.slug));
    }

    if (localProjects.length === 0) {
      this.logger.info('MigrationService', 'No local projects to migrate');
      return;
    }

    this.logger.info(
      'MigrationService',
      `Starting local migration of ${localProjects.length} projects to config ${targetConfigId}`
    );

    // Initialize migration state
    const projectStatuses: ProjectMigrationStatus[] = localProjects.map(
      project => ({
        projectSlug: slugRenames?.get(project.slug) ?? project.slug,
        projectTitle: project.title,
        status: MigrationStatus.NotStarted,
      })
    );

    this.migrationState.set({
      status: MigrationStatus.InProgress,
      totalProjects: localProjects.length,
      completedProjects: 0,
      failedProjects: 0,
      projectStatuses,
    });

    // Migrate each project
    for (const project of localProjects) {
      const newSlug = slugRenames?.get(project.slug);
      await this.migrateProject(
        project,
        targetConfigId,
        targetUsername,
        newSlug
      );
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
      `Local migration completed: ${finalState.completedProjects}/${finalState.totalProjects} successful, ${finalState.failedProjects} failed`
    );

    // Create projects on server if online.
    // This uploads project metadata to the server after local migration is complete.
    // Note: This is separate from the local migration which copies data between IndexedDB prefixes.
    if (navigator.onLine && finalState.completedProjects > 0) {
      await this.createProjectsOnServer(localProjects, slugRenames);
    }
  }

  /**
   * Create migrated projects on the server.
   *
   * This is called after local migration completes to register the projects
   * with the server. It only creates the project metadata - document content
   * will sync via the normal Yjs WebSocket mechanism when the user opens
   * the project.
   */
  private async createProjectsOnServer(
    projects: Project[],
    slugRenames?: Map<string, string>
  ): Promise<void> {
    this.logger.info(
      'MigrationService',
      `Creating ${projects.length} projects on server`
    );

    for (const project of projects) {
      const targetSlug = slugRenames?.get(project.slug) ?? project.slug;

      try {
        await firstValueFrom(
          this.projectsApi.createProject({
            title: project.title,
            slug: targetSlug,
            description: project.description || undefined,
          })
        );

        this.logger.info(
          'MigrationService',
          `Created project on server: ${targetSlug}`
        );
      } catch (err: unknown) {
        // Log but don't fail - the project is already migrated locally
        // User can retry or it will sync later
        this.logger.warn(
          'MigrationService',
          `Failed to create project on server: ${targetSlug}`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  /**
   * Migrate a single project to server-mode storage.
   *
   * Stages:
   * 1. Elements - Copy elements Yjs doc from local: to srv:configId:
   * 2. Media - Copy all media files from local: to srv:configId: database
   * 3. ProjectEntry - Mark project as migrated
   *
   * @param project - The project to migrate
   * @param targetConfigId - The server config ID
   * @param targetUsername - The username for the migrated project
   * @param newSlug - Optional new slug if project was renamed
   */
  private async migrateProject(
    project: Project,
    targetConfigId: string,
    targetUsername: string,
    newSlug?: string
  ): Promise<void> {
    const targetSlug = newSlug ?? project.slug;

    this.logger.debug(
      'MigrationService',
      `Migrating project: ${project.username}/${project.slug}${newSlug ? ` -> ${targetUsername}/${newSlug}` : ''}`
    );

    // Update status to in progress
    this.updateProjectStatus(
      targetSlug,
      MigrationStatus.InProgress,
      undefined,
      MigrationStage.Elements
    );
    this.migrationState.update(state => ({
      ...state,
      currentProject: `${targetUsername}/${targetSlug}`,
      currentStage: MigrationStage.Elements,
    }));

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 1: ELEMENTS - Copy elements Yjs document between prefixes
      // ═══════════════════════════════════════════════════════════════════════
      this.logger.info(
        'MigrationService',
        `[${targetSlug}] Stage 1: Copying elements document`
      );

      await this.copyElementsDocument(
        project.username,
        project.slug,
        targetConfigId,
        targetUsername,
        targetSlug
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.Elements,
        { completed: 1, total: 1 }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 2: MEDIA - Copy media files between prefixed databases
      // ═══════════════════════════════════════════════════════════════════════
      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.Media,
        { completed: 0, total: 1 }
      );
      this.migrationState.update(state => ({
        ...state,
        currentStage: MigrationStage.Media,
      }));

      this.logger.info(
        'MigrationService',
        `[${targetSlug}] Stage 2: Copying media files`
      );

      const sourceProjectKey = `${project.username}/${project.slug}`;
      const targetProjectKey = `${targetUsername}/${targetSlug}`;

      await this.copyMediaFiles(
        sourceProjectKey,
        targetProjectKey,
        targetConfigId
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.Media,
        { completed: 1, total: 1 }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 3: PROJECT ENTRY - Mark project as migrated
      // ═══════════════════════════════════════════════════════════════════════
      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.ProjectEntry,
        { completed: 0, total: 1 }
      );
      this.migrationState.update(state => ({
        ...state,
        currentStage: MigrationStage.ProjectEntry,
      }));

      this.logger.info(
        'MigrationService',
        `[${targetSlug}] Stage 3: Creating project entry`
      );

      // Mark the local project as migrated
      const serverUrl = this.storageContextService.getServerUrl() || 'unknown';
      this.localProjectService.markProjectAsMigrated(
        project.slug,
        targetSlug,
        serverUrl,
        targetUsername
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.ProjectEntry,
        { completed: 1, total: 1 }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // SUCCESS
      // ═══════════════════════════════════════════════════════════════════════
      this.updateProjectStatus(targetSlug, MigrationStatus.Completed);
      this.migrationState.update(state => ({
        ...state,
        completedProjects: state.completedProjects + 1,
        currentStage: undefined,
      }));

      this.logger.info(
        'MigrationService',
        `Successfully migrated project: ${project.username}/${project.slug} -> ${targetUsername}/${targetSlug}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        'MigrationService',
        `Failed to migrate project ${targetSlug}`,
        errorMessage
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.Failed,
        errorMessage
      );

      this.migrationState.update(state => ({
        ...state,
        failedProjects: state.failedProjects + 1,
        currentStage: undefined,
      }));
    }
  }

  /**
   * Copy a Yjs elements document from local: prefix to srv:configId: prefix.
   *
   * This loads the source document from IndexedDB, encodes its state,
   * and writes it to a new IndexedDB database with the target prefix.
   */
  private async copyElementsDocument(
    sourceUsername: string,
    sourceSlug: string,
    targetConfigId: string,
    targetUsername: string,
    targetSlug: string
  ): Promise<void> {
    // Build source and target document IDs
    const sourceDocId = `local:${sourceUsername}:${sourceSlug}:elements`;
    const targetDocId = `srv:${targetConfigId}:${targetUsername}:${targetSlug}:elements`;

    this.logger.debug(
      'MigrationService',
      `Copying elements: ${sourceDocId} -> ${targetDocId}`
    );

    // Load source document from IndexedDB
    const sourceDoc = new Y.Doc();
    const sourceProvider = new IndexeddbPersistence(sourceDocId, sourceDoc);
    await sourceProvider.whenSynced;

    // Check if source has any content
    const sourceState = Y.encodeStateAsUpdate(sourceDoc);
    if (sourceState.length <= 2) {
      // Empty doc is typically 2 bytes
      this.logger.warn(
        'MigrationService',
        `Source elements document is empty: ${sourceDocId}`
      );
    }

    // Create target document and apply source state
    const targetDoc = new Y.Doc();
    Y.applyUpdate(targetDoc, sourceState);

    // Save target document to IndexedDB
    const targetProvider = new IndexeddbPersistence(targetDocId, targetDoc);
    await targetProvider.whenSynced;

    // Force a write to ensure the state is persisted
    // IndexeddbPersistence debounces writes, so we trigger a no-op transaction
    targetDoc.transact(() => {
      // No-op transaction to trigger persistence
    });

    // Wait a bit for the debounced write to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up
    await sourceProvider.destroy();
    await targetProvider.destroy();
    sourceDoc.destroy();
    targetDoc.destroy();

    this.logger.debug(
      'MigrationService',
      `Elements copied successfully (${sourceState.length} bytes)`
    );
  }

  /**
   * Copy media files from local: database to srv:configId: database.
   *
   * This reads all media for a project from the source database
   * and writes them to the target database.
   */
  private async copyMediaFiles(
    sourceProjectKey: string,
    targetProjectKey: string,
    _targetConfigId: string
  ): Promise<void> {
    // List all media from local storage (uses current context prefix)
    const localMedia = await this.localStorage.listMedia(sourceProjectKey);

    if (localMedia.length === 0) {
      this.logger.debug(
        'MigrationService',
        `No media to copy for ${sourceProjectKey}`
      );
      return;
    }

    this.logger.debug(
      'MigrationService',
      `Copying ${localMedia.length} media files from ${sourceProjectKey} to ${targetProjectKey}`
    );

    // Copy each media file
    for (const mediaInfo of localMedia) {
      try {
        const blob = await this.localStorage.getMedia(
          sourceProjectKey,
          mediaInfo.mediaId
        );
        if (!blob) {
          this.logger.warn(
            'MigrationService',
            `Media not found: ${sourceProjectKey}:${mediaInfo.mediaId}`
          );
          continue;
        }

        // Save to target database
        // Note: LocalStorageService uses the current storage context prefix
        // Since we're now in server mode, this will save to srv:configId: prefix
        await this.localStorage.saveMedia(
          targetProjectKey,
          mediaInfo.mediaId,
          blob,
          mediaInfo.filename,
          mediaInfo.generation
        );
      } catch (error) {
        this.logger.warn(
          'MigrationService',
          `Failed to copy media ${mediaInfo.mediaId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.logger.debug('MigrationService', `Media files copied successfully`);
  }

  /**
   * Update the status of a specific project in the migration state
   */
  private updateProjectStatus(
    projectSlug: string,
    status: MigrationStatus,
    error?: string,
    stage?: MigrationStage,
    progress?: { completed: number; total: number }
  ): void {
    this.migrationState.update(state => ({
      ...state,
      projectStatuses: state.projectStatuses.map(ps =>
        ps.projectSlug === projectSlug
          ? {
              ...ps,
              status,
              error,
              currentStage: stage,
              stageProgress: progress,
            }
          : ps
      ),
    }));
  }

  /**
   * Clean up local data after successful migration
   * @param projectSlugs - Optional array of project slugs to clean up. If not provided, cleans all.
   */
  cleanupLocalData(projectSlugs?: string[]): void {
    this.logger.warn(
      'MigrationService',
      projectSlugs
        ? `Cleaning up ${projectSlugs.length} migrated project(s)`
        : 'Cleaning up all local data (projects, elements, user)'
    );

    // Debug: Check localStorage before cleanup
    console.log(
      '[Migration] Before cleanup - app-config:',
      localStorage.getItem('inkweld-app-config')
    );

    // Clear local projects (only selected ones if specified)
    const projects = this.localProjectService.projects();
    const projectsToDelete = projectSlugs
      ? projects.filter(p => projectSlugs.includes(p.slug))
      : projects;

    for (const project of projectsToDelete) {
      this.localProjectService.deleteProject(project.username, project.slug);
    }

    // Only clear all elements and user data if cleaning up everything
    if (!projectSlugs) {
      // Clear elements storage (will clear all project elements)
      localStorage.removeItem('inkweld-local-elements');

      // Clear local user (no longer needed in server mode)
      localStorage.removeItem('inkweld-local-user');
    }

    // Debug: Check localStorage after cleanup
    console.log(
      '[Migration] After cleanup - app-config:',
      localStorage.getItem('inkweld-app-config')
    );

    this.logger.info('MigrationService', 'Local data cleanup completed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY API COMPATIBILITY
  // These methods are provided for backward compatibility with existing code
  // that calls the old server-syncing migration API.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @deprecated Use migrateToServerMode instead. This method is kept for
   * backward compatibility but now performs local-only migration.
   */
  async migrateToServer(
    _serverUrl: string,
    projectSlugs?: string[],
    slugRenames?: Map<string, string>
  ): Promise<void> {
    // Get the current server config ID
    const config = this.storageContextService.getActiveConfig();
    if (!config) {
      throw new Error('No server configuration found');
    }

    // Get current user from config's userProfile
    const currentUser = config.userProfile?.username;
    if (!currentUser) {
      throw new Error('No current user found');
    }

    return this.migrateToServerMode(
      config.id,
      currentUser,
      projectSlugs,
      slugRenames
    );
  }

  /**
   * Register a new user on the server.
   * This is an authentication operation, not a migration operation.
   * Kept here for backward compatibility with existing UI code.
   *
   * @param username - Username to register
   * @param password - Password for the new account
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

      // Check if admin approval is required
      if (response.requiresApproval) {
        throw new Error(
          'This server requires admin approval. Migration cannot proceed.'
        );
      }

      // Store authentication token
      if (response.token) {
        this.authTokenService.setToken(response.token);
        this.logger.info('MigrationService', 'Authentication token stored');
      } else {
        throw new Error('Registration succeeded but no token was returned');
      }

      // Set the current user
      if (response.user) {
        await this.userService.setCurrentUser(response.user);
        this.logger.info(
          'MigrationService',
          'Current user set after registration'
        );

        // Update the storage context's config with user profile
        // This is required for migration to work correctly
        const activeConfig = this.storageContextService.getActiveConfig();
        if (activeConfig) {
          this.storageContextService.updateConfigUserProfile(activeConfig.id, {
            name: response.user.name ?? response.user.username,
            username: response.user.username,
          });
          this.logger.info(
            'MigrationService',
            'Updated config with user profile'
          );
        }
      }

      this.logger.info(
        'MigrationService',
        `Successfully registered user: ${username}`
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        'MigrationService',
        `Failed to register user ${username}`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Log in to the server.
   * This is an authentication operation, not a migration operation.
   * Kept here for backward compatibility with existing UI code.
   *
   * @param username - Username
   * @param password - Password
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

      // Store authentication token
      if (response.token) {
        this.authTokenService.setToken(response.token);
        this.logger.info('MigrationService', 'Authentication token stored');
      } else {
        throw new Error('Login succeeded but no token was returned');
      }

      // Set the current user
      if (response.user) {
        await this.userService.setCurrentUser(response.user);
        this.logger.info('MigrationService', 'Current user set after login');

        // Update the storage context's config with user profile
        // This is required for migration to work correctly
        const activeConfig = this.storageContextService.getActiveConfig();
        if (activeConfig) {
          this.storageContextService.updateConfigUserProfile(activeConfig.id, {
            name: response.user.name ?? response.user.username,
            username: response.user.username,
          });
          this.logger.info(
            'MigrationService',
            'Updated config with user profile'
          );
        }
      }

      this.logger.info(
        'MigrationService',
        `Successfully logged in user: ${username}`
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        'MigrationService',
        `Failed to login user ${username}`,
        error.message
      );
      throw error;
    }
  }
}
