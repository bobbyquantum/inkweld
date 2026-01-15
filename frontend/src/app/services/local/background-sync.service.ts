import { inject, Injectable, OnDestroy } from '@angular/core';
import { ProjectsService } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { ProjectService } from '../project/project.service';
import { ProjectSyncService } from './project-sync.service';

/**
 * Service for background synchronization of pending changes.
 *
 * This service:
 * - Monitors network connectivity
 * - Syncs pending project creations when coming back online
 * - Syncs pending metadata updates
 * - Syncs pending media uploads
 *
 * The service only activates in 'server' mode and automatically
 * retries sync operations when network connectivity is restored.
 */
@Injectable({
  providedIn: 'root',
})
export class BackgroundSyncService implements OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly setupService = inject(SetupService);
  private readonly projectSync = inject(ProjectSyncService);
  private readonly projectService = inject(ProjectService);
  private readonly projectsApi = inject(ProjectsService);

  private onlineHandler: (() => void) | null = null;
  private syncInProgress = false;
  private initialized = false;

  /**
   * Initialize background sync monitoring.
   * Call this once during app startup.
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    const mode = this.setupService.getMode();
    if (mode !== 'server') {
      this.logger.debug(
        'BackgroundSync',
        'Skipping initialization - not in server mode'
      );
      return;
    }

    this.initialized = true;
    this.setupNetworkHandlers();

    // Check for pending items on startup if we're online
    if (navigator.onLine) {
      void this.syncPendingItems();
    }

    this.logger.info('BackgroundSync', 'Background sync service initialized');
  }

  ngOnDestroy(): void {
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  /**
   * Manually trigger sync of all pending items.
   * Returns true if all items synced successfully.
   */
  async syncPendingItems(): Promise<boolean> {
    if (this.syncInProgress) {
      this.logger.debug('BackgroundSync', 'Sync already in progress, skipping');
      return false;
    }

    if (!navigator.onLine) {
      this.logger.debug('BackgroundSync', 'Offline, skipping sync');
      return false;
    }

    this.syncInProgress = true;
    let allSuccess = true;

    try {
      // Sync pending project creations
      allSuccess = (await this.syncPendingCreations()) && allSuccess;

      // Sync pending metadata updates
      allSuccess = (await this.syncPendingMetadata()) && allSuccess;

      // TODO: Sync pending media uploads
      // allSuccess = (await this.syncPendingUploads()) && allSuccess;

      return allSuccess;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync all pending project creations to the server.
   */
  private async syncPendingCreations(): Promise<boolean> {
    try {
      const pendingCreations =
        await this.projectSync.getProjectsWithPendingCreations();

      if (pendingCreations.length === 0) {
        return true;
      }

      this.logger.info(
        'BackgroundSync',
        `Syncing ${pendingCreations.length} pending project creation(s)`
      );

      let allSuccess = true;

      for (const { projectKey, creation } of pendingCreations) {
        try {
          this.logger.debug(
            'BackgroundSync',
            `Syncing pending creation: ${projectKey}`
          );

          // Create on server
          const serverProject = await firstValueFrom(
            this.projectsApi.createProject({
              title: creation.projectData.title,
              slug: creation.projectData.slug,
              description: creation.projectData.description,
            })
          );

          // Update local project with server data
          const parts = projectKey.split('/');
          const username = parts[0] ?? '';
          const slug = parts[1] ?? '';
          if (username && slug) {
            await this.projectService.updateLocalProjectWithServerData(
              username,
              slug,
              serverProject
            );
          }

          // Clear the pending creation flag
          await this.projectSync.clearPendingCreation(projectKey);

          this.logger.info(
            'BackgroundSync',
            `Successfully synced project creation: ${projectKey}`
          );
        } catch (error: unknown) {
          this.logger.error(
            'BackgroundSync',
            `Failed to sync project creation: ${projectKey}`,
            error
          );
          await this.projectSync.markSyncError(
            projectKey,
            error instanceof Error ? error.message : 'Unknown sync error'
          );
          allSuccess = false;
        }
      }

      return allSuccess;
    } catch (error) {
      this.logger.error(
        'BackgroundSync',
        'Failed to get pending creations',
        error
      );
      return false;
    }
  }

  /**
   * Sync all pending metadata updates to the server.
   */
  private async syncPendingMetadata(): Promise<boolean> {
    try {
      const projectsWithChanges =
        await this.projectSync.getProjectsWithPendingChanges();

      // Filter to only those with pending metadata (not just uploads)
      const projectsWithMetadata = projectsWithChanges.filter(key => {
        const state = this.projectSync.getSyncState(key)();
        return (
          state.pendingMetadata?.title !== undefined ||
          state.pendingMetadata?.description !== undefined
        );
      });

      if (projectsWithMetadata.length === 0) {
        return true;
      }

      this.logger.info(
        'BackgroundSync',
        `Syncing ${projectsWithMetadata.length} pending metadata update(s)`
      );

      let allSuccess = true;

      for (const projectKey of projectsWithMetadata) {
        const state = this.projectSync.getSyncState(projectKey)();
        if (!state.pendingMetadata) continue;

        try {
          const parts = projectKey.split('/');
          const username = parts[0] ?? '';
          const slug = parts[1] ?? '';
          if (!username || !slug) continue;

          // Get current project to get all fields
          const existingProject =
            await this.projectService.getProjectByUsernameAndSlug(
              username,
              slug
            );

          if (existingProject) {
            // Update with pending metadata
            const updatedProject = {
              ...existingProject,
              title: state.pendingMetadata.title ?? existingProject.title,
              description:
                state.pendingMetadata.description ??
                existingProject.description,
            };

            await this.projectService.updateProject(
              username,
              slug,
              updatedProject
            );
          }

          // Clear pending metadata on success
          await this.projectSync.clearPendingMetadata(projectKey);

          this.logger.info(
            'BackgroundSync',
            `Successfully synced metadata: ${projectKey}`
          );
        } catch (error) {
          this.logger.error(
            'BackgroundSync',
            `Failed to sync metadata: ${projectKey}`,
            error
          );
          allSuccess = false;
        }
      }

      return allSuccess;
    } catch (error) {
      this.logger.error(
        'BackgroundSync',
        'Failed to sync pending metadata',
        error
      );
      return false;
    }
  }

  /**
   * Set up network connectivity handlers.
   */
  private setupNetworkHandlers(): void {
    this.onlineHandler = () => {
      this.logger.info(
        'BackgroundSync',
        'Network connectivity restored, syncing pending items...'
      );
      void this.syncPendingItems();
    };

    window.addEventListener('online', this.onlineHandler);
  }
}
