import * as encoding from 'lib0/encoding';
import { WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

import { MessageType, send, updateHandler } from './websocket-handler';
export interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';

export class WSSharedDoc extends Y.Doc {
  public name: string;
  public conns: Map<WebSocket, Set<number>>;
  public awareness: awarenessProtocol.Awareness;
  public whenInitialized: Promise<void>;

  constructor(name: string) {
    super({ gc: gcEnabled });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on('update', (changes: AwarenessChanges, conn: unknown) => {
      const changedClients = changes.added.concat(
        changes.updated,
        changes.removed
      );

      if (conn != null && this.conns.has(conn as WebSocket)) {
        const connControlledIDs = this.conns.get(conn as WebSocket);
        if (connControlledIDs) {
          changes.added.forEach((clientID: number) => {
            connControlledIDs.add(clientID);
          });
          changes.removed.forEach((clientID: number) => {
            connControlledIDs.delete(clientID);
          });
        }
      }

      // Broadcast awareness update
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.Awareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_s, c) => {
        send(this, c, buff);
      });
    });

    // Add update handler for normal updates
    this.on(
      'update',
      (update: Uint8Array, origin: unknown, d: Y.Doc, tr: Y.Transaction) => {
        // Cast 'd' from Y.Doc to WSSharedDoc since we know it's our subclass
        const doc = d as WSSharedDoc;
        updateHandler(update, origin, doc, tr);
      }
    );
    // Initialize content if needed
    this.whenInitialized = Promise.resolve();
  }
}
