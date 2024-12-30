import { IncomingMessage } from 'http';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as map from 'lib0/map';
import debounce from 'lodash.debounce';
import { Pool } from 'pg';
import { RawData, WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { callbackHandler, isCallbackSet } from './callback.js';
import { getProsemirrorContent } from './persistence.js';

// PostgreSQL connection configuration
const pool: Pool = new Pool({
  user: process.env.POSTGRES_USER || 'wormuser',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'wormdb',
  password: process.env.POSTGRES_PASSWORD || 'secret',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

// Some environment vars
const CALLBACK_DEBOUNCE_WAIT = parseInt(
  process.env.CALLBACK_DEBOUNCE_WAIT || '2000'
);
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(
  process.env.CALLBACK_DEBOUNCE_MAXWAIT || '10000'
);

// GC Enabled?
const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';

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

// Keep track of docs in memory
const docs = new Map<string, WSSharedDoc>();
export { docs };

// Message types
const messageSync = 0;
const messageAwareness = 1;

interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

class WSSharedDoc extends Y.Doc {
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

    // Awareness change handler
    this.awareness.on('update', (changes: AwarenessChanges, conn: unknown) => {
      const changedClients = changes.added.concat(
        changes.updated,
        changes.removed
      );

      // 'conn' here is the origin. In practice, it can be the WebSocket connection or null
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
      encoding.writeVarUint(encoder, messageAwareness);
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

    // Debounced callback handler if callback is set
    if (isCallbackSet) {
      this.on(
        'update',
        debounce(
          (update: Uint8Array, origin: unknown, d: Y.Doc) => {
            const doc = d as WSSharedDoc;
            callbackHandler(update, origin, doc);
          },
          CALLBACK_DEBOUNCE_WAIT,
          { maxWait: CALLBACK_DEBOUNCE_MAXWAIT }
        ) as (update: Uint8Array, origin: unknown, doc: Y.Doc) => void
      );
    }

    // Initialize content if needed
    this.whenInitialized = Promise.resolve();
  }
}

export { WSSharedDoc };

function updateHandler(
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
 * Gets a Y.Doc by name, creates it if it doesn't exist.
 * @param docname - The name of the document.
 * @param gc - Garbage collection flag.
 * @returns The shared document.
 */
function getYDoc(docname: string, gc = true): WSSharedDoc {
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
function send(doc: WSSharedDoc, conn: WebSocket, m: Uint8Array): void {
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

/**
 * Retrieves the shared object content for callbacks.
 * @param doc - The shared document.
 * @param objName - The name of the shared object.
 * @param objType - The type of the shared object.
 * @returns The content of the shared object.
 */
export function getYDocSharedObjectContent(
  doc: WSSharedDoc,
  objName: string,
  objType: string
): unknown {
  // Changed return type from 'any' to 'unknown'
  switch (objType) {
    case 'Array':
      return doc.getArray(objName).toJSON();
    case 'Map':
      return doc.getMap(objName).toJSON();
    case 'Text':
      return doc.getText(objName).toJSON();
    case 'XmlFragment':
      return doc.getXmlFragment(objName).toJSON();
    case 'XmlElement':
      return doc.getXmlElement(objName).toJSON();
    default:
      return {};
  }
}

// Debounced save function
const debouncedSave = debounce(
  (doc: WSSharedDoc) => {
    try {
      pool.connect((err, client, done) => {
        if (!client) {
          console.error('Error connecting to the database:', err);
          return;
        }
        const { content, error } = getProsemirrorContent(doc);
        if (error) {
          console.error(
            `Error getting ProseMirror content for ${doc.name}:`,
            error
          );
        }
        // now find the project_element with the correct id (doc.name)
        client.query(
          'SELECT * FROM project_elements WHERE id = $1',
          [doc.name],
          (err, res) => {
            done();
            if (err) {
              console.error('Error fetching project_element:', err);
            } else {
              if (res.rows.length === 0) {
                console.error("Document doesn't exist in the database.");
              } else {
                // If the project_element exists, update it
                client.query(
                  'UPDATE project_elements SET content = $2 WHERE id = $1',
                  [doc.name, content],
                  (err, _res) => {
                    if (err) {
                      console.error('Error updating project_element:', err);
                    } else {
                      console.log(`Document ${doc.name} saved successfully.`);
                    }
                  }
                );
              }
            }
          }
        );
      });
      console.log(`Document ${doc.name} saved successfully.`);
    } catch (error) {
      console.error(`Error saving document ${doc.name}:`, error);
    }
  },
  CALLBACK_DEBOUNCE_WAIT,
  { maxWait: CALLBACK_DEBOUNCE_MAXWAIT }
);

export { debouncedSave };
