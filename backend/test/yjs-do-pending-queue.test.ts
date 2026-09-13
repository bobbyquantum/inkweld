import { beforeAll, describe, expect, it, mock } from 'bun:test';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';

/**
 * Regression tests for the pre-auth message queue in the Yjs Durable Object.
 *
 * y-websocket starts the sync handshake as soon as the socket opens, before
 * the server has answered the auth text message, so binary frames routinely
 * arrive while auth is in flight and are queued in `pendingMessages`. The
 * drain used to call `applyDocumentMessage` directly, bypassing the
 * read-only-viewer gate that the live path applies. A viewer could therefore
 * queue a mutation (including a deletion) and have it applied and broadcast
 * the moment auth completed — reachable accidentally on any reconnect.
 *
 * The DO base class lives in `cloudflare:workers`, which Bun can't import, so
 * the module is stubbed and the private dispatch methods are exercised
 * directly with fake sockets and a fake shared doc (same approach as
 * yjs-do-close-codes.test.ts).
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
const Y_MESSAGE_AWARENESS = 1;

interface FakeSharedDoc {
  awareness: awarenessProtocol.Awareness;
  update: ReturnType<typeof mock>;
  applied: Uint8Array[];
}

function makeSharedDoc(): FakeSharedDoc {
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);
  awareness.setLocalState(null);
  const applied: Uint8Array[] = [];
  return {
    awareness,
    applied,
    update: mock((frame: Uint8Array) => {
      applied.push(frame);
    }),
  };
}

function makeWs() {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
    close: () => {},
    serializeAttachment: () => {},
    deserializeAttachment: () => null,
  };
}

interface ConnInfo {
  documentId: string;
  authenticated: boolean;
  canWrite: boolean;
  sharedDoc: unknown;
  pendingMessages: ArrayBuffer[];
  awarenessClientIds: Set<number>;
}

function makeConnInfo(sharedDoc: FakeSharedDoc, canWrite: boolean): ConnInfo {
  return {
    documentId: 'alice:proj:doc-1',
    authenticated: true,
    canWrite,
    sharedDoc,
    pendingMessages: [],
    awarenessClientIds: new Set(),
  };
}

/** A sync-update frame carrying a real Yjs mutation (what an editor sends). */
function updateFrame(): ArrayBuffer {
  const source = new Y.Doc();
  source.getArray('elements').insert(0, [{ id: 'e1' }]);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(source));
  return toArrayBuffer(encoding.toUint8Array(encoder));
}

/** A sync-step-1 frame (state vector request) — always allowed for viewers. */
function syncStep1Frame(): ArrayBuffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, new Y.Doc());
  return toArrayBuffer(encoding.toUint8Array(encoder));
}

/** An awareness frame — always allowed for viewers. */
function awarenessFrame(): ArrayBuffer {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState({ user: 'viewer' });
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID])
  );
  const frame = toArrayBuffer(encoding.toUint8Array(encoder));
  awareness.destroy();
  return frame;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

let YjsProject: new (state: unknown, env: unknown) => unknown;

interface DoInternals {
  drainPendingMessages(ws: unknown, connInfo: ConnInfo): void;
  handleBinaryMessage(ws: unknown, connInfo: ConnInfo, message: ArrayBuffer): void;
}

function makeDO(): DoInternals {
  const state = { storage: {}, setWebSocketAutoResponse: () => {} };
  return new YjsProject(state, {
    DATABASE_KEY: 'test-database-key-long-enough-for-hmac-32',
  }) as unknown as DoInternals;
}

describe('YjsProject DO pre-auth queue drain', () => {
  beforeAll(async () => {
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: new (state: unknown, env: unknown) => unknown;
    });
  });

  it('drops queued mutation frames from a read-only viewer', () => {
    const doInstance = makeDO();
    const sharedDoc = makeSharedDoc();
    const connInfo = makeConnInfo(sharedDoc, /* canWrite */ false);
    connInfo.pendingMessages = [updateFrame(), updateFrame()];

    doInstance.drainPendingMessages(makeWs(), connInfo);

    expect(sharedDoc.update).not.toHaveBeenCalled();
    expect(connInfo.pendingMessages).toEqual([]);
  });

  it('still replays read-only-safe frames (sync-step-1, awareness) for a viewer', () => {
    const doInstance = makeDO();
    const sharedDoc = makeSharedDoc();
    const connInfo = makeConnInfo(sharedDoc, false);
    const step1 = syncStep1Frame();
    connInfo.pendingMessages = [step1, awarenessFrame(), updateFrame()];

    doInstance.drainPendingMessages(makeWs(), connInfo);

    // Only the sync-step-1 reaches the document (awareness is routed to the
    // awareness registry, the update is blocked).
    expect(sharedDoc.update).toHaveBeenCalledTimes(1);
    expect(Array.from(sharedDoc.applied[0])).toEqual(Array.from(new Uint8Array(step1)));
    expect(sharedDoc.awareness.getStates().size).toBe(1);
  });

  it('replays queued mutation frames for a writer', () => {
    const doInstance = makeDO();
    const sharedDoc = makeSharedDoc();
    const connInfo = makeConnInfo(sharedDoc, /* canWrite */ true);
    connInfo.pendingMessages = [updateFrame(), updateFrame()];

    doInstance.drainPendingMessages(makeWs(), connInfo);

    expect(sharedDoc.update).toHaveBeenCalledTimes(2);
    expect(connInfo.pendingMessages).toEqual([]);
  });

  it('applies the same gate to queued frames as to live frames', () => {
    const doInstance = makeDO();
    const ws = makeWs();

    // Live path: a viewer's update after auth is dropped.
    const liveDoc = makeSharedDoc();
    const liveConn = makeConnInfo(liveDoc, false);
    doInstance.handleBinaryMessage(ws, liveConn, updateFrame());
    expect(liveDoc.update).not.toHaveBeenCalled();

    // Queued path: the identical frame queued before auth is also dropped.
    const queuedDoc = makeSharedDoc();
    const queuedConn = makeConnInfo(queuedDoc, false);
    queuedConn.pendingMessages = [updateFrame()];
    doInstance.drainPendingMessages(ws, queuedConn);
    expect(queuedDoc.update).not.toHaveBeenCalled();
  });

  it('queues frames while unauthenticated instead of applying them', () => {
    const doInstance = makeDO();
    const sharedDoc = makeSharedDoc();
    const connInfo = makeConnInfo(sharedDoc, true);
    connInfo.authenticated = false;
    const frame = updateFrame();

    doInstance.handleBinaryMessage(makeWs(), connInfo, frame);

    expect(sharedDoc.update).not.toHaveBeenCalled();
    expect(connInfo.pendingMessages).toEqual([frame]);
  });
});
