import { inject, Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';

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
 * In online mode, ensures all documents are synced from the server.
 * In offline mode, verifies all documents are available in IndexedDB.
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
    const elements = this.projectStateService.elements();
    const documentsToCheck = this.getDocumentsToSync(elements, elementIds);
    const missing: string[] = [];

    for (const doc of documentsToCheck) {
      const isAvailable = await this.checkDocumentAvailable(doc.id);
      if (!isAvailable) {
        missing.push(doc.id);
      }
    }

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
   * Sync a list of documents
   */
  private async syncDocumentList(
    documents: DocumentSyncStatus[],
    result: SyncResult
  ): Promise<void> {
    const total = documents.length;
    let completed = 0;

    this.updateProgress({
      phase: SyncPhase.SyncingDocuments,
      message: `Syncing documents (0/${total})...`,
      totalItems: total,
      completedItems: 0,
    });

    for (const doc of documents) {
      if (this.isCancelled) return;

      this.updateProgress({
        currentItem: doc.name,
        detail: `Syncing "${doc.name}"...`,
      });

      try {
        await this.syncDocument(doc.id);
        doc.synced = true;
        result.syncedDocuments.push(doc.id);
      } catch (error) {
        doc.synced = false;
        doc.error = error instanceof Error ? error.message : 'Unknown error';
        result.failedDocuments.push(doc.id);
        result.warnings.push(`Failed to sync "${doc.name}": ${doc.error}`);
        this.logger.warn(
          'ProjectSyncService',
          `Failed to sync document ${doc.id}`,
          error
        );
      }

      completed++;
      const progress = 10 + (completed / total) * 70; // 10-80%
      this.updateProgress({
        overallProgress: Math.round(progress),
        message: `Syncing documents (${completed}/${total})...`,
        completedItems: completed,
      });
    }
  }

  /**
   * Sync a single document
   */
  private async syncDocument(documentId: string): Promise<void> {
    const config = this.setupService.appConfig();

    if (config?.mode === 'server') {
      // In server mode, we need to ensure the document is synced via WebSocket
      // The DocumentService handles this, but we may need to wait for sync
      await this.waitForDocumentSync(documentId);
    } else {
      // In offline mode, just verify it exists in IndexedDB
      const available = await this.checkDocumentAvailable(documentId);
      if (!available) {
        throw new Error('Document not available in offline storage');
      }
    }
  }

  /**
   * Wait for a document to be synced via WebSocket
   */
  private async waitForDocumentSync(
    documentId: string,
    timeoutMs = 10000
  ): Promise<void> {
    const startTime = Date.now();

    // Check if document is already synced
    const syncSignal = this.documentService.getSyncStatusSignal(documentId);

    while (Date.now() - startTime < timeoutMs) {
      const status = syncSignal();

      // Check if document is synced or at least available offline
      if (
        status === DocumentSyncState.Synced ||
        status === DocumentSyncState.Local
      ) {
        return;
      }

      await this.delay(100);
    }

    throw new Error(`Timeout waiting for document sync: ${documentId}`);
  }

  /**
   * Check if a document is available in IndexedDB
   */
  private async checkDocumentAvailable(documentId: string): Promise<boolean> {
    try {
      // Try to get the document from IndexedDB
      // We check if there's any data stored for this document
      const dbName = documentId;
      const request = indexedDB.open(dbName);

      return new Promise(resolve => {
        request.onsuccess = () => {
          const db = request.result;
          const hasData = db.objectStoreNames.length > 0;
          db.close();
          resolve(hasData);
        };
        request.onerror = () => {
          resolve(false);
        };
      });
    } catch {
      return false;
    }
  }

  /**
   * Sync assets (images, files) for elements
   */
  private async syncAssets(
    allElements: Element[],
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

    // Suppress unused parameter warnings
    void allElements;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
