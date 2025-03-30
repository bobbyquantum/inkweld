import { inject, Injectable } from '@angular/core';
import { Editor } from 'ngx-editor';
import { Plugin } from 'prosemirror-state';
import { BehaviorSubject, Observable } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentAPIService } from '../../api-client/api/document-api.service';
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
  private readonly projectState = inject(ProjectStateService);
  private readonly documentApiService = inject(DocumentAPIService);

  private connections: Map<string, DocumentConnection> = new Map();

  private syncStatusSubjects = new Map<
    string,
    BehaviorSubject<DocumentSyncState>
  >();
  private unsyncedChanges = new Map<string, boolean>();

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
   * Checks if a document has unsynced changes
   * @param documentId - The document ID to check
   * @returns True if there are changes that haven't been synced to the server
   */
  hasUnsyncedChanges(documentId: string): boolean {
    return this.unsyncedChanges.get(documentId) || false;
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
    return new BehaviorSubject(connection.type.toJSON()).asObservable();
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
      console.log('Cleared previous doc');
      // Traverse each child element of our temporary root.
      for (let i = 0; i < root.childNodes.length; i++) {
        console.log('Importing node', root.childNodes[i]);
        const node = root.childNodes[i];
        let yNode: Y.XmlElement | Y.XmlText;
        if (node.nodeType === Node.ELEMENT_NODE) {
          console.log('Element node');
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
          console.log('Skip node');
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
    this.documentApiService
      .documentControllerRenderHtml(username, projectSlug, docName)
      .subscribe({
        next: response => {
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

      // Handle connection status
      provider.on('status', ({ status }: { status: string }) => {
        console.log(`WebSocket status for document ${documentId}:`, status);
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
