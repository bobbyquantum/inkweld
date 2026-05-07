import { inject, signal } from '@angular/core';
import { ProjectStateService } from '@services/project/project-state.service';
import { SyncQueueService } from '@services/sync/sync-queue.service';

/**
 * Encapsulates the "sync this document" flow shared between DocumentTabComponent
 * and WorldbuildingTabComponent.
 *
 * Provide at the component level (`providers: [DocumentSyncService]`) so that
 * each component instance gets its own state.
 */
export class DocumentSyncService {
  private readonly projectState = inject(ProjectStateService);
  private readonly syncQueueService = inject(SyncQueueService);

  private availabilityCheckToken = 0;

  /** Whether the current document is unavailable (remote, not yet synced). */
  readonly documentUnavailable = signal(false);

  /** Whether a sync is currently in progress. */
  readonly syncing = signal(false);

  /** Error message from the last sync attempt, or null. */
  readonly syncError = signal<string | null>(null);

  /**
   * Check whether the given element is unavailable and update `documentUnavailable`.
   * Cancels any in-flight check via a token to avoid stale updates.
   */
  async checkAvailability(
    elementId: string,
    docType: 'document' | 'worldbuilding' = 'document'
  ): Promise<void> {
    const token = ++this.availabilityCheckToken;
    this.documentUnavailable.set(false);

    if (!elementId) return;

    const unavailable = await this.projectState.isDocumentUnavailable(
      elementId,
      docType
    );
    if (token !== this.availabilityCheckToken) return;
    this.documentUnavailable.set(unavailable);
  }

  /**
   * Trigger a sync for the current project, then re-check document availability.
   */
  async triggerSync(
    elementId: string,
    docType: 'document' | 'worldbuilding' = 'document'
  ): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    this.syncing.set(true);
    this.syncError.set(null);

    await this.syncQueueService.syncAllProjects([project]);

    // syncAllProjects swallows errors internally; inspect queue state for failures
    const state = this.syncQueueService.queueState();
    if (state.failedProjects > 0) {
      this.syncError.set('Sync failed. Check your connection and try again.');
      this.syncing.set(false);
      return;
    }

    // Re-check availability after sync
    if (elementId) {
      const token = ++this.availabilityCheckToken;
      const unavailable = await this.projectState.isDocumentUnavailable(
        elementId,
        docType
      );
      if (token === this.availabilityCheckToken) {
        this.documentUnavailable.set(unavailable);
      }
    }

    if (this.documentUnavailable()) {
      this.syncError.set('Document still unavailable after sync. Try again.');
    }

    this.syncing.set(false);
  }
}
