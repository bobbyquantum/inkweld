import { Injectable } from '@angular/core';
import { Editor } from 'ngx-editor';
import { Plugin } from 'prosemirror-state';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

interface DocumentConnection {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  type: Y.XmlFragment;
}

@Injectable({
  providedIn: 'root',
})
export class YjsService {
  private connections: Map<string, DocumentConnection> = new Map();

  async setupCollaboration(editor: Editor, documentId: string): Promise<void> {
    // Check if we already have a connection for this document
    let connection = this.connections.get(documentId);

    if (!connection) {
      // Create new connection if one doesn't exist
      const ydoc = new Y.Doc();
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProto}://${window.location.host}/ws/yjs`;

      // Let WebsocketProvider handle the room name
      const provider = new WebsocketProvider(wsUrl, documentId, ydoc);

      // Wait for the connection to be established
      await new Promise<void>(resolve => {
        const onStatus = ({ status }: { status: string }) => {
          console.log(`WebSocket status for document ${documentId}:`, status);
          if (status === 'connected') {
            provider.off('status', onStatus);
            resolve();
          }
        };
        provider.on('status', onStatus);
      });

      const type = ydoc.getXmlFragment('prosemirror');
      connection = { ydoc, provider, type };
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
        connection.ydoc.destroy();
        this.connections.delete(documentId);
      }
    } else {
      // Disconnect all documents
      for (const connection of this.connections.values()) {
        connection.provider.destroy();
        connection.ydoc.destroy();
      }
      this.connections.clear();
    }
  }

  isConnected(documentId: string): boolean {
    return this.connections.has(documentId);
  }
}
