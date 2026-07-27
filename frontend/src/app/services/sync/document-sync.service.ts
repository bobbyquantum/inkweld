import { inject, signal } from '@angular/core';
import { SetupService } from '@services/core/setup.service';
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
  private readonly setupService = inject(SetupService);

  private availabilityCheckToken = 0;

  /**
   * Tracks the element ID for which auto-sync has been attempted.
   * Prevents repeated auto-sync attempts for the same document.
   */
  private autoSyncAttemptedFor: string | null = null;

  /** Whether the current document is unavailable (remote, not yet synced). */
  readonly documentUnavailable = signal(false);

  /** Whether a sync is currently in progress. */
  readonly syncing = signal(false);

  /** Error message from the last sync attempt, or null. */
  readonly syncError = signal<string | null>(null);

  /**
   * Check whether the given element is unavailable and update `documentUnavailable`.
   * Cancels any in-flight check via a token to avoid stale updates.
   *
   * If the document is unavailable and the user is online in server mode,
   * automatically triggers a sync (once per document).
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

    if (unavailable) {
      void this.maybeAutoSync(elementId, docType, token);
    }
  }

  /**
   * Auto-trigger sync if online and in server mode.
   * Only attempts once per document to avoid repeated sync loops.
   *
   * @param availabilityToken - The token from checkAvailability, preserved so
   *   the post-sync re-check doesn't overwrite a newer document's state.
   */
  private async maybeAutoSync(
    elementId: string,
    docType: 'document' | 'worldbuilding',
    availabilityToken: number
  ): Promise<void> {
    if (this.syncing()) return;
    if (this.autoSyncAttemptedFor === elementId) return;
    if (!navigator.onLine) return;
    if (this.setupService.getMode() !== 'server') return;

    this.autoSyncAttemptedFor = elementId;
    await this.triggerSync(elementId, docType, availabilityToken);
  }

  /**
   * Trigger a sync for the current project, then re-check document availability.
   * The document being synced is prioritized so it downloads first.
   *
   * @param availabilityToken - Optional token from checkAvailability. When provided,
   *   the post-sync re-check uses this token instead of creating a new one, preventing
   *   an older document's sync from overwriting a newer document's availability state.
   */
  async triggerSync(
    elementId: string,
    docType: 'document' | 'worldbuilding' = 'document',
    availabilityToken?: number
  ): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    this.syncing.set(true);
    this.syncError.set(null);

    // Build the full document ID for prioritization
    const priorityDocumentId = elementId
      ? `${project.username}:${project.slug}:${elementId}`
      : undefined;

    await this.syncQueueService.syncAllProjects([project], priorityDocumentId);

    // syncAllProjects swallows errors internally; inspect queue state for failures
    const state = this.syncQueueService.queueState();
    if (state.failedProjects > 0) {
      this.syncError.set('Sync failed. Check your connection and try again.');
      this.syncing.set(false);
      return;
    }

    // Re-check availability after sync.
    // Use the provided token (from auto-sync) or create a new one (manual sync).
    // This prevents an older document's sync from overwriting newer state.
    if (elementId) {
      const token = availabilityToken ?? ++this.availabilityCheckToken;
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
