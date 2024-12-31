import { IncomingMessage } from 'http';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as map from 'lib0/map';
import { Duplex } from 'stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { debouncedSave } from './debounced-save';
import { DefaultMessageHandler } from './default-message-handler';
import { WebSocketConnectionManager } from './websocket-connection-manager';
import { WSSharedDoc } from './ws-shared-doc';

export enum MessageType {
  Sync = 0,
  Awareness = 1,
}

export interface IPersistenceAdapter {
  bindState(docName: string, ydoc: Y.Doc): void;
  writeState(docName: string, ydoc: Y.Doc): Promise<void>;
}

export interface IMessageHandler {
  handleMessage(
    messageType: MessageType,
    decoder: decoding.Decoder,
    encoder: encoding.Encoder,
    doc: WSSharedDoc,
    conn: WebSocket
  ): void;
}

export interface IConnectionManager {
  setupConnection(conn: WebSocket, doc: WSSharedDoc): void;
  closeConnection(doc: WSSharedDoc, conn: WebSocket): void;
}

const docs = new Map<string, WSSharedDoc>();
export { docs };

export let persistence: IPersistenceAdapter | null = null;

export function setPersistence(persistence_: IPersistenceAdapter): void {
  persistence = persistence_;
}

export function getPersistence(): IPersistenceAdapter | null {
  return persistence;
}

// Global send function that can be used externally
export function send(doc: WSSharedDoc, conn: WebSocket, m: Uint8Array): void {
  if (conn.readyState !== conn.OPEN && conn.readyState !== conn.CONNECTING) {
    new WebSocketConnectionManager().closeConnection(doc, conn);
  }
  try {
    conn.send(m, err => {
      if (err) {
        console.error('Error sending message:', err);
        new WebSocketConnectionManager().closeConnection(doc, conn);
      }
    });
  } catch (e) {
    console.error('Exception during send:', e);
    new WebSocketConnectionManager().closeConnection(doc, conn);
  }
}

export class WebSocketHandler {
  private wss: WebSocketServer;
  private messageHandler: IMessageHandler;
  private connectionManager: IConnectionManager;

  constructor(
    messageHandler: IMessageHandler = new DefaultMessageHandler(),
    connectionManager: IConnectionManager = new WebSocketConnectionManager()
  ) {
    this.wss = new WebSocketServer({ noServer: true });
    this.messageHandler = messageHandler;
    this.connectionManager = connectionManager;
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!request.url) {
      console.error('No URL in upgrade request');
      return;
    }

    const pathname = request.url;
    console.log(`Received upgrade request for: ${pathname}`);

    if (pathname.startsWith('/ws/yjs')) {
      const docName = pathname.slice(8); // Remove '/ws/yjs'
      console.log(`Validating cookie for document: ${docName}`);

      this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        const doc = this.getYDoc(docName, true);

        this.connectionManager.setupConnection(ws, doc);

        ws.on('message', (message: RawData) => {
          this.onMessage(ws, doc, new Uint8Array(message as ArrayBuffer));
        });
      });
    } else {
      console.log('Not a y-websocket upgrade request');
    }
  }

  private getYDoc(docname: string, gc = true): WSSharedDoc {
    return map.setIfUndefined(docs, docname, () => {
      const doc = new WSSharedDoc(docname);
      doc.gc = gc;
      if (persistence !== null) {
        persistence.bindState(docname, doc);
      }
      docs.set(docname, doc);
      return doc;
    });
  }

  private onMessage(
    conn: WebSocket,
    doc: WSSharedDoc,
    message: Uint8Array
  ): void {
    try {
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder) as MessageType;
      const encoder = encoding.createEncoder();

      this.messageHandler.handleMessage(
        messageType,
        decoder,
        encoder,
        doc,
        conn
      );

      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  }
}

export function updateHandler(
  update: Uint8Array,
  _origin: unknown,
  doc: WSSharedDoc,
  _tr: Y.Transaction
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MessageType.Sync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
  void debouncedSave(doc);
}
