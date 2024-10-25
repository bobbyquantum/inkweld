import { Injectable } from '@angular/core';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';
import { Editor } from 'ngx-editor';

@Injectable({
  providedIn: 'root',
})
export class YjsService {
  private ydoc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private type: Y.XmlFragment | null = null;

  setupCollaboration(editor: Editor, documentId: string) {
    if (!this.ydoc) {
      this.ydoc = new Y.Doc();
      // Use URL parameters instead of path option
      const wsUrl = new URL(`ws://${window.location.hostname}:8333/ws/yjs`);
      wsUrl.searchParams.set('documentId', documentId);

      this.provider = new WebsocketProvider(
        wsUrl.toString(),
        documentId,
        this.ydoc
      );
      this.type = this.ydoc.getXmlFragment('prosemirror');

      // Log connection status
      this.provider.on('status', ({ status }: { status: string }) => {
        console.log('WebSocket status:', status);
      });
    }

    // Get the underlying ProseMirror view
    const view = editor.view;
    if (!view || !this.type || !this.provider) {
      console.error('Editor view or Yjs not properly initialized');
      return;
    }

    // Add collaboration plugins to the existing editor
    const plugins = [
      ySyncPlugin(this.type),
      yCursorPlugin(this.provider.awareness),
      yUndoPlugin(),
    ];

    // Add plugins to the editor's state
    const newState = view.state.reconfigure({
      plugins: [...view.state.plugins, ...plugins],
    });
    view.updateState(newState);
  }

  disconnect() {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }
    this.type = null;
  }
}
