import { IncomingMessage } from 'http';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as map from 'lib0/map';
import { Duplex } from 'stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { debouncedSave } from './debounced-save';
import { WSSharedDoc } from './ws-shared-doc';

const messageSync = 0;
export const messageAwareness = 1;
// Keep track of docs in memory
const docs = new Map<string, WSSharedDoc>();
export { docs };
// Persistence interface
export interface PersistenceAdapter {
  bindState(docName: string, ydoc: Y.Doc): void;
  writeState(docName: string, ydoc: Y.Doc): Promise<void>; // Changed from Promise<any>
}

// Our persistence object (initially null)
let persistence: PersistenceAdapter | null = null;

export function setPersistence(persistence_: PersistenceAdapter): void {
  persistence = persistence_;
}

export function getPersistence(): PersistenceAdapter | null {
  return persistence;
}

/**
 * Gets a Y.Doc by name, creates it if it doesn't exist.
 * @param docname - The name of the document.
 * @param gc - Garbage collection flag.
 * @returns The shared document.
 */
export function getYDoc(docname: string, gc = true): WSSharedDoc {
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
export function updateHandler(
  update: Uint8Array,
  _origin: unknown,
  doc: WSSharedDoc,
  _tr: Y.Transaction
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
  void debouncedSave(doc); // Call debouncedSave function
}

/**
 * Sets up a WebSocket connection for a specific document.
 * @param conn - The WebSocket connection.
 * @param req - The incoming HTTP request.
 * @param options - Additional options.
 */
export function setupWSConnection(
  conn: WebSocket,
  req: IncomingMessage,
  { docName = (req.url || '').slice(1).split('?')[0], gc = true } = {}
): void {
  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(docName, gc);
  doc.conns.set(conn, new Set());

  conn.on('message', (message: RawData) => {
    messageListener(conn, doc, new Uint8Array(message as ArrayBuffer));
  });

  const pingTimeout = 30000;
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch (e) {
        // Line 185:16 - 'e' is now used
        console.error('Error pinging connection:', e);
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  conn.on('pong', () => {
    pongReceived = true;
  });

  // Send sync step 1
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoderAw = encoding.createEncoder();
      encoding.writeVarUint(encoderAw, messageAwareness);
      encoding.writeVarUint8Array(
        encoderAw,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      send(doc, conn, encoding.toUint8Array(encoderAw));
    }
  }
}

/**
 * Listens for incoming messages on the WebSocket and handles them.
 * @param conn - The WebSocket connection.
 * @param doc - The shared document.
 * @param message - The incoming message.
 */
function messageListener(
  conn: WebSocket,
  doc: WSSharedDoc,
  message: Uint8Array
): void {
  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    const encoder = encoding.createEncoder();
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
      }
      // Optionally handle other message types
    }
  } catch (err) {
    // Line 284:12 - 'err' is now used
    console.error('Error handling message:', err);
    // No 'error' event on Y.Doc, so we just log
  }
}

/**
 * Closes the WebSocket connection and cleans up resources.
 * @param doc - The shared document.
 * @param conn - The WebSocket connection.
 */
function closeConn(doc: WSSharedDoc, conn: WebSocket): void {
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

/**
 * Sends a message to the WebSocket connection.
 * @param doc - The shared document.
 * @param conn - The WebSocket connection.
 * @param m - The message to send.
 */
export function send(doc: WSSharedDoc, conn: WebSocket, m: Uint8Array): void {
  if (conn.readyState !== conn.OPEN && conn.readyState !== conn.CONNECTING) {
    closeConn(doc, conn);
  }
  try {
    conn.send(m, err => {
      if (err) {
        console.error('Error sending message:', err); // Line 297:7 - 'err' is now used
        closeConn(doc, conn);
      }
    });
  } catch (e) {
    // Line 297:7 - 'e' is now used
    console.error('Exception during send:', e);
    closeConn(doc, conn);
  }
}

export interface UpgradeRequest extends IncomingMessage {
  url: string;
}

export class WebSocketHandler {
  private wss: WebSocketServer;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
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
      console.log(`[DUMMY] Validating cookie for document: ${docName}`);

      this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        setupWSConnection(ws, request, { docName, gc: true });
      });
    } else {
      console.log('Not a y-websocket upgrade request');
    }
  }
}
