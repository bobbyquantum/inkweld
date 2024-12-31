import { WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';

import { docs, IConnectionManager, persistence } from './websocket-handler';
import { WSSharedDoc } from './ws-shared-doc';

export class WebSocketConnectionManager implements IConnectionManager {
  private pingTimeout = 30000;

  setupConnection(conn: WebSocket, doc: WSSharedDoc): void {
    conn.binaryType = 'arraybuffer';
    doc.conns.set(conn, new Set());

    let pongReceived = true;
    const pingInterval = setInterval(() => {
      if (!pongReceived) {
        this.closeConnection(doc, conn);
        clearInterval(pingInterval);
      } else if (doc.conns.has(conn)) {
        pongReceived = false;
        try {
          conn.ping();
        } catch (e) {
          console.error('Error pinging connection:', e);
          this.closeConnection(doc, conn);
          clearInterval(pingInterval);
        }
      }
    }, this.pingTimeout);

    conn.on('close', () => {
      this.closeConnection(doc, conn);
      clearInterval(pingInterval);
    });

    conn.on('pong', () => {
      pongReceived = true;
    });
  }

  closeConnection(doc: WSSharedDoc, conn: WebSocket): void {
    if (doc.conns.has(conn)) {
      const controlledIds = doc.conns.get(conn)!;
      doc.conns.delete(conn);
      awarenessProtocol.removeAwarenessStates(
        doc.awareness,
        Array.from(controlledIds),
        null
      );

      if (doc.conns.size === 0 && persistence !== null) {
        void persistence.writeState(doc.name, doc).then(() => {
          doc.destroy();
        });
        docs.delete(doc.name);
      }
    }
    conn.close();
  }
}
