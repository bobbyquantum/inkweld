import { inject, Injectable } from '@angular/core';
import { Element } from '@inkweld/index';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { ElementTag, TagDefinition } from '../../components/tags/tag.model';
import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import {
  IElementSyncProvider,
  ProjectMeta,
  SyncConnectionConfig,
  SyncConnectionResult,
} from './element-sync-provider.interface';

/**
 * Offline implementation of the element sync provider.
 *
 * Uses OfflineProjectElementsService (Yjs + IndexedDB locally)
 * for local-only storage without server sync.
 *
 * All project metadata (elements, publish plans, relationships, custom types, schemas)
 * is stored in a SINGLE Yjs document, matching the online YjsElementSyncProvider.
 *
 * This provider:
 * - Always reports DocumentSyncState.Offline
 * - Persists all data to IndexedDB via OfflineProjectElementsService
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

  // State subjects
  private readonly syncStateSubject = new BehaviorSubject<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );
  private readonly elementsSubject = new BehaviorSubject<Element[]>([]);
  private readonly publishPlansSubject = new BehaviorSubject<PublishPlan[]>([]);
  private readonly relationshipsSubject = new BehaviorSubject<
    ElementRelationship[]
  >([]);
  private readonly customRelationshipTypesSubject = new BehaviorSubject<
    RelationshipTypeDefinition[]
  >([]);
  private readonly schemasSubject = new BehaviorSubject<ElementTypeSchema[]>(
    []
  );
  private readonly elementTagsSubject = new BehaviorSubject<ElementTag[]>([]);
  private readonly customTagsSubject = new BehaviorSubject<TagDefinition[]>([]);
  private readonly projectMetaSubject = new BehaviorSubject<
    ProjectMeta | undefined
  >(undefined);
  private readonly errorsSubject = new Subject<string>();

  // Public observables
  readonly syncState$: Observable<DocumentSyncState> =
    this.syncStateSubject.asObservable();
  readonly elements$: Observable<Element[]> =
    this.elementsSubject.asObservable();
  readonly publishPlans$: Observable<PublishPlan[]> =
    this.publishPlansSubject.asObservable();
  readonly relationships$: Observable<ElementRelationship[]> =
    this.relationshipsSubject.asObservable();
  readonly customRelationshipTypes$: Observable<RelationshipTypeDefinition[]> =
    this.customRelationshipTypesSubject.asObservable();
  readonly schemas$: Observable<ElementTypeSchema[]> =
    this.schemasSubject.asObservable();
  readonly elementTags$: Observable<ElementTag[]> =
    this.elementTagsSubject.asObservable();
  readonly customTags$: Observable<TagDefinition[]> =
    this.customTagsSubject.asObservable();
  readonly projectMeta$: Observable<ProjectMeta | undefined> =
    this.projectMetaSubject.asObservable();
  readonly errors$: Observable<string> = this.errorsSubject.asObservable();

  /**
   * Connect to offline storage for a project.
   * Loads all project data from IndexedDB.
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
      // Load all project data from the unified offline service
      await this.offlineService.loadElements(username, slug);

      this.currentUsername = username;
      this.currentSlug = slug;
      this.connected = true;

      // Update state from the unified service
      const elements = this.offlineService.elements();
      const publishPlans = this.offlineService.publishPlans();
      const relationships = this.offlineService.relationships();
      const customTypes = this.offlineService.customRelationshipTypes();
      const schemas = this.offlineService.schemas();
      const elementTags = this.offlineService.elementTags();
      const customTags = this.offlineService.customTags();
      const projectMeta = this.offlineService.projectMeta();

      this.elementsSubject.next(elements);
      this.publishPlansSubject.next(publishPlans);
      this.relationshipsSubject.next(relationships);
      this.customRelationshipTypesSubject.next(customTypes);
      this.schemasSubject.next(schemas);
      this.elementTagsSubject.next(elementTags);
      this.customTagsSubject.next(customTags);
      this.projectMetaSubject.next(projectMeta);
      this.syncStateSubject.next(DocumentSyncState.Offline);

      this.logger.info(
        'OfflineSync',
        `✅ Connected with ${elements.length} elements, ` +
          `${publishPlans.length} publish plans, ${relationships.length} relationships, ` +
          `${schemas.length} schemas, ${elementTags.length} element tags`
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

    this.currentUsername = null;
    this.currentSlug = null;
    this.connected = false;

    // Reset state
    this.elementsSubject.next([]);
    this.publishPlansSubject.next([]);
    this.relationshipsSubject.next([]);
    this.customRelationshipTypesSubject.next([]);
    this.schemasSubject.next([]);
    this.elementTagsSubject.next([]);
    this.customTagsSubject.next([]);
    this.projectMetaSubject.next(undefined);
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
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update publish plans - not connected'
      );
      return;
    }

    // Update local state immediately
    this.publishPlansSubject.next(plans);

    // Save to offline service asynchronously
    void this.offlineService
      .savePublishPlans(this.currentUsername, this.currentSlug, plans)
      .then(() => {
        this.logger.debug('OfflineSync', `Saved ${plans.length} publish plans`);
      })
      .catch(error => {
        this.logger.error('OfflineSync', 'Failed to save publish plans', error);
        this.errorsSubject.next('Failed to save publish plans offline');
      });
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Relationships (centralized in project)
  // ───────────────────────────────────────────────────────────────────────────────

  getRelationships(): ElementRelationship[] {
    return this.relationshipsSubject.getValue();
  }

  /**
   * Update relationships in offline storage.
   */
  updateRelationships(relationships: ElementRelationship[]): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update relationships - not connected'
      );
      return;
    }

    // Update local state immediately
    this.relationshipsSubject.next(relationships);

    // Save to offline service asynchronously
    void this.offlineService
      .saveRelationships(this.currentUsername, this.currentSlug, relationships)
      .then(() => {
        this.logger.debug(
          'OfflineSync',
          `Saved ${relationships.length} relationships`
        );
      })
      .catch(error => {
        this.logger.error('OfflineSync', 'Failed to save relationships', error);
        this.errorsSubject.next('Failed to save relationships offline');
      });
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Custom Relationship Types (project-specific)
  // ───────────────────────────────────────────────────────────────────────────────

  getCustomRelationshipTypes(): RelationshipTypeDefinition[] {
    return this.customRelationshipTypesSubject.getValue();
  }

  /**
   * Update custom relationship types in offline storage.
   */
  updateCustomRelationshipTypes(types: RelationshipTypeDefinition[]): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update custom relationship types - not connected'
      );
      return;
    }

    // Update local state immediately
    this.customRelationshipTypesSubject.next(types);

    // Save to offline service asynchronously
    void this.offlineService
      .saveCustomRelationshipTypes(
        this.currentUsername,
        this.currentSlug,
        types
      )
      .then(() => {
        this.logger.debug(
          'OfflineSync',
          `Saved ${types.length} custom relationship types`
        );
      })
      .catch(error => {
        this.logger.error(
          'OfflineSync',
          'Failed to save custom relationship types',
          error
        );
        this.errorsSubject.next(
          'Failed to save custom relationship types offline'
        );
      });
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Worldbuilding Schemas
  // ───────────────────────────────────────────────────────────────────────────────

  getSchemas(): ElementTypeSchema[] {
    return this.schemasSubject.getValue();
  }

  /**
   * Update schemas in offline storage.
   */
  updateSchemas(schemas: ElementTypeSchema[]): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn('OfflineSync', 'Cannot update schemas - not connected');
      return;
    }

    // Update local state immediately
    this.schemasSubject.next(schemas);

    // Save to offline service asynchronously
    void this.offlineService
      .saveSchemas(this.currentUsername, this.currentSlug, schemas)
      .then(() => {
        this.logger.debug('OfflineSync', `Saved ${schemas.length} schemas`);
      })
      .catch(error => {
        this.logger.error('OfflineSync', 'Failed to save schemas', error);
        this.errorsSubject.next('Failed to save schemas offline');
      });
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Element Tags (tag assignments)
  // ───────────────────────────────────────────────────────────────────────────────

  getElementTags(): ElementTag[] {
    return this.elementTagsSubject.getValue();
  }

  /**
   * Update element tags in offline storage.
   */
  updateElementTags(tags: ElementTag[]): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update element tags - not connected'
      );
      return;
    }

    // Update local state immediately
    this.elementTagsSubject.next(tags);

    // Save to offline service asynchronously
    void this.offlineService
      .saveElementTags(this.currentUsername, this.currentSlug, tags)
      .then(() => {
        this.logger.debug('OfflineSync', `Saved ${tags.length} element tags`);
      })
      .catch(error => {
        this.logger.error('OfflineSync', 'Failed to save element tags', error);
        this.errorsSubject.next('Failed to save element tags offline');
      });
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Custom Tag Definitions (project-specific tag types)
  // ───────────────────────────────────────────────────────────────────────────────

  getCustomTags(): TagDefinition[] {
    return this.customTagsSubject.getValue();
  }

  /**
   * Update custom tag definitions in offline storage.
   */
  updateCustomTags(tags: TagDefinition[]): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update custom tags - not connected'
      );
      return;
    }

    // Update local state immediately
    this.customTagsSubject.next(tags);

    // Save to offline service asynchronously
    void this.offlineService
      .saveCustomTags(this.currentUsername, this.currentSlug, tags)
      .then(() => {
        this.logger.debug('OfflineSync', `Saved ${tags.length} custom tags`);
      })
      .catch(error => {
        this.logger.error('OfflineSync', 'Failed to save custom tags', error);
        this.errorsSubject.next('Failed to save custom tags offline');
      });
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Project Metadata (name, description, cover - synced via Yjs for offline-first)
  // ───────────────────────────────────────────────────────────────────────────────

  getProjectMeta(): ProjectMeta | undefined {
    return this.projectMetaSubject.getValue();
  }

  /**
   * Update project metadata in offline storage.
   * Only updates the fields provided (partial update).
   */
  updateProjectMeta(meta: Partial<ProjectMeta>): void {
    if (!this.connected || !this.currentUsername || !this.currentSlug) {
      this.logger.warn(
        'OfflineSync',
        'Cannot update project metadata - not connected'
      );
      return;
    }

    // Merge with current values
    const current = this.projectMetaSubject.getValue();
    const updated: ProjectMeta = {
      name: meta.name ?? current?.name ?? '',
      description: meta.description ?? current?.description ?? '',
      coverMediaId: meta.coverMediaId ?? current?.coverMediaId,
      updatedAt: new Date().toISOString(),
    };

    // Update local state immediately
    this.projectMetaSubject.next(updated);

    // Save to offline service asynchronously
    void this.offlineService
      .saveProjectMeta(this.currentUsername, this.currentSlug, updated)
      .then(() => {
        this.logger.debug('OfflineSync', 'Saved project metadata', updated);
      })
      .catch(error => {
        this.logger.error(
          'OfflineSync',
          'Failed to save project metadata',
          error
        );
        this.errorsSubject.next('Failed to save project metadata offline');
      });
  }
}
