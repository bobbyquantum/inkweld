import { inject, Injectable } from '@angular/core';
import { chunk, forEachSequential } from '@inkweld/async';
import { type Element, ElementType } from '@inkweld/index';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { DocumentSyncPlannerService } from '../sync/document-sync-planner.service';

/** Concurrent headless document syncs, matching the bulk "Sync All" path. */
const DOCUMENT_SYNC_CONCURRENCY = 3;

/** The parts of the current project that address its documents. */
type ProjectRef = { username: string; slug: string };

/**
 * Progress information for sync operations
 */
export interface SyncProgress {
  /** Current phase */
  phase: SyncPhase;
  /** Overall progress (0-100) */
  overallProgress: number;
  /** Human-readable status message */
  message: string;
  /** Detailed sub-message */
  detail?: string;
  /** Current item being processed */
  currentItem?: string;
  /** Total items to process */
  totalItems: number;
  /** Items completed */
  completedItems: number;
  /** Items that failed to sync */
  failedItems: string[];
  /** Warnings accumulated */
  warnings: string[];
}

/**
 * Phases of sync operation
 */
export enum SyncPhase {
  Idle = 'idle',
  Analyzing = 'analyzing',
  SyncingDocuments = 'syncing-documents',
  SyncingAssets = 'syncing-assets',
  Verifying = 'verifying',
  Complete = 'complete',
  Error = 'error',
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  /** Documents that were synced */
  syncedDocuments: string[];
  /** Documents that failed to sync */
  failedDocuments: string[];
  /** Assets that were synced */
  syncedAssets: string[];
  /** Assets that failed to sync */
  failedAssets: string[];
  /** Warnings */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Document sync status
 */
interface DocumentSyncStatus {
  id: string;
  name: string;
  synced: boolean;
  error?: string;
}

/**
 * Service for synchronizing project content before publishing.
 *
 * In server mode (online), merges each document with the server through a
 * headless sync so the latest content is published. Otherwise (local mode,
 * or offline) it verifies each document has a local copy.
 *
 * Provides detailed progress callbacks for UI feedback.
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectSyncService {
  private readonly logger = inject(LoggerService);
  private readonly setupService = inject(SetupService);
  private readonly documentService = inject(DocumentService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly syncPlanner = inject(DocumentSyncPlannerService);

  // Progress state
  private readonly progressSubject = new BehaviorSubject<SyncProgress>({
    phase: SyncPhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
    failedItems: [],
    warnings: [],
  });

  private readonly completeSubject = new Subject<SyncResult>();
  private isCancelled = false;

  /** Observable stream of progress updates */
  readonly progress$: Observable<SyncProgress> =
    this.progressSubject.asObservable();

  /** Emits when sync is complete */
  readonly complete$: Observable<SyncResult> =
    this.completeSubject.asObservable();

  /** Current progress value */
  get currentProgress(): SyncProgress {
    return this.progressSubject.getValue();
  }

  /**
   * Cancel an ongoing sync operation
   */
  cancel(): void {
    this.isCancelled = true;
    this.updateProgress({
      phase: SyncPhase.Idle,
      message: 'Sync cancelled',
    });
  }

  /**
   * Sync all documents for a list of element IDs.
   * This ensures all documents are available locally before publishing.
   *
   * @param elementIds - IDs of elements to sync
   * @param includeAssets - Whether to also sync images and files
   * @returns Promise resolving to sync result
   */
  async syncDocuments(
    elementIds: string[],
    includeAssets = true
  ): Promise<SyncResult> {
    this.isCancelled = false;
    const result: SyncResult = {
      success: true,
      syncedDocuments: [],
      failedDocuments: [],
      syncedAssets: [],
      failedAssets: [],
      warnings: [],
    };

    try {
      // Phase 1: Analyze what needs to be synced
      this.updateProgress({
        phase: SyncPhase.Analyzing,
        overallProgress: 5,
        message: 'Analyzing documents...',
        totalItems: elementIds.length,
        completedItems: 0,
      });

      const elements = this.projectStateService.elements();
      const documentsToSync = this.getDocumentsToSync(elements, elementIds);

      if (documentsToSync.length === 0) {
        this.updateProgress({
          phase: SyncPhase.Complete,
          overallProgress: 100,
          message: 'No documents to sync',
          totalItems: 0,
          completedItems: 0,
        });
        this.completeSubject.next(result);
        return result;
      }

      // Phase 2: Sync documents
      await this.syncDocumentList(documentsToSync, result);

      if (this.isCancelled) {
        result.success = false;
        result.error = 'Sync cancelled by user';
        this.completeSubject.next(result);
        return result;
      }

      // Phase 3: Sync assets if requested
      if (includeAssets) {
        await this.syncAssets(elements, elementIds, result);
      }

      if (this.isCancelled) {
        result.success = false;
        result.error = 'Sync cancelled by user';
        this.completeSubject.next(result);
        return result;
      }

      // Phase 4: Verify
      this.updateProgress({
        phase: SyncPhase.Verifying,
        overallProgress: 95,
        message: 'Verifying sync...',
      });

      await this.delay(100); // Brief pause for UI feedback

      // Complete
      result.success = result.failedDocuments.length === 0;
      this.updateProgress({
        phase: SyncPhase.Complete,
        overallProgress: 100,
        message: result.success
          ? `Synced ${result.syncedDocuments.length} documents`
          : `Sync completed with ${result.failedDocuments.length} errors`,
        warnings: result.warnings,
      });

      this.completeSubject.next(result);
      return result;
    } catch (error) {
      this.logger.error('ProjectSyncService', 'Sync failed', error);
      result.success = false;
      result.error =
        error instanceof Error ? error.message : 'Unknown sync error';

      this.updateProgress({
        phase: SyncPhase.Error,
        overallProgress: 0,
        message: result.error,
      });

      this.completeSubject.next(result);
      return result;
    }
  }

  /**
   * Quick check if all documents are available locally.
   * Does not attempt to sync, just verifies.
   */
  async verifyLocalAvailability(
    elementIds: string[]
  ): Promise<{ available: boolean; missing: string[] }> {
    const project = this.projectStateService.project();
    const elements = this.projectStateService.elements();
    const documentsToCheck = this.getDocumentsToSync(elements, elementIds);

    // Independent read-only checks; Promise.all keeps the document order.
    const availability = await Promise.all(
      documentsToCheck.map(
        async doc =>
          !!project &&
          (await this.hasLocalCopy(this.fullDocumentId(project, doc.id)))
      )
    );
    const missing = documentsToCheck
      .filter((_, index) => !availability[index])
      .map(doc => doc.id);

    return {
      available: missing.length === 0,
      missing,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private updateProgress(updates: Partial<SyncProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({
      ...current,
      ...updates,
    });
  }

  /**
   * Get list of document elements that need to be synced
   */
  private getDocumentsToSync(
    allElements: Element[],
    elementIds: string[]
  ): DocumentSyncStatus[] {
    const documents: DocumentSyncStatus[] = [];
    const elementIdSet = new Set(elementIds);

    for (const element of allElements) {
      // Include element if it's in the list or is a descendant
      const shouldInclude =
        elementIdSet.has(element.id) ||
        this.isDescendantOf(element, elementIdSet, allElements);

      if (shouldInclude && element.type === ElementType.Item) {
        documents.push({
          id: element.id,
          name: element.name,
          synced: false,
        });
      }
    }

    return documents;
  }

  /**
   * Check if an element is a descendant of any element in the set
   */
  private isDescendantOf(
    element: Element,
    ancestorIds: Set<string>,
    allElements: Element[]
  ): boolean {
    if (!element.parentId) return false;
    if (ancestorIds.has(element.parentId)) return true;

    const parent = allElements.find(e => e.id === element.parentId);
    if (!parent) return false;

    return this.isDescendantOf(parent, ancestorIds, allElements);
  }

  /**
   * Sync a list of documents.
   *
   * In server mode (and online) each document's local copy is merged with the
   * server's through a headless WebSocket sync, so the generators — which read
   * the open connection or IndexedDB — publish the latest server content.
   * Otherwise the local copies are only checked for presence.
   */
  private async syncDocumentList(
    documents: DocumentSyncStatus[],
    result: SyncResult
  ): Promise<void> {
    const project = this.projectStateService.project();
    if (!project) {
      throw new Error('No project loaded');
    }

    this.updateProgress({
      phase: SyncPhase.SyncingDocuments,
      overallProgress: 10,
      message: `Syncing documents (0/${documents.length})...`,
      totalItems: documents.length,
      completedItems: 0,
    });

    const serverMode = this.setupService.isServerMode();
    if (serverMode && this.isOnline()) {
      await this.pullFromServer(project, documents, result);
    } else {
      if (serverMode) {
        result.warnings.push(
          'Offline: publishing from the copies saved on this device'
        );
      }
      await this.checkLocalCopies(project, documents, result, serverMode);
    }
  }

  /**
   * Headless-sync every document that is not open in an editor. Open
   * documents already have a live connection, which the generators read.
   * Documents unchanged on both sides since this device's last sync are
   * skipped using the bulk-sync planner.
   */
  private async pullFromServer(
    project: ProjectRef,
    documents: DocumentSyncStatus[],
    result: SyncResult
  ): Promise<void> {
    const { username, slug } = project;
    const connected = new Set(this.documentService.getConnectedDocumentIds());
    const byDocId = new Map(
      documents.map(doc => [this.fullDocumentId(project, doc.id), doc])
    );

    const headless: string[] = [];
    for (const [docId, doc] of byDocId) {
      if (connected.has(docId)) {
        this.markSynced(doc, result);
      } else {
        headless.push(docId);
      }
    }

    const plan = await this.syncPlanner.plan(username, slug, headless);
    for (const docId of plan.skipped) {
      this.markSynced(byDocId.get(docId)!, result);
    }
    const done = () =>
      result.syncedDocuments.length + result.failedDocuments.length;
    this.reportDocumentProgress(done(), documents.length);

    const digests = new Map<string, string>();
    // Sequential batches: each batch syncs concurrently, and the next one only
    // starts once it has finished (and the publish was not cancelled).
    await forEachSequential(
      chunk(plan.toSync, DOCUMENT_SYNC_CONCURRENCY),
      async batch => {
        if (this.isCancelled) return;
        this.updateProgress({
          currentItem: byDocId.get(batch[0])!.name,
          detail: `Syncing "${byDocId.get(batch[0])!.name}"...`,
        });

        await Promise.all(
          batch.map(async docId => {
            const doc = byDocId.get(docId)!;
            try {
              const digest =
                await this.documentService.syncDocumentToServer(docId);
              if (digest === null) {
                throw new Error('Server connection unavailable');
              }
              digests.set(docId, digest);
              this.markSynced(doc, result);
            } catch (error) {
              await this.handleSyncFailure(docId, doc, error, result);
            }
          })
        );
        this.reportDocumentProgress(done(), documents.length);
      }
    );

    await this.syncPlanner.record(username, slug, plan.before, digests);
  }

  /**
   * A failed server sync is only fatal for a document with no local copy;
   * otherwise publishing proceeds from the local copy, with a warning.
   */
  private async handleSyncFailure(
    docId: string,
    doc: DocumentSyncStatus,
    error: unknown,
    result: SyncResult
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.warn(
      'ProjectSyncService',
      `Failed to sync document ${docId}`,
      error
    );

    if (await this.hasLocalCopy(docId)) {
      this.markSynced(doc, result);
      result.warnings.push(
        `Could not sync "${doc.name}" (${message}); using the copy on this device`
      );
      return;
    }

    doc.synced = false;
    doc.error = message;
    result.failedDocuments.push(doc.id);
    result.warnings.push(`Failed to sync "${doc.name}": ${message}`);
  }

  /**
   * Without a server to pull from, check each document has a local copy. In
   * local mode a missing copy is a document nobody has written in yet, so it
   * is only a warning; in server mode (offline) its content is unavailable.
   */
  private async checkLocalCopies(
    project: ProjectRef,
    documents: DocumentSyncStatus[],
    result: SyncResult,
    missingIsFailure: boolean
  ): Promise<void> {
    // Sequential: progress is reported per document, in order.
    await forEachSequential(documents, async (doc, index) => {
      if (this.isCancelled) return;
      this.updateProgress({
        currentItem: doc.name,
        detail: `Checking "${doc.name}"...`,
      });

      if (await this.hasLocalCopy(this.fullDocumentId(project, doc.id))) {
        this.markSynced(doc, result);
      } else if (missingIsFailure) {
        doc.error = 'Document not available on this device';
        result.failedDocuments.push(doc.id);
        result.warnings.push(`"${doc.name}" is not available offline`);
      } else {
        result.warnings.push(`"${doc.name}" has no content`);
      }
      this.reportDocumentProgress(index + 1, documents.length);
    });
  }

  private markSynced(doc: DocumentSyncStatus, result: SyncResult): void {
    doc.synced = true;
    result.syncedDocuments.push(doc.id);
  }

  private reportDocumentProgress(completed: number, total: number): void {
    this.updateProgress({
      overallProgress: Math.round(10 + (completed / total) * 70), // 10-80%
      message: `Syncing documents (${completed}/${total})...`,
      completedItems: completed,
    });
  }

  /**
   * Whether a document has content on this device: an open connection, or
   * Yjs updates in its profile-scoped IndexedDB database.
   */
  private async hasLocalCopy(documentId: string): Promise<boolean> {
    try {
      return await this.documentService.hasLocalContent(documentId);
    } catch {
      return false;
    }
  }

  /** Full document id (`username:slug:elementId`) as DocumentService keys it. */
  private fullDocumentId(project: ProjectRef, elementId: string): string {
    return `${project.username}:${project.slug}:${elementId}`;
  }

  private isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  /**
   * Sync assets (images, files) for elements
   */
  private async syncAssets(
    _allElements: Element[],
    elementIds: string[],
    _result: SyncResult
  ): Promise<void> {
    this.updateProgress({
      phase: SyncPhase.SyncingAssets,
      overallProgress: 85,
      message: 'Checking assets...',
    });

    // For now, just mark as complete
    // Future implementation would scan ProseMirror content for images
    await this.delay(100);

    this.logger.debug(
      'ProjectSyncService',
      `Asset sync placeholder for ${elementIds.length} elements`
    );
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
