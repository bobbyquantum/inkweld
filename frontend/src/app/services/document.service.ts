import { inject, Injectable } from '@angular/core';
import { Editor } from 'ngx-editor';
import { Plugin } from 'prosemirror-state';
import { BehaviorSubject, Observable } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { environment } from '../../environments/environment';
import { DocumentSyncState } from '../models/document-sync-state';
import { ProjectStateService } from './project-state.service';

/**
 * Represents an active Yjs document connection
 */
interface DocumentConnection {
  /** The Yjs document instance */
  ydoc: Y.Doc;
  /** WebSocket provider for real-time sync */
  provider: WebsocketProvider;
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
  private connections: Map<string, DocumentConnection> = new Map();
  private readonly projectState = inject(ProjectStateService);
  private syncStatusSubjects = new Map<
    string,
    BehaviorSubject<DocumentSyncState>
  >();

  /**
   * Gets the current sync status for a document
   * @param documentId - The document ID to check
   * @returns Observable that emits the current sync status and updates when it changes
   */
  getSyncStatus(documentId: string): Observable<DocumentSyncState> {
    if (!this.syncStatusSubjects.has(documentId)) {
      this.syncStatusSubjects.set(
        documentId,
        new BehaviorSubject<DocumentSyncState>(DocumentSyncState.Offline)
      );
    }
    return this.syncStatusSubjects.get(documentId)!.asObservable();
  }

  /**
   * Sets up collaborative editing for a document
   * @param editor - The editor instance to enable collaboration on
   * @param documentId - Unique identifier for the document
   * @returns Promise that resolves when collaboration is set up
   */
  async setupCollaboration(editor: Editor, documentId: string): Promise<void> {
    // Check if editor is properly initialized
    if (!editor || !editor.view) {
      throw new Error('Editor Yjs not properly initialized');
    }

    // Check if we already have a connection for this document
    let connection = this.connections.get(documentId);

    if (!connection) {
      // Create new connection if one doesn't exist
      const ydoc = new Y.Doc();
      const type = ydoc.getXmlFragment('prosemirror');
      // Initialize IndexedDB provider first
      const indexeddbProvider = new IndexeddbPersistence(documentId, ydoc);
      console.log('Waiting for IndexedDB sync...');

      // Set state to Offline while waiting for IndexedDB
      this.updateSyncStatus(documentId, DocumentSyncState.Offline);

      // Wait for initial IndexedDB sync
      await indexeddbProvider.whenSynced;
      console.log('IndexedDB sync complete');

      // Update state to Syncing while establishing WebSocket connection
      this.updateSyncStatus(documentId, DocumentSyncState.Syncing);

      // Setup WebSocket provider
      if (!environment.wssUrl) {
        throw new Error('WebSocket URL is not configured in environment');
      }
      const provider = new WebsocketProvider(
        environment.wssUrl + '/ws/yjs?documentId=',
        documentId,
        ydoc,
        {
          connect: true,
          resyncInterval: 10000, // Attempt to resync every 10 seconds when offline
        }
      );

      // Handle connection status
      provider.on('status', ({ status }: { status: string }) => {
        console.log(`WebSocket status for document ${documentId}:`, status);
        this.updateSyncStatus(
          documentId,
          status === 'connected'
            ? DocumentSyncState.Synced
            : DocumentSyncState.Offline
        );
      });

      // Handle connection errors gracefully
      provider.on('connection-error', (error: Error | string | Event) => {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : error.type;
        console.warn('WebSocket connection error:', errorMessage);
        this.updateSyncStatus(documentId, DocumentSyncState.Offline);
      });

      // Setup automatic reconnection when online
      window.addEventListener('online', () => {
        console.log('Network connection restored, attempting to reconnect...');
        provider.connect();
      });

      connection = { ydoc, provider, type, indexeddbProvider };
      this.connections.set(documentId, connection);
    }

    // Get the underlying ProseMirror view
    const view = editor.view;
    if (!connection.type || !connection.provider) {
      throw new Error('Editor Yjs not properly initialized');
    }

    // Add collaboration plugins to the existing editor
    const plugins = [
      ySyncPlugin(connection.type),
      yCursorPlugin(connection.provider.awareness),
      yUndoPlugin(),
    ] as Plugin[];

    // Add plugins to the editor's state
    const newState = view.state.reconfigure({
      plugins: [...view.state.plugins, ...plugins],
    });
    view.updateState(newState);
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
        connection.provider.destroy();
        void connection.indexeddbProvider.destroy();
        connection.ydoc.destroy();
        this.connections.delete(documentId);
      }
    } else {
      // Disconnect all documents
      for (const connection of this.connections.values()) {
        connection.provider.destroy();
        void connection.indexeddbProvider.destroy();
        connection.ydoc.destroy();
      }
      this.connections.clear();
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
    if (!this.syncStatusSubjects.has(documentId)) {
      this.syncStatusSubjects.set(
        documentId,
        new BehaviorSubject<DocumentSyncState>(state)
      );
    } else {
      this.syncStatusSubjects.get(documentId)!.next(state);
    }
    this.projectState.updateSyncState(documentId, state);
  }
}
