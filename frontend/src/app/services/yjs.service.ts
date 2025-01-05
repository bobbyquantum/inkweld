import { inject, Injectable } from '@angular/core';
import { Editor } from 'ngx-editor';
import { Plugin } from 'prosemirror-state';
import { IndexeddbPersistence } from 'y-indexeddb';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentSyncState } from '../models/document-sync-state';
import { ProjectStateService } from './project-state.service';

interface DocumentConnection {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  type: Y.XmlFragment;
  indexeddbProvider: IndexeddbPersistence;
}

@Injectable({
  providedIn: 'root',
})
export class YjsService {
  private connections: Map<string, DocumentConnection> = new Map();
  private readonly projectState = inject(ProjectStateService);

  async setupCollaboration(editor: Editor, documentId: string): Promise<void> {
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
      this.projectState.updateSyncState(documentId, DocumentSyncState.Offline);

      // Wait for initial IndexedDB sync
      await indexeddbProvider.whenSynced;
      console.log('IndexedDB sync complete');

      // Update state to Syncing while establishing WebSocket connection
      this.projectState.updateSyncState(documentId, DocumentSyncState.Syncing);

      // Setup WebSocket provider
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProto}://${window.location.host}/ws/yjs?documentId=`;
      const provider = new WebsocketProvider(wsUrl, documentId, ydoc, {
        connect: true,
        resyncInterval: 10000, // Attempt to resync every 10 seconds when offline
      });

      // Handle connection status
      provider.on('status', ({ status }: { status: string }) => {
        console.log(`WebSocket status for document ${documentId}:`, status);
        this.projectState.updateSyncState(
          documentId,
          status === 'connected'
            ? DocumentSyncState.Synced
            : DocumentSyncState.Offline
        );
      });

      // Handle connection errors gracefully
      provider.on('connection-error', (error: Event) => {
        console.warn('WebSocket connection error:', error);
        this.projectState.updateSyncState(
          documentId,
          DocumentSyncState.Offline
        );
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
      console.error(
        'Editor Yjs not properly initialized for document:',
        documentId
      );
      return;
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

  isConnected(documentId: string): boolean {
    return this.connections.has(documentId);
  }
}
