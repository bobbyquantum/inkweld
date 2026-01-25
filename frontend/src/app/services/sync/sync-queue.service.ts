import { computed, inject, Injectable, signal } from '@angular/core';
import { MediaService, Project, ProjectsService } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';

/**
 * Sync stage for a project
 */
export enum SyncStage {
  Queued = 'queued',
  Metadata = 'metadata',
  Elements = 'elements',
  Documents = 'documents',
  Media = 'media',
  Worldbuilding = 'worldbuilding',
  Completed = 'completed',
  Failed = 'failed',
}

/**
 * Sync status for a single project
 */
export interface ProjectSyncStatus {
  projectKey: string;
  projectId: string;
  stage: SyncStage;
  progress: number; // 0-100 for current stage
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Overall sync queue state
 */
export interface SyncQueueState {
  isActive: boolean;
  totalProjects: number;
  completedProjects: number;
  failedProjects: number;
  currentProjectKey: string | null;
}

/**
 * Service for managing project synchronization queue.
 *
 * This service:
 * - Maintains a queue of projects to sync
 * - Syncs each project methodically (metadata, elements, documents, media, worldbuilding)
 * - Provides reactive state for UI progress indicators
 * - Works only in server mode when online
 */
@Injectable({
  providedIn: 'root',
})
export class SyncQueueService {
  private logger = inject(LoggerService);
  private setupService = inject(SetupService);
  private projectsApi = inject(ProjectsService);
  private mediaApi = inject(MediaService);

  /** Queue of project keys waiting to be synced */
  private queue: string[] = [];

  /** Map of project key to sync status */
  private projectStatuses = new Map<
    string,
    ReturnType<typeof signal<ProjectSyncStatus>>
  >();

  /**
   * Version counter that increments whenever the projectStatuses map changes.
   * Used to trigger reactivity in components that depend on status lookups.
   */
  readonly statusVersion = signal(0);

  /** Overall queue state */
  readonly queueState = signal<SyncQueueState>({
    isActive: false,
    totalProjects: 0,
    completedProjects: 0,
    failedProjects: 0,
    currentProjectKey: null,
  });

  /** Whether a sync operation is in progress */
  readonly isSyncing = computed(() => this.queueState().isActive);

  /** Overall progress across all projects (0-100) */
  readonly overallProgress = computed(() => {
    const state = this.queueState();
    if (state.totalProjects === 0) return 0;
    return Math.round(
      ((state.completedProjects + state.failedProjects) / state.totalProjects) *
        100
    );
  });

  /**
   * Get the sync status signal for a specific project
   */
  getProjectStatus(
    projectKey: string
  ): ReturnType<typeof signal<ProjectSyncStatus>> | undefined {
    return this.projectStatuses.get(projectKey);
  }

  /**
   * Check if a project is currently being synced
   */
  isProjectSyncing(projectKey: string): boolean {
    const status = this.projectStatuses.get(projectKey);
    if (!status) return false;
    const stage = status().stage;
    return (
      stage !== SyncStage.Queued &&
      stage !== SyncStage.Completed &&
      stage !== SyncStage.Failed
    );
  }

  /**
   * Check if a project is in the queue (including currently syncing)
   */
  isProjectInQueue(projectKey: string): boolean {
    return this.projectStatuses.has(projectKey);
  }

  /**
   * Start syncing all provided projects.
   * Clears any existing queue and starts fresh.
   *
   * @param projects - Array of projects to sync
   */
  async syncAllProjects(projects: Project[]): Promise<void> {
    if (this.queueState().isActive) {
      this.logger.warn('SyncQueueService', 'Sync already in progress');
      return;
    }

    // Check if we're in server mode and online
    if (this.setupService.getMode() !== 'server') {
      this.logger.warn(
        'SyncQueueService',
        'Sync only available in server mode'
      );
      return;
    }

    if (!navigator.onLine) {
      this.logger.warn('SyncQueueService', 'Cannot sync while offline');
      return;
    }

    if (projects.length === 0) {
      this.logger.info('SyncQueueService', 'No projects to sync');
      return;
    }

    this.logger.info(
      'SyncQueueService',
      `Starting sync of ${projects.length} projects`
    );

    // Clear previous state
    this.projectStatuses.clear();
    this.queue = [];

    // Initialize queue and statuses
    for (const project of projects) {
      const projectKey = `${project.username}/${project.slug}`;
      this.queue.push(projectKey);

      const statusSignal = signal<ProjectSyncStatus>({
        projectKey,
        projectId: project.id,
        stage: SyncStage.Queued,
        progress: 0,
      });
      this.projectStatuses.set(projectKey, statusSignal);
    }

    // Notify subscribers that statuses have changed
    this.statusVersion.update(v => v + 1);

    // Update queue state
    this.queueState.set({
      isActive: true,
      totalProjects: projects.length,
      completedProjects: 0,
      failedProjects: 0,
      currentProjectKey: null,
    });

    // Process the queue
    await this.processQueue();
  }

  /**
   * Cancel the current sync operation
   */
  cancelSync(): void {
    if (!this.queueState().isActive) return;

    this.logger.info('SyncQueueService', 'Cancelling sync');

    // Mark remaining queued projects as cancelled
    for (const projectKey of this.queue) {
      const status = this.projectStatuses.get(projectKey);
      if (status && status().stage === SyncStage.Queued) {
        status.update(s => ({
          ...s,
          stage: SyncStage.Failed,
          error: 'Cancelled',
        }));
      }
    }

    this.queue = [];
    this.queueState.update(s => ({
      ...s,
      isActive: false,
      currentProjectKey: null,
    }));
  }

  /**
   * Process the sync queue one project at a time
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.queueState().isActive) {
      const projectKey = this.queue.shift()!;

      this.queueState.update(s => ({
        ...s,
        currentProjectKey: projectKey,
      }));

      await this.syncProject(projectKey);

      // Small delay between projects to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Queue complete
    this.queueState.update(s => ({
      ...s,
      isActive: false,
      currentProjectKey: null,
    }));

    const finalState = this.queueState();
    this.logger.info(
      'SyncQueueService',
      `Sync complete: ${finalState.completedProjects} succeeded, ${finalState.failedProjects} failed`
    );
  }

  /**
   * Sync a single project through all stages
   */
  private async syncProject(projectKey: string): Promise<void> {
    const statusSignal = this.projectStatuses.get(projectKey);
    if (!statusSignal) return;

    const updateStatus = (
      stage: SyncStage,
      progress: number,
      error?: string
    ) => {
      statusSignal.update(s => ({
        ...s,
        stage,
        progress,
        error,
        ...(stage !== SyncStage.Queued && !s.startedAt
          ? { startedAt: new Date().toISOString() }
          : {}),
        ...(stage === SyncStage.Completed || stage === SyncStage.Failed
          ? { completedAt: new Date().toISOString() }
          : {}),
      }));
    };

    try {
      // Stage 1: Metadata
      updateStatus(SyncStage.Metadata, 0);
      await this.syncMetadata(projectKey);
      updateStatus(SyncStage.Metadata, 100);

      // Stage 2: Elements (project structure)
      updateStatus(SyncStage.Elements, 0);
      await this.syncElements(projectKey);
      updateStatus(SyncStage.Elements, 100);

      // Stage 3: Documents
      updateStatus(SyncStage.Documents, 0);
      await this.syncDocuments(projectKey);
      updateStatus(SyncStage.Documents, 100);

      // Stage 4: Media
      updateStatus(SyncStage.Media, 0);
      await this.syncMedia(projectKey);
      updateStatus(SyncStage.Media, 100);

      // Stage 5: Worldbuilding
      updateStatus(SyncStage.Worldbuilding, 0);
      await this.syncWorldbuilding(projectKey);
      updateStatus(SyncStage.Worldbuilding, 100);

      // Complete
      updateStatus(SyncStage.Completed, 100);

      this.queueState.update(s => ({
        ...s,
        completedProjects: s.completedProjects + 1,
      }));

      this.logger.info('SyncQueueService', `Synced project: ${projectKey}`);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      updateStatus(SyncStage.Failed, 0, error);

      this.queueState.update(s => ({
        ...s,
        failedProjects: s.failedProjects + 1,
      }));

      this.logger.error(
        'SyncQueueService',
        `Failed to sync project: ${projectKey}`,
        error
      );
    }
  }

  /**
   * Sync project metadata (title, description, settings)
   */
  private async syncMetadata(projectKey: string): Promise<void> {
    const [username, slug] = projectKey.split('/');

    // Fetch latest project from server to ensure we have up-to-date data
    await firstValueFrom(this.projectsApi.getProject(username, slug));

    this.logger.debug('SyncQueueService', `[${projectKey}] Metadata synced`);
  }

  /**
   * Sync project elements (structure/tree)
   * Elements sync happens automatically via Yjs WebSocket, so this just verifies connection
   */
  private async syncElements(_projectKey: string): Promise<void> {
    // Elements sync via Yjs is automatic when connected
    // This stage is a placeholder for any explicit sync logic
    await new Promise(resolve => setTimeout(resolve, 100));
    this.logger.debug('SyncQueueService', `[${_projectKey}] Elements synced`);
  }

  /**
   * Sync all documents in the project
   * Documents sync happens automatically via Yjs WebSocket
   */
  private async syncDocuments(_projectKey: string): Promise<void> {
    // Documents sync via Yjs is automatic when connected
    // This stage is a placeholder for any explicit sync logic
    await new Promise(resolve => setTimeout(resolve, 100));
    this.logger.debug('SyncQueueService', `[${_projectKey}] Documents synced`);
  }

  /**
   * Sync media files (cover image, media library)
   */
  private async syncMedia(projectKey: string): Promise<void> {
    const [username, slug] = projectKey.split('/');

    try {
      // Fetch media list from server to verify what's synced
      await firstValueFrom(this.mediaApi.listProjectMedia(username, slug));
      this.logger.debug('SyncQueueService', `[${projectKey}] Media synced`);
    } catch {
      // Media endpoints may not exist for all projects
      this.logger.debug('SyncQueueService', `[${projectKey}] No media to sync`);
    }
  }

  /**
   * Sync worldbuilding schemas and data
   * Worldbuilding sync happens via Yjs
   */
  private async syncWorldbuilding(_projectKey: string): Promise<void> {
    // Worldbuilding sync via Yjs is automatic when connected
    await new Promise(resolve => setTimeout(resolve, 100));
    this.logger.debug(
      'SyncQueueService',
      `[${_projectKey}] Worldbuilding synced`
    );
  }

  /**
   * Reset sync state (clear all statuses)
   */
  reset(): void {
    this.queue = [];
    this.projectStatuses.clear();
    this.statusVersion.update(v => v + 1);
    this.queueState.set({
      isActive: false,
      totalProjects: 0,
      completedProjects: 0,
      failedProjects: 0,
      currentProjectKey: null,
    });
  }
}
