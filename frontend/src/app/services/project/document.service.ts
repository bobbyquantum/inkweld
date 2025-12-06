import {
  effect,
  inject,
  Injectable,
  NgZone,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { DocumentsService } from '@inkweld/index';
import { Editor } from 'ngx-editor';
import { Plugin } from 'prosemirror-state';
import { Observable } from 'rxjs';
import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import {
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { LintApiService } from '../../components/lint/lint-api.service';
import { createLintPlugin } from '../../components/lint/lint-plugin';
import { DocumentSyncState } from '../../models/document-sync-state';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { SystemConfigService } from '../core/system-config.service';
import { UnifiedUserService } from '../user/unified-user.service';
import { ProjectStateService } from './project-state.service';

/**
 * Represents an active Yjs document connection
 */
interface DocumentConnection {
  /** The Yjs document instance */
  ydoc: Y.Doc;
  /** WebSocket provider for real-time sync (null in offline mode) */
  provider: WebsocketProvider | null;
  /** XML fragment used for ProseMirror content */
  type: Y.XmlFragment;
  /** IndexedDB provider for offline persistence */
  indexeddbProvider: IndexeddbPersistence;
}

/**
 * Manages Yjs document connections for collaborative editing
 *
 * Handles WebSocket connections, IndexedDB persistence, and ProseMirror integration
 * for real-time collaborative document editing. Maintains connections to multiple
 * documents and provides synchronization status updates.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  private documentsService = inject(DocumentsService);
  private setupService = inject(SetupService);
  private ngZone = inject(NgZone);
  private systemConfigService = inject(SystemConfigService);
  private projectStateService = inject(ProjectStateService);
  private lintApiService = inject(LintApiService);
  private logger = inject(LoggerService);
  private userService = inject(UnifiedUserService);

  private connections: Map<string, DocumentConnection> = new Map();

  private unsyncedChanges = new Map<string, boolean>();
  /** Reactive sync status signals per document */
  private syncStatusSignals = new Map<
    string,
    WritableSignal<DocumentSyncState>
  >();
  /** Reactive word count signals per document */
  private wordCountSignals = new Map<string, WritableSignal<number>>();
  /** Track reconnect timeouts to cancel them on disconnect */
  private reconnectTimeouts = new Map<string, number>();

  constructor() {
    // Ensure awareness is cleaned up when the browser tab/window closes
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.connections.forEach((connection, documentId) => {
          if (connection.provider) {
            this.logger.debug(
              'DocumentService',
              `Cleaning up awareness for ${documentId} on page unload`
            );
            connection.provider.awareness.setLocalState(null);
          }
        });
      });
    }
  }

  /**
   * Gets reactive sync status signal for a document
   */
  getSyncStatusSignal(documentId: string): Signal<DocumentSyncState> {
    this.initializeSyncStatus(documentId);
    return this.syncStatusSignals.get(documentId)!;
  }

  /**
   * Initializes sync status for a document without setting up full collaboration
   * This is used to ensure sync indicators appear in the tab interface
   */
  initializeSyncStatus(documentId: string): void {
    if (!this.syncStatusSignals.has(documentId)) {
      this.logger.debug(
        'DocumentService',
        `Explicitly initializing sync status for ${documentId}`
      );
      this.syncStatusSignals.set(documentId, signal(DocumentSyncState.Offline));
    }
  }

  /**
   * Checks if a document has unsynced changes
   * @param documentId - The document ID to check
   * @returns True if there are changes that haven't been synced to the server
   */
  hasUnsyncedChanges(documentId: string): boolean {
    return this.unsyncedChanges.get(documentId) || false;
  }

  /**
   * Gets reactive word count signal for a document
   */
  getWordCountSignal(documentId: string): Signal<number> {
    if (!this.wordCountSignals.has(documentId)) {
      this.wordCountSignals.set(documentId, signal(0));
    }
    return this.wordCountSignals.get(documentId)!;
  }

  /**
   * Updates the word count for a document
   * @param documentId - The document ID
   * @param count - New word count
   */
  updateWordCount(documentId: string, count: number): void {
    this.ngZone.run(() => {
      if (this.wordCountSignals.has(documentId)) {
        this.wordCountSignals.get(documentId)!.set(count);
      } else {
        this.wordCountSignals.set(documentId, signal(count));
      }
    });
  }

  /**
   * Exports the content of a document
   * @param documentId - The document ID to export
   * @returns Observable<unknown> that emits the document content
   */
  exportDocument(documentId: string): Observable<unknown> {
    const connection = this.connections.get(documentId);
    if (!connection) {
      throw new Error(`No connection found for document ${documentId}`);
    }
    return new Observable(observer => {
      observer.next(connection.type.toJSON());
      observer.complete();
    });
  }

  /**
   * Gets document content as ProseMirror-compatible JSON.
   *
   * This is the single abstraction point for retrieving document content.
   * It handles both connected documents (via active Yjs connection) and
   * offline documents (via IndexedDB persistence).
   *
   * Use this method instead of directly accessing Yjs or IndexedDB.
   *
   * @param documentId - The full document ID (username:slug:elementId)
   * @returns Promise resolving to the document content as JSON, or null if not found
   */
  async getDocumentContent(documentId: string): Promise<unknown> {
    // First try: Active connection
    const connection = this.connections.get(documentId);
    if (connection) {
      this.logger.debug(
        'DocumentService',
        `Getting content from active connection: ${documentId}`
      );
      // Use y-prosemirror to convert XmlFragment to ProseMirror JSON format
      const json = yXmlFragmentToProsemirrorJSON(connection.type);
      return json?.['content'] ?? [];
    }

    // Second try: Load from IndexedDB
    this.logger.debug(
      'DocumentService',
      `Loading content from IndexedDB: ${documentId}`
    );
    return this.loadContentFromIndexedDB(documentId);
  }

  /**
   * Loads document content directly from IndexedDB.
   *
   * Creates a temporary Yjs document and IndexedDB provider to read
   * the persisted content, then immediately cleans up.
   *
   * @param documentId - The full document ID
   * @returns Promise resolving to the document content, or null if empty/not found
   */
  private async loadContentFromIndexedDB(documentId: string): Promise<unknown> {
    const ydoc = new Y.Doc();
    const provider = new IndexeddbPersistence(documentId, ydoc);

    try {
      await provider.whenSynced;
      const fragment = ydoc.getXmlFragment('prosemirror');

      if (fragment.length === 0) {
        this.logger.debug(
          'DocumentService',
          `Document ${documentId} has no content in IndexedDB`
        );
        return null;
      }

      // Use y-prosemirror to convert XmlFragment to ProseMirror JSON format
      const json = yXmlFragmentToProsemirrorJSON(fragment);
      const content = (json?.['content'] ?? []) as unknown[];
      this.logger.debug(
        'DocumentService',
        `Loaded content from IndexedDB: ${documentId}`
      );
      return content;
    } finally {
      // Clean up temporary resources
      try {
        await provider.destroy();
        ydoc.destroy();
      } catch (error) {
        this.logger.warn(
          'DocumentService',
          `Error cleaning up temp IndexedDB provider for ${documentId}`,
          error
        );
      }
    }
  }

  /**
   * Imports content into a document, replacing existing content.
   * This will propagate changes to all connected users and update IndexedDB.
   * @param documentId - The document ID to import into
   * @param content - The content to import, as a JSON string
   */
  importDocument(documentId: string, content: string): void {
    const connection = this.connections.get(documentId);
    if (!connection) {
      throw new Error(`No connection found for document ${documentId}`);
    }

    this.importXmlString(connection.ydoc, connection.type, content);
  }

  importXmlString(ydoc: Y.Doc, fragment: Y.XmlFragment, xmlString: string) {
    // Ensure the string has a single root element by wrapping it.
    const wrapped = `<root>${xmlString}</root>`;
    const parser = new DOMParser();
    const dom = parser.parseFromString(wrapped, 'text/xml');
    const root = dom.documentElement;

    // Begin a Yjs transaction to update the fragment.
    Y.transact(ydoc, () => {
      // Clear existing content
      fragment.delete(0, fragment.length);
      this.logger.debug('DocumentService', 'Cleared previous doc');
      // Traverse each child element of our temporary root.
      for (let i = 0; i < root.childNodes.length; i++) {
        this.logger.debug(
          'DocumentService',
          'Importing node',
          root.childNodes[i]
        );
        const node = root.childNodes[i];
        let yNode: Y.XmlElement | Y.XmlText;
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.logger.debug('DocumentService', 'Element node');
          // Create a Y.XmlElement with the same tag name
          yNode = new Y.XmlElement(node.nodeName);
          // Optionally, handle attributes here if needed.
          // Recursively add children if the element has nested nodes.
          for (let j = 0; j < node.childNodes.length; j++) {
            const child = node.childNodes[j];
            if (child.nodeType === Node.TEXT_NODE) {
              // Create a Y.XmlText for text content
              const yText = new Y.XmlText();
              yText.insert(0, child.textContent || '');
              yNode.insert(0, [yText]);
            }
          }
        } else {
          this.logger.debug('DocumentService', 'Skip node');
          continue; // skip other node types
        }
        // Append the created node to the fragment.
        fragment.push([yNode]);
      }
    });
  }

  /**
   * Opens a document as HTML in a new browser tab
   *
   * Uses the API endpoint that directly returns the HTML representation
   * of the document, instead of generating HTML client-side.
   *
   * @param username - The username of the document owner
   * @param projectSlug - The project slug
   * @param documentId - The document ID to render as HTML
   */
  openDocumentAsHtml(
    username: string,
    projectSlug: string,
    documentId: string
  ): void {
    // Extract ID parts if we have a full ID (docName:username:projectSlug)
    let docName = documentId;
    if (documentId.includes(':')) {
      const parts = documentId.split(':');
      if (parts.length === 3) {
        username = parts[0];
        projectSlug = parts[1];
        docName = parts[2];
      }
    }
    this.documentsService
      .renderDocumentAsHtml(username, projectSlug, docName)
      .subscribe({
        next: (response: string) => {
          const blob = new Blob([response], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        },
      });

    // // Directly open the API endpoint URL in a new tab
    // const url = `/api/v1/projects/${username}/${projectSlug}/docs/${docName}/html`;
    // window.open(url, '_blank');
  }

  /**
   * Sets up collaborative editing for a document
   * @param editor - The editor instance to enable collaboration on
   * @param documentId - Unique identifier for the document
   * @returns Promise that resolves when collaboration is set up
   */
  async setupCollaboration(editor: Editor, documentId: string): Promise<void> {
    console.log('[DocumentService] setupCollaboration called for:', documentId);
    console.log(
      '[DocumentService] editor doc size BEFORE:',
      editor.view?.state.doc.content.size
    );

    // Validate documentId format (must be username:slug:docId)
    if (!documentId || documentId === 'invalid' || !documentId.includes(':')) {
      this.logger.error(
        'DocumentService',
        `Invalid documentId format: "${documentId}" - must be username:slug:docId`
      );
      throw new Error(`Invalid documentId format: ${documentId}`);
    }

    const parts = documentId.split(':');
    if (parts.length !== 3 || parts.some(part => !part.trim())) {
      this.logger.error(
        'DocumentService',
        `Invalid documentId parts: "${documentId}" - each part must be non-empty`
      );
      throw new Error(`Invalid documentId: ${documentId}`);
    }

    // Check if editor is properly initialized
    if (!editor || !editor.view) {
      throw new Error('Editor Yjs not properly initialized');
    }

    // Check if we already have a connection for this document
    let connection = this.connections.get(documentId);

    // If connection exists and editor already has y-sync plugin, don't re-add plugins
    if (
      connection &&
      editor.view.state.plugins.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        p => (p.spec as any)?.key?.key === 'y-sync$'
      )
    ) {
      this.logger.info(
        'DocumentService',
        `Collaboration already set up for ${documentId}, skipping plugin setup`
      );
      return;
    }

    if (!connection) {
      // Ensure sync status signal exists before updates
      this.initializeSyncStatus(documentId);

      // Create new connection if one doesn't exist
      const ydoc = new Y.Doc();
      const type = ydoc.getXmlFragment('prosemirror');
      // Initialize IndexedDB provider first
      const indexeddbProvider = new IndexeddbPersistence(documentId, ydoc);
      this.logger.debug('DocumentService', 'Waiting for IndexedDB sync...');

      // Set state to Offline while waiting for IndexedDB
      this.updateSyncStatus(documentId, DocumentSyncState.Offline);

      // Wait for initial IndexedDB sync
      await indexeddbProvider.whenSynced;
      this.logger.debug('DocumentService', 'IndexedDB sync complete');
      console.log(
        '[DocumentService] IndexedDB synced, ydoc XML fragment:',
        type.toJSON()
      );
      console.log(
        '[DocumentService] Editor doc size AFTER sync:',
        editor.view?.state.doc.content.size
      );

      // Try to setup WebSocket provider if URL is available
      let provider: WebsocketProvider | null = null;
      const websocketUrl = this.setupService.getWebSocketUrl();

      if (websocketUrl) {
        // Update state to Syncing while establishing WebSocket connection
        this.updateSyncStatus(documentId, DocumentSyncState.Syncing);

        // Make sure the documentId is properly formatted for WebSocket URL
        // Remove any leading '/' characters that might cause URL issues
        const formattedDocId = documentId.replace(/^\/+/, '');
        this.logger.debug(
          'DocumentService',
          `Setting up WebSocket connection for document: ${formattedDocId}`
        );

        // WebsocketProvider(url, roomName, doc, options)
        // The roomName parameter is appended to the URL, but we want documentId as a query param
        // So we include it in the URL and use a dummy room name
        const wsUrl = `${websocketUrl}/api/v1/ws/yjs?documentId=${formattedDocId}`;
        provider = new WebsocketProvider(
          wsUrl,
          '', // Empty room name - documentId is already in URL
          ydoc,
          {
            connect: true,
            resyncInterval: 10000, // Attempt to resync every 10 seconds when offline
          }
        );

        // Set user information for awareness (collaborative cursors)
        const currentUser = this.userService.currentUser();
        if (currentUser?.username && provider.awareness.setLocalStateField) {
          provider.awareness.setLocalStateField('user', {
            name: currentUser.username,
            color: this.generateUserColor(currentUser.username),
          });
          this.logger.debug(
            'DocumentService',
            `Set awareness for ${currentUser.username}, clientID: ${provider.awareness.clientID}`
          );
        }

        // Track unsynced changes by listening to Yjs document updates
        this.unsyncedChanges.set(documentId, false);
        ydoc.on(
          'update',
          (
            update: Uint8Array,
            origin: unknown,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            doc: Y.Doc,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            transaction: unknown
          ) => {
            // Only mark as unsynced if the change originated locally
            if (origin !== provider) {
              this.unsyncedChanges.set(documentId, true);
            }
          }
        );

        // Track connection attempts for exponential backoff
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        let reconnectTimeout: number | null = null;

        // Handle connection status with enhanced logging
        provider.on('status', ({ status }: { status: string }) => {
          this.logger.debug(
            'DocumentService',
            `WebSocket status for document ${documentId}: ${status}`
          );

          // Log WebSocket URL and connection parameters
          if (status === 'connecting') {
            this.logger.debug(
              'DocumentService',
              `Connecting to WebSocket URL: ${websocketUrl}/api/v1/ws/yjs?documentId=${formattedDocId}`
            );
          } else if (status === 'connected') {
            this.logger.info(
              'DocumentService',
              `Successfully connected to WebSocket server for ${documentId}`
            );
            reconnectAttempts = 0;
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
            this.reconnectTimeouts.delete(documentId);
          } else if (status === 'disconnected') {
            // Check if document was intentionally disconnected
            if (!this.connections.has(documentId)) {
              return;
            }

            this.logger.warn(
              'DocumentService',
              `Disconnected from WebSocket server for ${documentId}. Will attempt reconnect.`
            );

            // Exponential backoff for reconnection
            if (reconnectAttempts < maxReconnectAttempts) {
              const delay = Math.min(
                1000 * Math.pow(2, reconnectAttempts),
                30000
              );

              reconnectTimeout = window.setTimeout(() => {
                // Verify connection still exists before reconnecting
                if (!this.connections.has(documentId)) {
                  return;
                }

                provider!.connect();
                reconnectAttempts++;
              }, delay);

              this.reconnectTimeouts.set(documentId, reconnectTimeout);
            } else {
              this.logger.warn(
                'DocumentService',
                'Max reconnection attempts reached'
              );
            }
          }

          const newState =
            status === 'connected'
              ? DocumentSyncState.Synced
              : DocumentSyncState.Offline;
          this.updateSyncStatus(documentId, newState);

          // When we reconnect successfully, clear the unsynced changes flag
          if (newState === DocumentSyncState.Synced) {
            this.unsyncedChanges.set(documentId, false);
          }
        });

        // Handle connection errors with enhanced debugging
        provider.on('connection-error', (error: Error | string | Event) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : error.type;

          this.logger.warn(
            'DocumentService',
            `WebSocket connection error for ${documentId}`,
            errorMessage
          );
          this.logger.debug(
            'DocumentService',
            `Connection details: URL=${websocketUrl}/api/v1/ws/yjs?documentId=${formattedDocId}`
          );

          if (error instanceof Error && error.stack) {
            this.logger.debug('DocumentService', `Error stack: ${error.stack}`);
          }

          // Check for authentication errors
          if (
            errorMessage.includes('401') ||
            errorMessage.includes('Unauthorized') ||
            errorMessage.includes('Invalid session')
          ) {
            this.logger.error(
              'DocumentService',
              'Authentication error on WebSocket, session may have expired'
            );
            this.updateSyncStatus(documentId, DocumentSyncState.Unavailable);
            // Notify project state service about auth error
            this.projectStateService.updateSyncState(
              documentId,
              DocumentSyncState.Unavailable
            );
            // Stop retry attempts on auth errors
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
            reconnectAttempts = maxReconnectAttempts;
            return; // Don't set to Offline for auth errors
          }

          // If the error is related to CORS or connection refused, provide more guidance
          if (
            errorMessage.includes('CORS') ||
            errorMessage.includes('refused')
          ) {
            this.logger.error(
              'DocumentService',
              'WebSocket connection refused. Check if server is running and CORS is properly configured.'
            );
          }

          this.updateSyncStatus(documentId, DocumentSyncState.Offline);
        });

        // Setup automatic reconnection when online
        const handleOnline = () => {
          this.logger.info(
            'DocumentService',
            'Network connection restored, attempting to reconnect...'
          );
          reconnectAttempts = 0; // Reset attempts on network restore
          provider!.connect();
        };

        window.addEventListener('online', handleOnline);
      } else {
        // No WebSocket URL available - staying in offline mode
        this.logger.info(
          'DocumentService',
          `No WebSocket URL configured, document ${documentId} will remain in offline mode`
        );
        this.updateSyncStatus(documentId, DocumentSyncState.Offline);
      }

      connection = { ydoc, provider, type, indexeddbProvider };
      this.connections.set(documentId, connection);
    }

    // Get the underlying ProseMirror view
    const view = editor.view;
    if (!connection.type) {
      throw new Error('Editor Yjs not properly initialized');
    }

    // Add collaboration plugins to the existing editor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const plugins: Plugin<any>[] = [
      ySyncPlugin(connection.type),
      yUndoPlugin(),
    ];

    // Add cursor plugin only if we have a WebSocket provider
    if (connection.provider) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      plugins.push(yCursorPlugin(connection.provider.awareness));
    }

    // Add the linting plugin
    if (this.systemConfigService.isAiLintingEnabled()) {
      const lintPlugin = createLintPlugin(this.lintApiService);
      plugins.push(lintPlugin);
    }

    // Add word count tracking plugin
    const wordCountPlugin = new Plugin({
      view: () => ({
        update: (view, prevState) => {
          const doc = view.state.doc;
          if (!doc || typeof doc.textBetween !== 'function') return;
          const prevDoc = prevState.doc;
          if (prevDoc && doc !== prevDoc) {
            const text = doc.textBetween(0, doc.content.size, ' ');
            const count = text.trim().split(/\s+/).filter(Boolean).length;
            this.logger.debug(
              'DocumentService',
              `word count updated: ${count} for ${documentId}`
            );
            this.updateWordCount(documentId, count);
          }
        },
      }),
    });
    plugins.push(wordCountPlugin);

    // CRITICAL FIX: Instead of reconfiguring existing state, create a completely
    // new state from scratch with the Yjs plugins. This ensures ySyncPlugin's init()
    // is called properly and the ProsemirrorBinding syncs content from Yjs.
    const newState = view.state.reconfigure({
      plugins: [...view.state.plugins, ...plugins],
    });

    // Replace the entire editor state to trigger proper plugin initialization
    view.updateState(newState);
    console.log(
      '[DocumentService] Plugins added, editor doc size:',
      view.state.doc.content.size
    );

    // CRITICAL: Force the view to re-render by dispatching an empty transaction
    // This triggers the ySyncPlugin's binding to sync content from Yjs to ProseMirror
    view.dispatch(view.state.tr);

    // Initial word count update with guard and error suppression
    try {
      if (view.state.doc && typeof view.state.doc.textBetween === 'function') {
        const text = view.state.doc.textBetween(
          0,
          view.state.doc.content.size,
          ' '
        );
        const initialCount = text.trim().split(/\s+/).filter(Boolean).length;
        this.logger.debug(
          'DocumentService',
          `initial word count: ${initialCount} for ${documentId}`
        );
        this.updateWordCount(documentId, initialCount);
      }
    } catch (error) {
      this.logger.warn(
        'DocumentService',
        'initial word count skipped due to error',
        error
      );
    }
  }

  /**
   * Disconnects from a specific document or all documents
   * @param documentId - Optional document ID to disconnect from. If not provided,
   * disconnects from all documents
   */
  disconnect(documentId?: string) {
    if (documentId) {
      // Disconnect specific document
      const connection = this.connections.get(documentId);
      if (connection) {
        this.logger.info('DocumentService', `Disconnecting from ${documentId}`);

        // Cancel any pending reconnect attempts
        const reconnectTimeout = this.reconnectTimeouts.get(documentId);
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          this.reconnectTimeouts.delete(documentId);
        }

        // Remove from connections map FIRST to prevent reconnection
        this.connections.delete(documentId);

        // Clean up providers and document
        // Order: Clear awareness → WebSocket disconnect → destroy providers → destroy doc
        if (connection.provider) {
          try {
            // Clear local awareness state to remove cursor from other users' views
            const clientID = connection.provider.awareness.clientID;
            this.logger.debug(
              'DocumentService',
              `Clearing awareness for clientID ${clientID} on disconnect`
            );
            connection.provider.awareness.setLocalState(null);
            connection.provider.disconnect();
            connection.provider.destroy();
          } catch (error) {
            this.logger.warn(
              'DocumentService',
              `Error cleaning up WebSocket provider for ${documentId}`,
              error
            );
          }
        }

        // IMPORTANT: Flush any pending writes before destroying
        // y-indexeddb debounces writes, and destroy() cancels pending writes
        // without flushing them. This ensures all edits are persisted.
        // Note: We use void to fire-and-forget since disconnect() is sync,
        // but the data will still be saved before destroy() runs.
        void storeState(connection.indexeddbProvider, true)
          .then(() => connection.indexeddbProvider.destroy())
          .catch(error => {
            this.logger.warn(
              'DocumentService',
              `Error flushing/destroying IndexedDB provider for ${documentId}`,
              error
            );
          });

        try {
          connection.ydoc.destroy();
        } catch (error) {
          this.logger.warn(
            'DocumentService',
            `Error destroying Yjs doc for ${documentId}`,
            error
          );
        }

        // Clean up sync state
        this.syncStatusSignals.delete(documentId);
        this.unsyncedChanges.delete(documentId);
        this.wordCountSignals.delete(documentId);
      }
    } else {
      // Disconnect all documents
      this.logger.info('DocumentService', 'Disconnecting from all documents');

      // Cancel all pending reconnects
      for (const timeout of this.reconnectTimeouts.values()) {
        clearTimeout(timeout);
      }
      this.reconnectTimeouts.clear();

      // Clear connections map first to prevent reconnections
      const connectionsToClose = Array.from(this.connections.entries());
      this.connections.clear();

      for (const [docId, connection] of connectionsToClose) {
        // Clean up in reverse order: doc first, then providers
        try {
          connection.ydoc.destroy();
        } catch (error) {
          this.logger.warn(
            'DocumentService',
            `Error destroying Yjs doc for ${docId}`,
            error
          );
        }

        // IMPORTANT: Flush pending writes before destroying IndexedDB provider
        void storeState(connection.indexeddbProvider, true)
          .then(() => connection.indexeddbProvider.destroy())
          .catch(error => {
            this.logger.warn(
              'DocumentService',
              `Error flushing/destroying IndexedDB provider for ${docId}`,
              error
            );
          });

        if (connection.provider) {
          try {
            connection.provider.destroy();
          } catch (error) {
            this.logger.warn(
              'DocumentService',
              `Error destroying provider for ${docId}`,
              error
            );
          }
        }

        this.syncStatusSignals.delete(docId);
        this.unsyncedChanges.delete(docId);
        this.wordCountSignals.delete(docId);
      }
      // Connections map already cleared above
    }
  }

  /**
   * Checks if a document is currently connected
   * @param documentId - The document ID to check
   * @returns True if the document has an active connection, false otherwise
   */
  isConnected(documentId: string): boolean {
    return this.connections.has(documentId);
  }

  /**
   * Updates the sync status for a document
   * @param documentId - The document ID to update
   * @param state - The new sync state
   */
  private updateSyncStatus(documentId: string, state: DocumentSyncState): void {
    this.ngZone.run(() => {
      if (this.syncStatusSignals.has(documentId)) {
        this.syncStatusSignals.get(documentId)!.set(state);
      }
      this.projectStateService.updateSyncState(documentId, state);
    });
  }

  /**
   * @deprecated use getSyncStatusSignal
   */
  getSyncStatus(documentId: string): Observable<DocumentSyncState> {
    this.initializeSyncStatus(documentId);
    return new Observable(observer => {
      const sig = this.syncStatusSignals.get(documentId)!;
      observer.next(sig());
      const eff = effect(() => observer.next(sig()));
      return () => eff.destroy();
    });
  }

  /**
   * Generates a consistent color for a user based on their username
   * @param username - The username to generate a color for
   * @returns A hex color string
   */
  private generateUserColor(username: string): string {
    // Simple hash function to generate a consistent color from username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert to a pleasant color (avoid too dark or too light)
    const hue = Math.abs(hash % 360);
    const saturation = 70; // Keep saturation consistent for vibrancy
    const lightness = 60; // Keep lightness consistent for readability

    // Convert HSL to RGB, then to hex
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;

    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}
