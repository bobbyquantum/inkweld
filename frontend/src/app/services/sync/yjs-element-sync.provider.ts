import { inject, Injectable } from '@angular/core';
import { Element } from '@inkweld/index';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import {
  IElementSyncProvider,
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

    try {
      // Create new Yjs document
      this.doc = new Y.Doc();

      // Set up WebSocket connection FIRST to get server state
      const wsUrl = `${webSocketUrl}/api/v1/ws/yjs?documentId=${this.docId}`;
      this.logger.info('YjsSync', `🌐 WebSocket URL: ${wsUrl}`);

      this.wsProvider = new WebsocketProvider(wsUrl, '', this.doc, {
        connect: true,
        resyncInterval: 10000,
      });

      // Wait for initial WebSocket sync before enabling IndexedDB
      // This prevents empty IndexedDB from overwriting server data
      await this.waitForInitialSync();

      // Now set up IndexedDB persistence (after server state is loaded)
      this.idbProvider = new IndexeddbPersistence(this.docId, this.doc);
      await this.idbProvider.whenSynced;
      this.logger.info('YjsSync', '✅ IndexedDB synced');

      // Set up event handlers
      this.setupWebSocketHandlers();
      this.setupNetworkHandlers();
      this.setupDocumentObserver();

      // Load initial elements
      this.loadElementsFromDoc();

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
   */
  updateElements(elements: Element[]): void {
    if (!this.doc) {
      this.logger.warn('YjsSync', 'Cannot update elements - not connected');
      return;
    }

    this.logger.debug('YjsSync', `Writing ${elements.length} elements to Yjs`);

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
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Wait for the WebSocket to sync with the server.
   * Times out after 30 seconds.
   */
  private waitForInitialSync(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket sync timeout'));
      }, 30000);

      const checkSync = () => {
        if (this.wsProvider?.synced) {
          clearTimeout(timeout);
          this.logger.info('YjsSync', '✅ WebSocket synced');
          resolve();
        } else {
          setTimeout(checkSync, 100);
        }
      };
      checkSync();
    });
  }

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

      default:
        this.syncStateSubject.next(DocumentSyncState.Synced);
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
  }

  /**
   * Load elements and publish plans from the Yjs document and emit them.
   */
  private loadElementsFromDoc(): void {
    if (!this.doc) return;

    // Load elements
    const elementsArray = this.doc.getArray<Element>('elements');
    const elements = elementsArray.toArray();
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
  }
}
