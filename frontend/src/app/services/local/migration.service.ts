import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import {
  AuthenticationService,
  Element,
  ElementType,
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
import { ProjectSyncService } from './project-sync.service';

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
  Documents = 'Documents',
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
 * 2. Documents - Copy document files for each element (ITEM, WORLDBUILDING types)
 * 3. Media - Copy media files from local: database to srv:configId: database
 * 4. ProjectEntry - Create project entry in server-mode project list
 *
 * After migration, the normal project sync mechanism handles uploading
 * to the server when online (same as creating a project while offline).
 *
 * Documents are stored WITHOUT prefix (user:slug:elementId) so they need
 * migration when username or slug changes. Worldbuilding data uses format
 * worldbuilding:user:slug:elementId and also needs migration.
 */
@Injectable({
  providedIn: 'root',
})
export class MigrationService {
  private storageContextService = inject(StorageContextService);
  private localProjectService = inject(LocalProjectService);
  private localStorage = inject(LocalStorageService);
  private projectSyncService = inject(ProjectSyncService);
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
    // IMPORTANT: Read from local-mode storage explicitly, not from the context-dependent signal.
    // By the time this method is called, the storage context may have already switched to server mode,
    // which would cause this.localProjectService.projects() to return empty (reading from wrong key).
    let localProjects = this.localProjectService.getLocalModeProjects();

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

    // Migrate each project (copies data to server-mode storage)
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

    // NOTE: Projects are NOT created on the server here.
    // The migration only copies data to server-mode storage and marks projects as pending creation.
    // The caller (migration dialog) should trigger sync to actually create projects on the server.
  }

  /**
   * Get the list of migrated project keys that need to sync to the server.
   * These are projects that were successfully migrated and marked as pending creation.
   */
  getMigratedProjectKeys(): string[] {
    const state = this.migrationState();
    if (state.status !== MigrationStatus.Completed) {
      return [];
    }
    return state.projectStatuses
      .filter(ps => ps.status === MigrationStatus.Completed)
      .map(
        ps =>
          `${this.storageContextService.getActiveConfig()?.userProfile?.username}/${ps.projectSlug}`
      );
  }

  /**
   * Migrate a single project to server-mode storage.
   *
   * Stages:
   * 1. Elements - Copy elements Yjs doc from local: to srv:configId:
   * 2. Media - Copy all media files from local: to srv:configId: database
   * 3. ProjectEntry - Mark project as migrated and mark pending creation for sync
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

      const elements = await this.copyElementsDocument(
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
      // STAGE 2: DOCUMENTS - Copy document files for ITEM and WORLDBUILDING elements
      // Documents are stored WITHOUT prefix (user:slug:elementId) so they need
      // migration when username or slug changes.
      // ═══════════════════════════════════════════════════════════════════════
      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.Documents,
        { completed: 0, total: 1 }
      );
      this.migrationState.update(state => ({
        ...state,
        currentStage: MigrationStage.Documents,
      }));

      this.logger.info(
        'MigrationService',
        `[${targetSlug}] Stage 2: Copying document files`
      );

      await this.copyDocumentFiles(
        project.username,
        project.slug,
        targetUsername,
        targetSlug,
        elements
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.Documents,
        { completed: 1, total: 1 }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 3: MEDIA - Copy media files between prefixed databases
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
        `[${targetSlug}] Stage 3: Copying media files`
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
      // STAGE 4: PROJECT ENTRY - Mark project as migrated
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
        `[${targetSlug}] Stage 4: Creating project entry`
      );

      // Mark the local project as migrated (records migration info in local storage)
      const serverUrl = this.storageContextService.getServerUrl() || 'unknown';
      this.localProjectService.markProjectAsMigrated(
        project.slug,
        targetSlug,
        serverUrl,
        targetUsername
      );

      // Create the project entry in the TARGET config's storage
      // This is crucial: the elements and media have been copied to srv:configId: prefix,
      // but we also need the project metadata to appear in the local projects list
      // for that config, so when the user views the home page in server mode, they see it.
      this.localProjectService.createProjectInConfig(
        project,
        targetConfigId,
        targetUsername,
        targetSlug
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.ProjectEntry,
        { completed: 1, total: 1 }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 5: SYNC - Mark project as pending creation for server sync
      // ═══════════════════════════════════════════════════════════════════════
      this.logger.info(
        'MigrationService',
        `[${targetSlug}] Stage 5: Marking for server sync`
      );

      // Mark this project as needing to be created on the server
      // The background sync service (or manual sync) will pick this up and create the project
      const projectKey = `${targetUsername}/${targetSlug}`;
      await this.projectSyncService.markPendingCreation(projectKey, {
        title: project.title,
        slug: targetSlug,
        description: project.description || undefined,
      });

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
   *
   * @returns The elements array from the source document, for use in copying document files
   */
  private async copyElementsDocument(
    sourceUsername: string,
    sourceSlug: string,
    targetConfigId: string,
    targetUsername: string,
    targetSlug: string
  ): Promise<Element[]> {
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

    // Extract elements array from source document before encoding
    const elementsArray = sourceDoc.getArray<Element>('elements');
    const elements = elementsArray.toArray();

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
      `Elements copied successfully (${sourceState.length} bytes, ${elements.length} elements)`
    );

    return elements;
  }

  /**
   * Copy document files for ITEM elements and worldbuilding data for WORLDBUILDING elements.
   *
   * Documents are stored WITHOUT prefix using format: user:slug:elementId
   * Worldbuilding data uses format: worldbuilding:user:slug:elementId
   *
   * These need to be copied when username or slug changes during migration.
   */
  private async copyDocumentFiles(
    sourceUsername: string,
    sourceSlug: string,
    targetUsername: string,
    targetSlug: string,
    elements: Element[]
  ): Promise<void> {
    // Skip if username and slug are the same - no migration needed
    if (sourceUsername === targetUsername && sourceSlug === targetSlug) {
      this.logger.debug(
        'MigrationService',
        `Skipping document copy - username and slug unchanged`
      );
      return;
    }

    // Filter elements that have document content
    const itemElements = elements.filter(e => e.type === ElementType.Item);
    const worldbuildingElements = elements.filter(
      e => e.type === ElementType.Worldbuilding
    );

    this.logger.info(
      'MigrationService',
      `Copying ${itemElements.length} document files and ${worldbuildingElements.length} worldbuilding elements`
    );

    // Copy ITEM documents (ProseMirror content)
    for (const element of itemElements) {
      await this.copySingleDocument(
        `${sourceUsername}:${sourceSlug}:${element.id}`,
        `${targetUsername}:${targetSlug}:${element.id}`
      );
    }

    // Copy WORLDBUILDING documents
    for (const element of worldbuildingElements) {
      await this.copySingleDocument(
        `worldbuilding:${sourceUsername}:${sourceSlug}:${element.id}`,
        `worldbuilding:${targetUsername}:${targetSlug}:${element.id}`
      );
    }

    this.logger.debug('MigrationService', `Document files copied successfully`);
  }

  /**
   * Copy a single Yjs document from source key to target key.
   */
  private async copySingleDocument(
    sourceKey: string,
    targetKey: string
  ): Promise<void> {
    try {
      // Load source document from IndexedDB
      const sourceDoc = new Y.Doc();
      const sourceProvider = new IndexeddbPersistence(sourceKey, sourceDoc);
      await sourceProvider.whenSynced;

      // Check if source has any content
      const sourceState = Y.encodeStateAsUpdate(sourceDoc);
      if (sourceState.length <= 2) {
        // Empty doc - skip
        this.logger.debug(
          'MigrationService',
          `Skipping empty document: ${sourceKey}`
        );
        await sourceProvider.destroy();
        sourceDoc.destroy();
        return;
      }

      // Create target document and apply source state
      const targetDoc = new Y.Doc();
      Y.applyUpdate(targetDoc, sourceState);

      // Save target document to IndexedDB
      const targetProvider = new IndexeddbPersistence(targetKey, targetDoc);
      await targetProvider.whenSynced;

      // Force a write to ensure the state is persisted
      targetDoc.transact(() => {
        // No-op transaction to trigger persistence
      });

      // Wait for the debounced write to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Clean up
      await sourceProvider.destroy();
      await targetProvider.destroy();
      sourceDoc.destroy();
      targetDoc.destroy();

      this.logger.debug(
        'MigrationService',
        `Copied document: ${sourceKey} -> ${targetKey} (${sourceState.length} bytes)`
      );
    } catch (error) {
      this.logger.warn(
        'MigrationService',
        `Failed to copy document ${sourceKey}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Continue with other documents - don't fail the whole migration
    }
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

    // IMPORTANT: Use getLocalModeProjects() instead of projects() because
    // at cleanup time we're already in server mode, so projects() would read
    // from the server-mode storage instead of local-mode storage.
    const projects = this.localProjectService.getLocalModeProjects();
    const projectsToDelete = projectSlugs
      ? projects.filter(p => projectSlugs.includes(p.slug))
      : projects;

    for (const project of projectsToDelete) {
      // Use deleteLocalModeProject instead of deleteProject because
      // we're deleting from local storage while in server mode.
      this.localProjectService.deleteLocalModeProject(
        project.username,
        project.slug
      );
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
      const error = this.extractError(err);
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
      const error = this.extractError(err);
      this.logger.error(
        'MigrationService',
        `Failed to login user ${username}`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Extract a meaningful error message from various error types.
   * Handles HttpErrorResponse, Error, and unknown errors.
   */
  private extractError(err: unknown): Error {
    if (err instanceof Error) {
      return err;
    }

    if (err instanceof HttpErrorResponse) {
      // Try to extract error message from response body
      const body: unknown = err.error;
      if (typeof body === 'string') {
        return new Error(body);
      }
      if (body !== null && typeof body === 'object') {
        // Common error response formats
        const bodyObj = body as Record<string, unknown>;
        if ('message' in bodyObj && typeof bodyObj['message'] === 'string') {
          return new Error(bodyObj['message']);
        }
        if ('error' in bodyObj && typeof bodyObj['error'] === 'string') {
          return new Error(bodyObj['error']);
        }
      }
      // Fallback to status text
      return new Error(err.message || `HTTP error ${err.status}`);
    }

    // Unknown error type
    if (typeof err === 'string') {
      return new Error(err);
    }

    return new Error('An unknown error occurred');
  }
}
