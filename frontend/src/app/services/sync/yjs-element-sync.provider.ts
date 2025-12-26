import { inject, Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { ElementTag, TagDefinition } from '../../components/tags/tag.model';
import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import {
  createAuthenticatedWebsocketProvider,
  setupReauthentication,
} from './authenticated-websocket-provider';
import {
  IElementSyncProvider,
  ProjectMeta,
  SyncConnectionConfig,
  SyncConnectionResult,
} from './element-sync-provider.interface';

/**
 * Configuration for reconnection behavior
 */
interface ReconnectionConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Yjs-based implementation of the element sync provider.
 *
 * Handles:
 * - Y.Doc lifecycle management
 * - WebSocket connection with exponential backoff reconnection
 * - IndexedDB persistence for offline support
 * - Sync state tracking and error handling
 * - Browser online/offline event handling
 *
 * This class encapsulates ALL Yjs-specific logic, making it:
 * - Testable in isolation
 * - Swappable for other sync backends
 * - Easier to maintain and debug
 */
@Injectable({
  providedIn: 'root',
})
export class YjsElementSyncProvider implements IElementSyncProvider {
  private readonly logger = inject(LoggerService);
  private readonly authTokenService = inject(AuthTokenService);

  // Yjs infrastructure
  private doc: Y.Doc | null = null;
  private wsProvider: WebsocketProvider | null = null;
  private idbProvider: IndexeddbPersistence | null = null;
  private docId: string | null = null;

  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectionConfig = DEFAULT_RECONNECTION_CONFIG;

  // Event listeners for cleanup
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

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

  // Flag to skip observer emission during local updates (prevents feedback loop)
  private isUpdatingProjectMeta = false;

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
   * Connect to a project's element sync.
   * Sets up Yjs doc, WebSocket provider, and IndexedDB persistence.
   */
  async connect(config: SyncConnectionConfig): Promise<SyncConnectionResult> {
    const { username, slug, webSocketUrl } = config;

    // Validate config
    if (!webSocketUrl) {
      return {
        success: false,
        error: 'WebSocket URL is required for Yjs sync',
      };
    }

    // Disconnect any existing session first
    this.disconnect();

    this.docId = `${username}:${slug}:elements`;
    this.logger.info(
      'YjsSync',
      `🔗 Connecting to elements document: "${this.docId}"`
    );

    // Set initial state to Syncing while we connect
    this.syncStateSubject.next(DocumentSyncState.Syncing);

    try {
      // Create new Yjs document
      this.doc = new Y.Doc();

      // Set up IndexedDB persistence FIRST for local-first experience
      // This ensures we have local data available immediately
      this.idbProvider = new IndexeddbPersistence(this.docId, this.doc);
      await this.idbProvider.whenSynced;
      this.logger.info('YjsSync', '✅ IndexedDB synced');

      // Load elements from local storage first
      this.loadElementsFromDoc();

      // Get auth token for WebSocket authentication
      const authToken = this.authTokenService.getToken();
      if (!authToken) {
        this.logger.error(
          'YjsSync',
          'No auth token available for WebSocket connection'
        );
        // Continue offline - we already have IndexedDB data
        this.syncStateSubject.next(DocumentSyncState.Offline);
        return { success: true };
      }

      // Now set up authenticated WebSocket connection for server sync
      // The server expects the auth token as the first text message after connection
      const wsUrl = `${webSocketUrl}/api/v1/ws/yjs?documentId=${this.docId}`;
      this.logger.info('YjsSync', `🌐 WebSocket URL: ${wsUrl}`);

      try {
        this.wsProvider = await createAuthenticatedWebsocketProvider(
          wsUrl,
          '',
          this.doc,
          authToken,
          {
            resyncInterval: 10000,
          }
        );

        // Authentication succeeded - we're now connected and synced
        // Set state immediately since the "connected" event already fired during auth
        this.syncStateSubject.next(DocumentSyncState.Synced);

        // Set up re-authentication for reconnections
        setupReauthentication(
          this.wsProvider,
          () => this.authTokenService.getToken(),
          error => {
            this.logger.error('YjsSync', `WebSocket auth error: ${error}`);
            this.syncStateSubject.next(DocumentSyncState.Unavailable);
          }
        );
      } catch (authError) {
        this.logger.error(
          'YjsSync',
          'Failed to authenticate WebSocket',
          authError
        );
        // Continue offline - we already have IndexedDB data
        this.syncStateSubject.next(DocumentSyncState.Offline);
        return { success: true };
      }

      // Set up event handlers before waiting for sync
      this.setupWebSocketHandlers();
      this.setupNetworkHandlers();
      this.setupDocumentObserver();

      // Don't wait for WebSocket sync - this is local-first
      // We already have data from IndexedDB, WebSocket syncs in background
      // The sync state will be updated via the 'sync' event handler
      this.logger.info(
        'YjsSync',
        '🔄 WebSocket connecting in background, local data ready'
      );

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown connection error';
      this.logger.error('YjsSync', 'Connection failed', error);
      this.errorsSubject.next(errorMessage);
      this.syncStateSubject.next(DocumentSyncState.Unavailable);

      // Clean up on failure
      this.disconnect();

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Disconnect from the current sync session.
   * Cleans up all resources in the correct order.
   */
  disconnect(): void {
    this.logger.info('YjsSync', `🔌 Disconnecting from ${this.docId || 'n/a'}`);

    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;

    // Remove network event listeners
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.offlineHandler) {
      window.removeEventListener('offline', this.offlineHandler);
      this.offlineHandler = null;
    }

    // Clean up in reverse order of creation:
    // 1. Destroy doc first (removes all bindings)
    // 2. Then destroy providers (no bindings to update)

    if (this.doc) {
      try {
        this.doc.destroy();
      } catch (error) {
        this.logger.warn('YjsSync', 'Error destroying Y.Doc', error);
      }
      this.doc = null;
    }

    if (this.idbProvider) {
      try {
        void this.idbProvider.destroy();
      } catch (error) {
        this.logger.warn(
          'YjsSync',
          'Error destroying IndexedDB provider',
          error
        );
      }
      this.idbProvider = null;
    }

    if (this.wsProvider) {
      try {
        this.wsProvider.destroy();
      } catch (error) {
        this.logger.warn(
          'YjsSync',
          'Error destroying WebSocket provider',
          error
        );
      }
      this.wsProvider = null;
    }

    this.docId = null;

    // Reset state
    this.elementsSubject.next([]);
    this.publishPlansSubject.next([]);
    this.relationshipsSubject.next([]);
    this.customRelationshipTypesSubject.next([]);
    this.schemasSubject.next([]);
    this.projectMetaSubject.next(undefined);
    this.syncStateSubject.next(DocumentSyncState.Unavailable);
  }

  isConnected(): boolean {
    return this.doc !== null && this.wsProvider !== null;
  }

  getSyncState(): DocumentSyncState {
    return this.syncStateSubject.getValue();
  }

  getElements(): Element[] {
    return this.elementsSubject.getValue();
  }

  /**
   * Update elements in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updateElements(elements: Element[]): void {
    if (!this.doc) {
      this.logger.warn('YjsSync', 'Cannot update elements - not connected');
      return;
    }

    this.logger.debug('YjsSync', `Writing ${elements.length} elements to Yjs`);

    // Optimistic update: emit immediately for responsive UI
    // The Yjs observer will also fire after the transaction, but that's fine
    // as it will emit the same elements (no-op for identical arrays)
    this.elementsSubject.next(elements);

    const elementsArray = this.doc.getArray<Element>('elements');

    this.doc.transact(() => {
      elementsArray.delete(0, elementsArray.length);
      elementsArray.insert(0, elements);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${elementsArray.length} elements`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Publish Plans
  // ─────────────────────────────────────────────────────────────────────────────

  getPublishPlans(): PublishPlan[] {
    return this.publishPlansSubject.getValue();
  }

  /**
   * Update publish plans in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updatePublishPlans(plans: PublishPlan[]): void {
    if (!this.doc) {
      this.logger.warn(
        'YjsSync',
        'Cannot update publish plans - not connected'
      );
      return;
    }

    this.logger.debug(
      'YjsSync',
      `Writing ${plans.length} publish plans to Yjs`
    );

    // Optimistic update: emit immediately for responsive UI
    this.publishPlansSubject.next(plans);

    const plansArray = this.doc.getArray<PublishPlan>('publishPlans');

    this.doc.transact(() => {
      plansArray.delete(0, plansArray.length);
      plansArray.insert(0, plans);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${plansArray.length} publish plans`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Relationships (centralized in project elements doc)
  // ─────────────────────────────────────────────────────────────────────────────

  getRelationships(): ElementRelationship[] {
    return this.relationshipsSubject.getValue();
  }

  /**
   * Update relationships in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updateRelationships(relationships: ElementRelationship[]): void {
    if (!this.doc) {
      this.logger.warn(
        'YjsSync',
        'Cannot update relationships - not connected'
      );
      return;
    }

    this.logger.debug(
      'YjsSync',
      `Writing ${relationships.length} relationships to Yjs`
    );

    // Optimistic update: emit immediately for responsive UI
    this.relationshipsSubject.next(relationships);

    const relationshipsArray =
      this.doc.getArray<ElementRelationship>('relationships');

    this.doc.transact(() => {
      relationshipsArray.delete(0, relationshipsArray.length);
      relationshipsArray.insert(0, relationships);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${relationshipsArray.length} relationships`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Custom Relationship Types (project-specific)
  // ─────────────────────────────────────────────────────────────────────────────

  getCustomRelationshipTypes(): RelationshipTypeDefinition[] {
    return this.customRelationshipTypesSubject.getValue();
  }

  /**
   * Update custom relationship types in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updateCustomRelationshipTypes(types: RelationshipTypeDefinition[]): void {
    if (!this.doc) {
      this.logger.warn(
        'YjsSync',
        'Cannot update custom relationship types - not connected'
      );
      return;
    }

    this.logger.debug(
      'YjsSync',
      `Writing ${types.length} custom relationship types to Yjs`
    );

    // Optimistic update: emit immediately for responsive UI
    this.customRelationshipTypesSubject.next(types);

    const typesArray = this.doc.getArray<RelationshipTypeDefinition>(
      'customRelationshipTypes'
    );

    this.doc.transact(() => {
      typesArray.delete(0, typesArray.length);
      typesArray.insert(0, types);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${typesArray.length} custom relationship types`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Worldbuilding Schemas (project template library)
  // ─────────────────────────────────────────────────────────────────────────────

  getSchemas(): ElementTypeSchema[] {
    return this.schemasSubject.getValue();
  }

  /**
   * Update schemas in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updateSchemas(schemas: ElementTypeSchema[]): void {
    if (!this.doc) {
      this.logger.warn('YjsSync', 'Cannot update schemas - not connected');
      return;
    }

    this.logger.debug('YjsSync', `Writing ${schemas.length} schemas to Yjs`);

    // Optimistic update: emit immediately for responsive UI
    this.schemasSubject.next(schemas);

    const schemasArray = this.doc.getArray<ElementTypeSchema>('schemas');

    this.doc.transact(() => {
      schemasArray.delete(0, schemasArray.length);
      schemasArray.insert(0, schemas);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${schemasArray.length} schemas`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Element Tags (tag assignments)
  // ─────────────────────────────────────────────────────────────────────────────

  getElementTags(): ElementTag[] {
    return this.elementTagsSubject.getValue();
  }

  /**
   * Update element tags in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updateElementTags(tags: ElementTag[]): void {
    if (!this.doc) {
      this.logger.warn('YjsSync', 'Cannot update element tags - not connected');
      return;
    }

    this.logger.debug('YjsSync', `Writing ${tags.length} element tags to Yjs`);

    // Optimistic update: emit immediately for responsive UI
    this.elementTagsSubject.next(tags);

    const tagsArray = this.doc.getArray<ElementTag>('elementTags');

    this.doc.transact(() => {
      tagsArray.delete(0, tagsArray.length);
      tagsArray.insert(0, tags);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${tagsArray.length} element tags`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Custom Tag Definitions (project-specific tag types)
  // ─────────────────────────────────────────────────────────────────────────────

  getCustomTags(): TagDefinition[] {
    return this.customTagsSubject.getValue();
  }

  /**
   * Update custom tag definitions in the Yjs document.
   * Changes propagate to all connected clients.
   * Applies optimistic update immediately for responsive UI.
   */
  updateCustomTags(tags: TagDefinition[]): void {
    if (!this.doc) {
      this.logger.warn('YjsSync', 'Cannot update custom tags - not connected');
      return;
    }

    this.logger.debug(
      'YjsSync',
      `Writing ${tags.length} custom tag definitions to Yjs`
    );

    // Optimistic update: emit immediately for responsive UI
    this.customTagsSubject.next(tags);

    const tagsArray = this.doc.getArray<TagDefinition>('customTags');

    this.doc.transact(() => {
      tagsArray.delete(0, tagsArray.length);
      tagsArray.insert(0, tags);
    });

    this.logger.debug(
      'YjsSync',
      `Yjs doc now contains ${tagsArray.length} custom tag definitions`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Metadata (name, description, cover - synced via Yjs for offline-first)
  // ─────────────────────────────────────────────────────────────────────────────

  getProjectMeta(): ProjectMeta | undefined {
    return this.projectMetaSubject.getValue();
  }

  /**
   * Update project metadata in the Yjs document.
   * Only updates the fields provided (partial update).
   * Applies optimistic update immediately for responsive UI.
   */
  updateProjectMeta(meta: Partial<ProjectMeta>): void {
    if (!this.doc) {
      this.logger.warn(
        'YjsSync',
        'Cannot update project metadata - not connected'
      );
      return;
    }

    this.logger.debug('YjsSync', 'Updating project metadata', meta);

    const metaMap = this.doc.getMap<string>('projectMeta');

    // Get current values and merge with new ones
    const current = this.projectMetaSubject.getValue();
    const updated: ProjectMeta = {
      name: meta.name ?? current?.name ?? '',
      description: meta.description ?? current?.description ?? '',
      coverMediaId: meta.coverMediaId ?? current?.coverMediaId,
      updatedAt: new Date().toISOString(),
    };

    // Set flag to prevent observer from emitting during transaction
    this.isUpdatingProjectMeta = true;
    try {
      // Update the Yjs map
      this.doc.transact(() => {
        metaMap.set('name', updated.name);
        metaMap.set('description', updated.description);
        if (updated.coverMediaId !== undefined) {
          metaMap.set('coverMediaId', updated.coverMediaId);
        } else {
          metaMap.delete('coverMediaId');
        }
        metaMap.set('updatedAt', updated.updatedAt);
      });
    } finally {
      this.isUpdatingProjectMeta = false;
    }

    // Emit after flag is cleared - this is the single source of truth
    this.projectMetaSubject.next(updated);

    this.logger.debug('YjsSync', 'Project metadata updated in Yjs');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set up WebSocket status and error handlers.
   */
  private setupWebSocketHandlers(): void {
    if (!this.wsProvider) return;

    // Status changes (connected/disconnected)
    this.wsProvider.on('status', ({ status }: { status: string }) => {
      this.logger.debug('YjsSync', `WebSocket status: ${status}`);
      this.handleWebSocketStatus(status);
    });

    // Connection errors
    this.wsProvider.on('connection-error', (event: unknown) => {
      this.handleConnectionError(event);
    });

    // Sync events
    this.wsProvider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        this.loadElementsFromDoc();
      }
    });
  }

  /**
   * Handle WebSocket status changes.
   */
  private handleWebSocketStatus(status: string): void {
    switch (status) {
      case 'connected':
        this.syncStateSubject.next(DocumentSyncState.Synced);
        this.reconnectAttempts = 0;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        break;

      case 'disconnected':
        this.syncStateSubject.next(DocumentSyncState.Offline);
        this.scheduleReconnect();
        break;

      case 'connecting':
        // Show syncing/connecting state while attempting to connect
        this.syncStateSubject.next(DocumentSyncState.Syncing);
        break;

      default:
        // Unknown status - treat as connecting
        this.logger.debug('YjsSync', `Unknown WebSocket status: ${status}`);
        this.syncStateSubject.next(DocumentSyncState.Syncing);
    }
  }

  /**
   * Handle WebSocket connection errors.
   */
  private handleConnectionError(event: unknown): void {
    this.logger.error('YjsSync', 'WebSocket connection error', event);

    // Extract error message
    let errorMessage = '';
    if (event instanceof Error) {
      errorMessage = event.message;
    } else if (event instanceof Event) {
      errorMessage = event.type;
    } else if (typeof event === 'string') {
      errorMessage = event;
    }

    // Check for authentication errors
    if (this.isAuthError(errorMessage)) {
      this.logger.warn(
        'YjsSync',
        'Authentication error - session may have expired'
      );
      this.errorsSubject.next(
        'Session expired. Please refresh the page to log in again.'
      );
      this.syncStateSubject.next(DocumentSyncState.Unavailable);

      // Don't retry on auth errors
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.reconnectAttempts = this.reconnectionConfig.maxAttempts;
    } else {
      this.syncStateSubject.next(DocumentSyncState.Offline);
    }
  }

  /**
   * Check if an error message indicates an authentication failure.
   */
  private isAuthError(message: string): boolean {
    return (
      message.includes('401') ||
      message.includes('Unauthorized') ||
      message.includes('Invalid session')
    );
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.reconnectionConfig.maxAttempts) {
      this.logger.warn('YjsSync', 'Max reconnection attempts reached');
      this.errorsSubject.next(
        'Unable to connect to server. Please refresh the page.'
      );
      return;
    }

    const delay = Math.min(
      this.reconnectionConfig.baseDelayMs * Math.pow(2, this.reconnectAttempts),
      this.reconnectionConfig.maxDelayMs
    );

    this.logger.info(
      'YjsSync',
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.reconnectionConfig.maxAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      if (this.wsProvider) {
        this.logger.info('YjsSync', 'Attempting to reconnect...');
        this.wsProvider.connect();
        this.reconnectAttempts++;
      }
    }, delay);
  }

  /**
   * Set up browser online/offline event handlers.
   */
  private setupNetworkHandlers(): void {
    this.onlineHandler = () => {
      this.logger.info('YjsSync', 'Network connection restored');
      this.reconnectAttempts = 0;
      this.wsProvider?.connect();
    };

    this.offlineHandler = () => {
      this.logger.info('YjsSync', 'Network connection lost');
      this.syncStateSubject.next(DocumentSyncState.Offline);
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  /**
   * Set up observer for Yjs document changes.
   */
  private setupDocumentObserver(): void {
    if (!this.doc) return;

    // Elements observer
    const elementsArray = this.doc.getArray<Element>('elements');
    elementsArray.observe(() => {
      const elements = elementsArray.toArray();
      this.logger.debug('YjsSync', `Elements changed: ${elements.length}`);
      this.elementsSubject.next(elements);
    });

    // Publish plans observer
    const plansArray = this.doc.getArray<PublishPlan>('publishPlans');
    plansArray.observe(() => {
      const plans = plansArray.toArray();
      this.logger.debug('YjsSync', `Publish plans changed: ${plans.length}`);
      this.publishPlansSubject.next(plans);
    });

    // Relationships observer
    const relationshipsArray =
      this.doc.getArray<ElementRelationship>('relationships');
    relationshipsArray.observe(() => {
      const relationships = relationshipsArray.toArray();
      this.logger.debug(
        'YjsSync',
        `Relationships changed: ${relationships.length}`
      );
      this.relationshipsSubject.next(relationships);
    });

    // Custom relationship types observer
    const typesArray = this.doc.getArray<RelationshipTypeDefinition>(
      'customRelationshipTypes'
    );
    typesArray.observe(() => {
      const types = typesArray.toArray();
      this.logger.debug(
        'YjsSync',
        `Custom relationship types changed: ${types.length}`
      );
      this.customRelationshipTypesSubject.next(types);
    });

    // Schemas observer
    const schemasArray = this.doc.getArray<ElementTypeSchema>('schemas');
    schemasArray.observe(() => {
      const schemas = schemasArray.toArray();
      this.logger.debug('YjsSync', `Schemas changed: ${schemas.length}`);
      this.schemasSubject.next(schemas);
    });

    // Project metadata observer
    const metaMap = this.doc.getMap<string>('projectMeta');
    metaMap.observe(() => {
      // Skip if we're the source of this change (prevents feedback loop)
      if (this.isUpdatingProjectMeta) {
        return;
      }
      const meta = this.extractProjectMeta(metaMap);
      this.logger.debug('YjsSync', 'Project metadata changed', meta);
      this.projectMetaSubject.next(meta);
    });
  }

  /**
   * Extract ProjectMeta from a Yjs Map.
   */
  private extractProjectMeta(metaMap: Y.Map<string>): ProjectMeta | undefined {
    const name = metaMap.get('name');
    // If no name is set, metadata hasn't been initialized yet
    if (name === undefined) {
      return undefined;
    }
    return {
      name: name ?? '',
      description: metaMap.get('description') ?? '',
      coverMediaId: metaMap.get('coverMediaId'),
      updatedAt: metaMap.get('updatedAt') ?? new Date().toISOString(),
    };
  }

  /**
   * Load elements and publish plans from the Yjs document and emit them.
   * If elements are empty, creates a default README document.
   */
  private loadElementsFromDoc(): void {
    if (!this.doc) return;

    // Load elements
    const elementsArray = this.doc.getArray<Element>('elements');
    let elements = elementsArray.toArray();

    // If no elements exist, create default README document
    if (elements.length === 0) {
      this.logger.info(
        'YjsSync',
        'No elements found - creating default README document'
      );
      const defaultElements = this.createDefaultElements();
      this.doc.transact(() => {
        elementsArray.insert(0, defaultElements);
      });
      elements = elementsArray.toArray();
    }

    this.logger.debug('YjsSync', `Loaded ${elements.length} elements from Yjs`);
    this.elementsSubject.next(elements);

    // Load publish plans
    const plansArray = this.doc.getArray<PublishPlan>('publishPlans');
    const plans = plansArray.toArray();
    this.logger.debug(
      'YjsSync',
      `Loaded ${plans.length} publish plans from Yjs`
    );
    this.publishPlansSubject.next(plans);

    // Load relationships
    const relationshipsArray =
      this.doc.getArray<ElementRelationship>('relationships');
    const relationships = relationshipsArray.toArray();
    this.logger.debug(
      'YjsSync',
      `Loaded ${relationships.length} relationships from Yjs`
    );
    this.relationshipsSubject.next(relationships);

    // Load custom relationship types
    const typesArray = this.doc.getArray<RelationshipTypeDefinition>(
      'customRelationshipTypes'
    );
    const types = typesArray.toArray();

    this.logger.debug(
      'YjsSync',
      `Loaded ${types.length} relationship types from Yjs`
    );
    this.customRelationshipTypesSubject.next(types);

    // Load schemas
    const schemasArray = this.doc.getArray<ElementTypeSchema>('schemas');
    const schemas = schemasArray.toArray();
    this.logger.debug('YjsSync', `Loaded ${schemas.length} schemas from Yjs`);
    this.schemasSubject.next(schemas);

    // Load element tags
    const elementTagsArray = this.doc.getArray<ElementTag>('elementTags');
    const elementTags = elementTagsArray.toArray();
    this.logger.debug(
      'YjsSync',
      `Loaded ${elementTags.length} element tags from Yjs`
    );
    this.elementTagsSubject.next(elementTags);

    // Load custom tag definitions
    const customTagsArray = this.doc.getArray<TagDefinition>('customTags');
    const customTags = customTagsArray.toArray();

    this.logger.debug(
      'YjsSync',
      `Loaded ${customTags.length} custom tag definitions from Yjs`
    );
    this.customTagsSubject.next(customTags);

    // Load project metadata
    const metaMap = this.doc.getMap<string>('projectMeta');
    const meta = this.extractProjectMeta(metaMap);
    this.logger.debug('YjsSync', 'Loaded project metadata from Yjs', meta);
    this.projectMetaSubject.next(meta);
  }

  /**
   * Create default elements for a new project.
   * Returns a README document to help users get started.
   */
  private createDefaultElements(): Element[] {
    return [
      {
        id: nanoid(),
        name: 'README',
        type: ElementType.Item,
        level: 0,
        expandable: false,
        order: 0,
        parentId: null,
        version: 0,
        metadata: {},
      },
    ];
  }
}
