import { beforeAll, describe, expect, it, mock } from 'bun:test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

/**
 * Frames that arrive after the Durable Object has sent `authenticated` but
 * before it has loaded the document must be queued and replayed, not dropped.
 *
 * `handleAuthMessage` answers `authenticated` and only then awaits
 * `getOrCreateDocument`. A client that starts syncing once it hears
 * `authenticated` (or sends an edit in that window) used to have its frames
 * routed to a connection with no `sharedDoc`, which logged and discarded them:
 * a sync step 1 got no step 2 reply on Workers, while Bun answered it.
 *
 * Same `cloudflare:workers` stub approach as yjs-do-close-codes.test.ts; the
 * token check, access lookup and document load are stubbed on the instance.
 */

mock.module('cloudflare:workers', () => ({
  DurableObject: class DurableObjectStub {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
(globalThis as Record<string, unknown>).WebSocketRequestResponsePair = class {
  constructor(_request: string, _response: string) {}
};

const Y_MESSAGE_SYNC = 0;
const DOCUMENT_ID = 'alice:proj:doc-1';

function makeWs() {
  const ws = {
    readyState: WebSocket.OPEN as number,
    sent: [] as Array<string | Uint8Array>,
    send(message: string | Uint8Array) {
      ws.sent.push(message);
    },
    close() {
      ws.readyState = WebSocket.CLOSED;
    },
    serializeAttachment() {},
    deserializeAttachment() {
      return null;
    },
  };
  return ws;
}

type FakeWs = ReturnType<typeof makeWs>;

interface ConnInfo {
  documentId: string;
  authenticated: boolean;
  canWrite: boolean;
  sharedDoc?: unknown;
  loadingDocument?: boolean;
  pendingMessages: ArrayBuffer[];
  pendingBytes?: number;
  awarenessClientIds: Set<number>;
}

interface DoInternals {
  connections: Map<unknown, ConnInfo>;
  handleAuthMessage(ws: unknown, connInfo: ConnInfo, token: string): Promise<void>;
  handleBinaryMessage(ws: unknown, connInfo: ConnInfo, message: ArrayBuffer): void;
  verifyToken(token: string): Promise<unknown>;
  getDb(): unknown;
  checkAccessWithDb(): Promise<{ canWrite: boolean; projectDbId: string }>;
  getOrCreateDocument(documentId: string): Promise<Y.Doc>;
}

let YjsProject: new (state: unknown, env: unknown) => unknown;
let WSSharedDoc: new () => Y.Doc;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function syncStep1Frame(doc: Y.Doc): ArrayBuffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return toArrayBuffer(encoding.toUint8Array(encoder));
}

function updateFrame(text: string): ArrayBuffer {
  const source = new Y.Doc();
  source.getText('t').insert(0, text);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(source));
  return toArrayBuffer(encoding.toUint8Array(encoder));
}

/** The sync sub-type (step 1 / step 2 / update) of each binary sync frame sent. */
function syncFramesSent(ws: FakeWs): Array<{ type: number; payload: Uint8Array }> {
  return ws.sent
    .filter((m): m is Uint8Array => typeof m !== 'string')
    .map((m) => {
      const decoder = decoding.createDecoder(m);
      if (decoding.readVarUint(decoder) !== Y_MESSAGE_SYNC) return null;
      const type = decoding.readVarUint(decoder);
      return { type, payload: decoding.readVarUint8Array(decoder) };
    })
    .filter((f): f is { type: number; payload: Uint8Array } => f !== null);
}

/**
 * A DO whose document load is held open until `release()` is called, so a test
 * can deliver frames in the window between `authenticated` and the load.
 */
function makeDO(serverDoc: Y.Doc) {
  const doInstance = new YjsProject(
    { storage: {}, setWebSocketAutoResponse: () => {}, getWebSockets: () => [] },
    { DATABASE_KEY: 'test-database-key-long-enough-for-hmac-32' }
  ) as unknown as DoInternals;

  let release!: () => void;
  const loaded = new Promise<void>((resolve) => {
    release = resolve;
  });
  let loadStarted!: () => void;
  const loading = new Promise<void>((resolve) => {
    loadStarted = resolve;
  });

  doInstance.verifyToken = async () => ({ userId: 'u1', username: 'alice' });
  doInstance.getDb = () => ({});
  doInstance.checkAccessWithDb = async () => ({ canWrite: true, projectDbId: '' });
  doInstance.getOrCreateDocument = async () => {
    loadStarted();
    await loaded;
    return serverDoc;
  };

  return { doInstance, loading, release };
}

function makeConnInfo(): ConnInfo {
  return {
    documentId: DOCUMENT_ID,
    authenticated: false,
    canWrite: false,
    pendingMessages: [],
    pendingBytes: 0,
    awarenessClientIds: new Set(),
  };
}

describe('YjsProject DO frames sent while the document loads', () => {
  beforeAll(async () => {
    ({ WSSharedDoc } = (await import('y-durableobjects')) as unknown as {
      WSSharedDoc: new () => Y.Doc;
    });
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: new (state: unknown, env: unknown) => unknown;
    });
  });

  it('answers a sync step 1 sent right after `authenticated` with a sync step 2', async () => {
    const serverDoc = new WSSharedDoc();
    serverDoc.getText('t').insert(0, 'server copy');
    const { doInstance, loading, release } = makeDO(serverDoc);
    const ws = makeWs();
    const connInfo = makeConnInfo();
    doInstance.connections.set(ws, connInfo);

    const auth = doInstance.handleAuthMessage(ws, connInfo, 'token');
    await loading;
    expect(ws.sent).toEqual(['authenticated']);

    // The client syncs only once it hears `authenticated`.
    const clientDoc = new Y.Doc();
    doInstance.handleBinaryMessage(ws, connInfo, syncStep1Frame(clientDoc));
    expect(connInfo.pendingMessages).toHaveLength(1);

    release();
    await auth;

    const step2 = syncFramesSent(ws).find((f) => f.type === syncProtocol.messageYjsSyncStep2);
    if (!step2) throw new Error('no sync step 2 reply');
    Y.applyUpdate(clientDoc, step2.payload);
    expect(clientDoc.getText('t').toString()).toBe('server copy');
    expect(connInfo.pendingMessages).toEqual([]);
    expect(connInfo.loadingDocument).toBe(false);
  });

  it('applies updates sent during the load, in order, once the document is ready', async () => {
    const serverDoc = new WSSharedDoc();
    const { doInstance, loading, release } = makeDO(serverDoc);
    const ws = makeWs();
    const connInfo = makeConnInfo();
    doInstance.connections.set(ws, connInfo);

    const auth = doInstance.handleAuthMessage(ws, connInfo, 'token');
    await loading;
    doInstance.handleBinaryMessage(ws, connInfo, updateFrame('first'));
    doInstance.handleBinaryMessage(ws, connInfo, updateFrame('second'));
    release();
    await auth;

    const text = serverDoc.getText('t').toString();
    expect(text).toContain('first');
    expect(text).toContain('second');

    // Frames after the drain go straight to the document.
    doInstance.handleBinaryMessage(ws, connInfo, updateFrame('third'));
    expect(connInfo.pendingMessages).toEqual([]);
    expect(serverDoc.getText('t').toString()).toContain('third');
  });

  it('releases the queue when the socket closes during the load', async () => {
    const serverDoc = new WSSharedDoc();
    const { doInstance, loading, release } = makeDO(serverDoc);
    const ws = makeWs();
    const connInfo = makeConnInfo();
    doInstance.connections.set(ws, connInfo);

    const auth = doInstance.handleAuthMessage(ws, connInfo, 'token');
    await loading;
    doInstance.handleBinaryMessage(ws, connInfo, updateFrame('lost'));
    ws.readyState = WebSocket.CLOSED;
    release();
    await auth;

    expect(serverDoc.getText('t').toString()).toBe('');
    expect(connInfo.pendingMessages).toEqual([]);
    expect(connInfo.pendingBytes).toBe(0);
    expect(connInfo.loadingDocument).toBe(false);
  });
});
