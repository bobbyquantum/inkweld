import { inject, Injectable } from '@angular/core';
import { Element } from '@inkweld/index';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import {
  IElementSyncProvider,
  SyncConnectionConfig,
  SyncConnectionResult,
} from './element-sync-provider.interface';

/**
 * Offline implementation of the element sync provider.
 *
 * Uses OfflineProjectElementsService (Yjs + IndexedDB locally)
 * for local-only storage without server sync.
 *
 * This provider:
 * - Always reports DocumentSyncState.Offline
 * - Persists elements to IndexedDB via OfflineProjectElementsService
 * - Does not require network connectivity
 */
@Injectable({
  providedIn: 'root',
})
export class OfflineElementSyncProvider implements IElementSyncProvider {
  private readonly logger = inject(LoggerService);
  private readonly offlineService = inject(OfflineProjectElementsService);

  // Connection state
  private connected = false;
  private currentUsername: string | null = null;
  private currentSlug: string | null = null;

  // Publish plans storage (uses same Yjs + IndexedDB pattern as elements)
  private plansDoc: Y.Doc | null = null;
  private plansProvider: IndexeddbPersistence | null = null;

  // State subjects
  private readonly syncStateSubject = new BehaviorSubject<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );
  private readonly elementsSubject = new BehaviorSubject<Element[]>([]);
  private readonly publishPlansSubject = new BehaviorSubject<PublishPlan[]>([]);
  private readonly errorsSubject = new Subject<string>();

  // Public observables
  readonly syncState$: Observable<DocumentSyncState> =
    this.syncStateSubject.asObservable();
  readonly elements$: Observable<Element[]> =
    this.elementsSubject.asObservable();
  readonly publishPlans$: Observable<PublishPlan[]> =
    this.publishPlansSubject.asObservable();
  readonly errors$: Observable<string> = this.errorsSubject.asObservable();

  /**
   * Connect to offline storage for a project.
   * Loads elements from IndexedDB.
   */
  async connect(config: SyncConnectionConfig): Promise<SyncConnectionResult> {
    const { username, slug } = config;

    // Disconnect any existing session first
    this.disconnect();

    this.logger.info(
      'OfflineSync',
      `🔌 Connecting to offline storage: ${username}/${slug}`
    );

    try {
      // Load elements from offline service
      await this.offlineService.loadElements(username, slug);

      // Set up publish plans storage
      await this.setupPublishPlansStorage(username, slug);

      this.currentUsername = username;
      this.currentSlug = slug;
      this.connected = true;

      // Update state
      const elements = this.offlineService.elements();
      this.elementsSubject.next(elements);
      this.syncStateSubject.next(DocumentSyncState.Offline);

      this.logger.info(
        'OfflineSync',
        `✅ Connected with ${elements.length} elements`
      );

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown offline error';
      this.logger.error('OfflineSync', 'Connection failed', error);
      this.errorsSubject.next(errorMessage);
      this.syncStateSubject.next(DocumentSyncState.Unavailable);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Set up Yjs + IndexedDB storage for publish plans.
   */
  private async setupPublishPlansStorage(
    username: string,
    slug: string
  ): Promise<void> {
    const docId = `${username}:${slug}:publishPlans`;

    this.plansDoc = new Y.Doc();
    this.plansProvider = new IndexeddbPersistence(docId, this.plansDoc);

    await this.plansProvider.whenSynced;

    // Set up observer
    const plansArray = this.plansDoc.getArray<PublishPlan>('plans');
    plansArray.observe(() => {
      this.publishPlansSubject.next(plansArray.toArray());
    });

    // Load initial data
    this.publishPlansSubject.next(plansArray.toArray());

    this.logger.debug(
      'OfflineSync',
      `Loaded ${plansArray.length} publish plans from IndexedDB`
    );
  }

  /**
   * Disconnect from offline storage.
   */
  disconnect(): void {
    if (!this.connected) return;

    this.logger.info(
      'OfflineSync',
      `🔌 Disconnecting from ${this.currentUsername}/${this.currentSlug}`
    );

    // Close the offline service connection
    if (this.currentUsername && this.currentSlug) {
      void this.offlineService.closeConnection(
        this.currentUsername,
        this.currentSlug
      );
    }

    // Clean up publish plans storage
    if (this.plansDoc) {
      this.plansDoc.destroy();
      this.plansDoc = null;
    }
    if (this.plansProvider) {
      void this.plansProvider.destroy();
      this.plansProvider = null;
    }

    this.currentUsername = null;
    this.currentSlug = null;
    this.connected = false;

    // Reset state
    this.elementsSubject.next([]);
    this.publishPlansSubject.next([]);
    this.syncStateSubject.next(DocumentSyncState.Unavailable);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSyncState(): DocumentSyncState {
    return this.syncStateSubject.getValue();
  }

  getElements(): Element[] {
    return this.elementsSubject.getValue();
  }

  /**
   * Update elements in offline storage.
   * Updates local state immediately (optimistic update) then persists to storage.
   */
  updateElements(elements: Element[]): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn('OfflineSync', 'Cannot update elements - not connected');
      return;
    }

    // Update local state immediately (optimistic update)
    this.elementsSubject.next(elements);

    // Save to offline service asynchronously
    void this.offlineService
      .saveElements(this.currentUsername, this.currentSlug, elements)
      .then(() => {
        this.logger.debug('OfflineSync', `Saved ${elements.length} elements`);
      })
      .catch(error => {
        this.logger.error('OfflineSync', 'Failed to save elements', error);
        this.errorsSubject.next('Failed to save elements offline');
      });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Publish Plans
  // ─────────────────────────────────────────────────────────────────────────────

  getPublishPlans(): PublishPlan[] {
    return this.publishPlansSubject.getValue();
  }

  /**
   * Update publish plans in offline storage.
   */
  updatePublishPlans(plans: PublishPlan[]): void {
    if (!this.connected || !this.plansDoc) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update publish plans - not connected'
      );
      return;
    }

    const plansArray = this.plansDoc.getArray<PublishPlan>('plans');

    this.plansDoc.transact(() => {
      plansArray.delete(0, plansArray.length);
      plansArray.insert(0, plans);
    });

    this.logger.debug('OfflineSync', `Saved ${plans.length} publish plans`);
  }
}
