import { Injectable } from '@angular/core';
import { Editor } from 'ngx-editor';
import { Plugin } from 'prosemirror-state';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

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
      console.log(`proto = ${window.location.protocol}`);
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // Use URL parameters instead of path option
      const wsUrl = new URL(`${wsProto}://${window.location.host}/ws/yjs`);
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
    if (!this.type || !this.provider) {
      console.error('Editor Yjs not properly initialized');
      return;
    }

    // Add collaboration plugins to the existing editor
    const plugins = [
      ySyncPlugin(this.type),
      yCursorPlugin(this.provider.awareness),
      yUndoPlugin(),
    ] as Plugin[];
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
