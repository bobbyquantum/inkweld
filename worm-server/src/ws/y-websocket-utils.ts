// utils.mjs (rewritten from bin/utils.cjs) -- ESM version

// Node’s built-in helper to require CJS in an ESM module:

// Import CJS callback bits
import { callbackHandler, isCallbackSet } from './y-websocket-callback.js';
// ESM imports for everything else
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as map from 'lib0/map';
import debounce from 'lodash.debounce';
// Optional environment-based config
const CALLBACK_DEBOUNCE_WAIT = parseInt(
  process.env.CALLBACK_DEBOUNCE_WAIT || '2000',
);
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(
  process.env.CALLBACK_DEBOUNCE_MAXWAIT || '10000',
);
const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';
const pingTimeout = 30000;

// WebSocket "readyState" constants
const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
// const wsReadyStateClosing = 2
// const wsReadyStateClosed = 3

// Persistence (Leveldb or custom). If null, no persistence
let persistence = null;

// Persistence will be set by the gateway

/**
 * Provide or override the global persistence strategy.
 * @param {object|null} persistence_ - the persistence object or null
 */
export function setPersistence(persistence_) {
  persistence = persistence_;
}

/**
 * Returns the currently used persistence layer (if any).
 */
export function getPersistence() {
  return persistence;
}

/**
 * A map of all in-memory docs. Key: docName, Value: WSSharedDoc instance
 */
export const docs = new Map();

// y-protocol message types
const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2

/**
 * Handler called whenever the Y.Doc emits 'update' events.
 * @param {Uint8Array} update
 * @param {any} _origin
 * @param {WSSharedDoc} doc
 */
function updateHandler(update, _origin, doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
}

// We'll define a ContentInitializor type that expects a Y.Doc or a WSSharedDoc:
type ContentInitializor = (doc: Y.Doc) => Promise<void>;

// Suppose we store the function in a variable
let contentInitializor: ContentInitializor = async () => {};

/**
 * If you want to allow the user to set a custom content initializer,
 * you can do:
 */
export function setContentInitializor(fn: ContentInitializor) {
  contentInitializor = fn;
}

/**
 * We define a WebSocket connection interface, or import from 'ws' if you prefer.
 */
interface WSConnection {
  readyState: number;
  send(
    data: Uint8Array,
    options: Record<string, unknown>,
    cb: (err?: Error) => void,
  ): void;
  close(): void;
  on(event: 'message', handler: (data: ArrayBuffer) => void): void;
  on(event: 'close', handler: () => void): void;
  on(event: 'pong', handler: () => void): void;
  ping(): void;
}
/**
 * A Y.Doc specialized for websocket usage. Tracks connections & awareness states.
 */
export class WSSharedDoc extends Y.Doc {
  public name: string;
  public conns: Map<WSConnection, Set<number>>;
  public awareness: awarenessProtocol.Awareness;
  public whenInitialized: Promise<void>;
  /**
   * @param {string} name
   */
  constructor(name) {
    super({ gc: gcEnabled });
    this.name = name;

    // Map<conn, Set<clientIDs>>
    this.conns = new Map();

    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    // When awareness changes, broadcast to all connected clients
    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs) {
          added.forEach((clientID) => connControlledIDs.add(clientID));
          removed.forEach((clientID) => connControlledIDs.delete(clientID));
        }
      }
      // Broadcast awareness update
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };

    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);

    // If callback is set, run callbackHandler on doc changes, with debounce
    if (isCallbackSet) {
      this.on(
        'update',
        debounce(callbackHandler, CALLBACK_DEBOUNCE_WAIT, {
          maxWait: CALLBACK_DEBOUNCE_MAXWAIT,
        }),
      );
    }

    // Let custom content init run. Wait so doc is ready before usage.
    this.whenInitialized = contentInitializor(this);
  }
}

/**
 * Gets (or creates) a WSSharedDoc by name.
 * If persistence is enabled, we bind that doc to storage.
 * @param {string} docname
 * @param {boolean} gc
 * @return {WSSharedDoc}
 */
export function getYDoc(docname, gc = true) {
  return map.setIfUndefined(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence) {
      persistence.bindState(docname, doc);
    }
    docs.set(docname, doc);
    return doc;
  });
}

/**
 * Send message to a given connection, or close if not open.
 * @param {WSSharedDoc} doc
 * @param {import('ws').WebSocket} conn
 * @param {Uint8Array} m
 */
function send(doc, conn, m) {
  if (
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, {}, (err) => {
      if (err != null) closeConn(doc, conn);
    });
  } catch (_e) {
    closeConn(doc, conn);
  }
}

/**
 * Closes a connection and removes it from the doc's tracking.
 * @param {WSSharedDoc} doc
 * @param {import('ws').WebSocket} conn
 */
function closeConn(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    if (controlledIds) {
      awarenessProtocol.removeAwarenessStates(
        doc.awareness,
        Array.from(controlledIds),
        null,
      );
    }
    if (doc.conns.size === 0 && persistence) {
      // no more conns, persist doc & destroy
      persistence.writeState(doc.name, doc).then(() => {
        doc.destroy();
      });
      docs.delete(doc.name);
    }
  }
  conn.close();
}

/**
 * Handle inbound messages from a given connection, parse them, and act accordingly.
 * @param {any} conn
 * @param {WSSharedDoc} doc
 * @param {Uint8Array} message
 */
function messageListener(conn, doc, message) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        // If there's more than just the message type in the encoder,
        // we have data to send back.
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      }
      case messageAwareness: {
        const awarenessUpdate = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          awarenessUpdate,
          conn,
        );
        break;
      }
      // case messageAuth: // etc.
    }
  } catch (err) {
    console.error(err);
    doc.emit('error', [err]);
  }
}

/**
 * Sets up a WebSocket connection for syncing a Y.Doc.
 * @param {import('ws').WebSocket} conn
 * @param {import('http').IncomingMessage} req
 * @param {{ docName?: string, gc?: boolean }} opts
 */
export function setupWSConnection(
  conn,
  req,
  { docName = 'default', gc = true } = {},
) {
  conn.binaryType = 'arraybuffer';
  const url = req.url || '';
  // default doc name from URL if not provided
  const name = docName || url.slice(1).split('?')[0];
  const doc = getYDoc(name, gc);

  doc.conns.set(conn, new Set());
  conn.on('message', (message) => {
    messageListener(conn, doc, new Uint8Array(message));
  });

  // Periodic ping to detect broken connections
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
      } catch (_e) {
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

  // Send initial sync step + awareness states
  {
    // Sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    // Send current awareness
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEnc = encoding.createEncoder();
      encoding.writeVarUint(awarenessEnc, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEnc,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      send(doc, conn, encoding.toUint8Array(awarenessEnc));
    }
  }
}
