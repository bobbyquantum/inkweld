import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

export interface UpgradeRequest extends IncomingMessage {
  url: string;
}

export class WebSocketHandler {
  private wss: WebSocketServer;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    // Type assertion here is safe because we check for url existence
    if (!request.url) {
      console.error('No URL in upgrade request');
      return;
    }

    const pathname = request.url;
    console.log(`Received upgrade request for: ${pathname}`);

    if (pathname.startsWith('/ws/yjs')) {
      const docName = pathname.slice(8); // Remove '/ws/yjs'

      // Simulate cookie validation
      console.log(`[DUMMY] Validating cookie for document: ${docName}`);

      // Set up websocket connection
      this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        setupWSConnection(ws, request, { docName, gc: true });
      });
    } else {
      // Let Express handle other upgrade requests
      console.log('Not a y-websocket upgrade request');
    }
  }
}
