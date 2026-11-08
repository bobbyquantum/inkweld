import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { forEachSequential } from '@inkweld/async';
import {
  AuthenticationService,
  type Element,
  ElementType,
  type Project,
  ProjectsService,
} from '@inkweld/index';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';
import { UserService } from '../user/user.service';
import { LocalProjectService } from './local-project.service';
import { LocalStorageService } from './local-storage.service';
import { ProjectActivationService } from './project-activation.service';
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
 * Registration worked but the account waits for an administrator, so
 * projects can't move yet. On a passwordless server the account has no
 * credential yet: `enrolmentToken` is the short-lived token that lets the
 * caller enrol a passkey for it before giving up.
 */
export class ServerApprovalRequiredError extends Error {
  constructor(readonly enrolmentToken?: string) {
    super('This server requires admin approval. Migration cannot proceed.');
    this.name = 'ServerApprovalRequiredError';
  }
}

/**
 * Service to handle migration of a Browser (or Cloud Sync) profile's projects
 * to a server profile's storage.
 *
 * IMPORTANT: Migration is a 100% LOCAL operation - it copies data between
 * IndexedDB prefixes. No server communication happens during migration.
 *
 * The source is named by its profile id. By the time projects move, the
 * sign-in has already made the server profile active, so nothing here may
 * read the source through the active profile, and the source need not be
 * the first Browser profile (`local`).
 *
 * Migration process:
 * 1. Elements - Copy elements Yjs doc from the source prefix to srv:configId:
 * 2. Documents - Copy document files for each element (ITEM, WORLDBUILDING types)
 * 3. Media - Copy media files from the source's media database to the target's
 * 4. ProjectEntry - Create project entry in server-mode project list
 *
 * After migration, the normal project sync mechanism handles uploading
 * to the server when online (same as creating a project while offline).
 *
 * Prose documents (<prefix>user:slug:elementId) and worldbuilding data
 * (<prefix>worldbuilding:user:slug:elementId) are stored under the profile
 * prefix, so both are always copied.
 */
@Injectable({
  providedIn: 'root',
})
export class MigrationService {
  private readonly storageContextService = inject(StorageContextService);
  private readonly localProjectService = inject(LocalProjectService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly projectSyncService = inject(ProjectSyncService);
  private readonly projectActivation = inject(ProjectActivationService);
  private readonly transloco = inject(TranslocoService);
  private readonly logger = inject(LoggerService);
  private readonly authenticationService = inject(AuthenticationService);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly userService = inject(UserService);
  private readonly projectsApi = inject(ProjectsService);

  readonly migrationState = signal<MigrationState>({
    status: MigrationStatus.NotStarted,
    totalProjects: 0,
    completedProjects: 0,
    failedProjects: 0,
    projectStatuses: [],
  });

  /**
   * Check if a profile has projects that need migration (excludes already migrated)
   */
  hasLocalProjects(sourceConfigId: string): boolean {
    return this.getLocalProjectsCount(sourceConfigId) > 0;
  }

  /**
   * Get count of a profile's projects (excludes already migrated)
   */
  getLocalProjectsCount(sourceConfigId: string): number {
    return this.getLocalProjects(sourceConfigId).length;
  }

  /**
   * Get list of a profile's projects for display (excludes already migrated)
   */
  getLocalProjects(sourceConfigId: string): Project[] {
    return this.localProjectService.getNonMigratedProjects(sourceConfigId);
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
   * Migrate selected projects of one profile to server-mode storage.
   *
   * This is a 100% LOCAL operation - no server communication.
   * Data is copied from the source profile's prefix to srv:configId:.
   *
   * @param sourceConfigId - The profile the projects come from (e.g. "local")
   * @param targetConfigId - The server config ID to migrate to (e.g., "a1b2c3d4")
   * @param targetUsername - The username for the migrated projects
   * @param projectSlugs - Optional array of project slugs to migrate. If not provided, all projects are migrated.
   * @param slugRenames - Optional map of original slug to new slug for renamed projects
   * @returns Promise that resolves when migration is complete
   */
  async migrateToServerMode(
    sourceConfigId: string,
    targetConfigId: string,
    targetUsername: string,
    projectSlugs?: string[],
    slugRenames?: Map<string, string>
  ): Promise<void> {
    // IMPORTANT: Read the source profile explicitly, not the context-dependent signal.
    // By the time this method is called, the storage context has already switched to the
    // server profile, so this.localProjectService.projects() would read the wrong list.
    let localProjects =
      this.localProjectService.getProjectsInConfig(sourceConfigId);

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
    // Sequential: each project updates the shared migration state and copies
    // IndexedDB databases; one at a time keeps progress reporting accurate.
    await forEachSequential(localProjects, project =>
      this.migrateProject(
        project,
        sourceConfigId,
        targetConfigId,
        targetUsername,
        slugRenames?.get(project.slug)
      )
    );

    // Update final state
    const finalState = this.migrationState();
    const allCompleted =
      finalState.completedProjects === finalState.totalProjects;
    const someFailed = finalState.failedProjects > 0;

    let status: MigrationStatus;
    if (allCompleted) {
      status = MigrationStatus.Completed;
    } else if (someFailed) {
      status = MigrationStatus.Failed;
    } else {
      status = MigrationStatus.InProgress;
    }

    this.migrationState.update(state => ({
      ...state,
      status,
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
   * 1. Elements - Copy elements Yjs doc from the source prefix to srv:configId:
   * 2. Media - Copy all media files from the source media database to the target's
   * 3. ProjectEntry - Add it to the target profile, mark it pending creation
   *    for sync, then mark it migrated in the source profile
   *
   * @param project - The project to migrate
   * @param sourceConfigId - The profile the project comes from
   * @param targetConfigId - The server config ID
   * @param targetUsername - The username for the migrated project
   * @param newSlug - Optional new slug if project was renamed
   */
  private async migrateProject(
    project: Project,
    sourceConfigId: string,
    targetConfigId: string,
    targetUsername: string,
    newSlug?: string
  ): Promise<void> {
    const targetSlug = newSlug ?? project.slug;
    const migrationTarget = newSlug ? ` -> ${targetUsername}/${newSlug}` : '';

    this.logger.debug(
      'MigrationService',
      `Migrating project: ${project.username}/${project.slug}${migrationTarget}`
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
      await this.assertDownloadedHere(project, sourceConfigId);

      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 1: ELEMENTS - Copy elements Yjs document between prefixes
      // ═══════════════════════════════════════════════════════════════════════
      this.logger.info(
        'MigrationService',
        `[${targetSlug}] Stage 1: Copying elements document`
      );

      const elements = await this.copyElementsDocument(
        sourceConfigId,
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
      // Both kinds are stored under the profile prefix, so both move.
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
        sourceConfigId,
        project.username,
        project.slug,
        targetConfigId,
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

      await this.localStorage.copyProjectMediaBetweenProfiles(
        sourceConfigId,
        targetConfigId,
        sourceProjectKey,
        targetProjectKey
      );

      this.updateProjectStatus(
        targetSlug,
        MigrationStatus.InProgress,
        undefined,
        MigrationStage.Media,
        { completed: 1, total: 1 }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 4: PROJECT ENTRY - Add the project to the target profile
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

      // Record the move in the source profile, so it isn't offered again.
      // Last: if any step above failed, the project can be picked again.
      const serverUrl = this.storageContextService.getServerUrl() || 'unknown';
      this.localProjectService.markProjectAsMigrated(
        sourceConfigId,
        project.slug,
        targetSlug,
        serverUrl,
        targetUsername
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
   * A Cloud Sync project made on another device shows here as a cover until
   * it is opened (activated); its documents are only in the cloud. Moving it
   * would copy empty databases to the server, so it fails instead and stays
   * in its profile to be moved once it has downloaded.
   */
  private async assertDownloadedHere(
    project: Project,
    sourceConfigId: string
  ): Promise<void> {
    const source = this.storageContextService.getConfigById(sourceConfigId);
    if (source?.type !== 'cloud') return;
    const projectKey = `${project.username}/${project.slug}`;
    if (
      await this.projectActivation.isActivatedInConfig(
        sourceConfigId,
        projectKey
      )
    ) {
      return;
    }
    throw new Error(
      this.transloco.translate('dialogs.profileManager.projectNotDownloaded')
    );
  }

  /**
   * Copy a Yjs elements document from the source profile's prefix to srv:configId:.
   *
   * This loads the source document from IndexedDB, encodes its state,
   * and writes it to a new IndexedDB database with the target prefix.
   *
   * @returns The elements array from the source document, for use in copying document files
   */
  private async copyElementsDocument(
    sourceConfigId: string,
    sourceUsername: string,
    sourceSlug: string,
    targetConfigId: string,
    targetUsername: string,
    targetSlug: string
  ): Promise<Element[]> {
    // Build source and target document IDs
    const sourcePrefix =
      this.storageContextService.getPrefixForConfig(sourceConfigId);
    const targetPrefix =
      this.storageContextService.getPrefixForConfig(targetConfigId);
    const sourceDocId = `${sourcePrefix}${sourceUsername}:${sourceSlug}:elements`;
    const targetDocId = `${targetPrefix}${targetUsername}:${targetSlug}:elements`;

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
   * Prose documents (<profile prefix>user:slug:elementId) and worldbuilding
   * data (<profile prefix>worldbuilding:user:slug:elementId) are both copied
   * from the source profile's prefix to the target profile's.
   */
  private async copyDocumentFiles(
    sourceConfigId: string,
    sourceUsername: string,
    sourceSlug: string,
    targetConfigId: string,
    targetUsername: string,
    targetSlug: string,
    elements: Element[]
  ): Promise<void> {
    // Filter elements that have document content
    const itemElements = elements.filter(e => e.type === ElementType.Item);
    const worldbuildingElements = elements.filter(
      e => e.type === ElementType.Worldbuilding
    );

    this.logger.info(
      'MigrationService',
      `Copying ${itemElements.length} document files and ${worldbuildingElements.length} worldbuilding elements`
    );

    // Copy ITEM documents (ProseMirror content) between profile prefixes
    const sourcePrefix =
      this.storageContextService.getPrefixForConfig(sourceConfigId);
    const targetPrefix =
      this.storageContextService.getPrefixForConfig(targetConfigId);
    // Sequential: each copy opens and closes IndexedDB-backed Yjs documents,
    // and the first failure must stop the migration.
    await forEachSequential(itemElements, element =>
      this.copySingleDocument(
        `${sourcePrefix}${sourceUsername}:${sourceSlug}:${element.id}`,
        `${targetPrefix}${targetUsername}:${targetSlug}:${element.id}`
      )
    );

    // Copy WORLDBUILDING documents between profile prefixes
    await forEachSequential(worldbuildingElements, element =>
      this.copySingleDocument(
        `${sourcePrefix}worldbuilding:${sourceUsername}:${sourceSlug}:${element.id}`,
        `${targetPrefix}worldbuilding:${targetUsername}:${targetSlug}:${element.id}`
      )
    );

    this.logger.debug('MigrationService', `Document files copied successfully`);
  }

  /**
   * Copy a single Yjs document from source key to target key. Throws on
   * failure so the project migration fails (and stays retryable) rather than
   * completing without the document in the target profile.
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'MigrationService',
        `Failed to copy document ${sourceKey}: ${message}`
      );
      throw new Error(`Failed to copy document ${sourceKey}: ${message}`, {
        cause: error,
      });
    }
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
   * Clean up the source profile after a successful migration
   * @param sourceConfigId - The profile the projects moved from
   * @param projectSlugs - Optional array of project slugs to clean up. If not provided, cleans all.
   */
  cleanupLocalData(sourceConfigId: string, projectSlugs?: string[]): void {
    this.logger.warn(
      'MigrationService',
      projectSlugs
        ? `Cleaning up ${projectSlugs.length} migrated project(s)`
        : 'Cleaning up all local data (projects, elements, user)'
    );

    // IMPORTANT: Read the source profile explicitly instead of projects():
    // at cleanup time the server profile is active, so projects() would read
    // the server profile's list.
    const projects =
      this.localProjectService.getProjectsInConfig(sourceConfigId);
    const projectsToDelete = projectSlugs
      ? projects.filter(p => projectSlugs.includes(p.slug))
      : projects;

    for (const project of projectsToDelete) {
      // Not deleteProject: that acts on the active (server) profile
      this.localProjectService.deleteProjectInConfig(
        sourceConfigId,
        project.username,
        project.slug
      );
    }

    // Only clear all elements and user data if cleaning up everything
    if (!projectSlugs) {
      // Clear local user (no longer needed in server mode)
      localStorage.removeItem('inkweld-local-user');
    }

    this.logger.info('MigrationService', 'Local data cleanup completed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER ACCOUNT HELPERS (used by the profile manager's migration flow)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Migrate a profile's projects into the active server profile, resolving
   * its config id and signed-in username.
   */
  async migrateToServer(
    sourceConfigId: string,
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

    return await this.migrateToServerMode(
      sourceConfigId,
      config.id,
      currentUser,
      projectSlugs,
      slugRenames
    );
  }

  /**
   * Register a new user on the server.
   *
   * @param username - Username to register
   * @param password - Password for the new account. Leave it out on a
   *   passwordless server; the caller then enrols a passkey.
   * @param profile - Optional display name and email for the account
   */
  async registerOnServer(
    username: string,
    password?: string,
    profile: { name?: string; email?: string } = {}
  ): Promise<void> {
    this.logger.info('MigrationService', `Registering user: ${username}`);

    try {
      const response = await firstValueFrom(
        this.authenticationService.registerUser({
          username,
          ...(password ? { password } : {}),
          ...(profile.name ? { name: profile.name } : {}),
          ...(profile.email ? { email: profile.email } : {}),
        })
      );

      // Check if admin approval is required
      if (response.requiresApproval) {
        throw new ServerApprovalRequiredError(response.enrolmentToken);
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
      const message = this.extractHttpBodyMessage(err.error);
      return new Error((message ?? err.message) || `HTTP error ${err.status}`);
    }

    // Unknown error type
    if (typeof err === 'string') {
      return new Error(err);
    }

    return new Error('An unknown error occurred');
  }

  /** Try to extract a human-readable message from an HTTP response body. */
  private extractHttpBodyMessage(body: unknown): string | null {
    if (typeof body === 'string') return body;
    if (body !== null && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if ('message' in obj && typeof obj['message'] === 'string')
        return obj['message'];
      if ('error' in obj && typeof obj['error'] === 'string')
        return obj['error'];
    }
    return null;
  }
}
