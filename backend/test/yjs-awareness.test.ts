import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';

import { YjsService } from '../src/services/yjs.service';

/**
 * Regression tests for presence/awareness lifecycle on the Bun Yjs server.
 *
 * The bug these guard against: when a client's WebSocket disconnects, the
 * server previously left the client's awareness state in `doc.awareness`.
 * On each refresh the client reconnected with a new clientID and inherited
 * all stale states on the initial sync, stacking up a ghost presence
 * indicator per refresh.
 *
 * The service is transport-agnostic — it accepts any object with `send(data)`
 * — so we can drive it with a lightweight fake without standing up a real
 * WebSocket server.
 */

interface FakeSocket {
  readonly sent: Uint8Array[];
  send(data: Uint8Array): void;
  close(): void;
}

function makeSocket(): FakeSocket {
  return {
    sent: [],
    send(data: Uint8Array): void {
      this.sent.push(data);
    },
    close(): void {
      /* no-op */
    },
  };
}

/**
 * Build the wire-format Yjs awareness message a client would send for the
 * given state. Uses a throwaway Y.Doc + Awareness pair so the clientID is a
 * real Yjs-generated one. Returns the wire payload and the clientID so tests
 * can assert server-side cleanup.
 *
 * Wire format (matches y-websocket):
 *   [messageAwareness (varUint=1), encodeAwarenessUpdate(...)]
 */
function makeAwarenessFrame(state: Record<string, unknown>): {
  frame: Buffer;
  clientId: number;
} {
  const scratchDoc = new Y.Doc();
  const scratch = new awarenessProtocol.Awareness(scratchDoc);
  scratch.setLocalState(state);
  const clientId = scratchDoc.clientID;
  const payload = awarenessProtocol.encodeAwarenessUpdate(scratch, [clientId]);
  scratch.destroy();
  scratchDoc.destroy();

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 1); // messageAwareness
  encoding.writeVarUint8Array(encoder, payload);
  return { frame: Buffer.from(encoding.toUint8Array(encoder)), clientId };
}

/** Build an awareness frame for a specific client id (used for reconnect race tests). */
function makeAwarenessFrameForClient(
  clientId: number,
  state: Record<string, unknown>,
  clock = 0
): Buffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 1); // one client state entry
  encoding.writeVarUint(encoder, clientId);
  encoding.writeVarUint(encoder, clock);
  encoding.writeVarString(encoder, JSON.stringify(state));

  const message = encoding.createEncoder();
  encoding.writeVarUint(message, 1); // messageAwareness
  encoding.writeVarUint8Array(message, encoding.toUint8Array(encoder));
  return Buffer.from(encoding.toUint8Array(message));
}

const documentId = 'alice:demo:elements/';

describe('YjsService awareness lifecycle', () => {
  let service: YjsService;

  beforeEach(() => {
    service = new YjsService();
  });

  afterEach(async () => {
    await service.cleanup();
  });

  it('removes awareness state for a client when its socket disconnects', async () => {
    const doc = await service.getDocument(documentId);
    const ws = makeSocket();
    await service.handleConnection(ws, documentId);

    const { frame, clientId } = makeAwarenessFrame({
      user: { name: 'Alice', color: '#f00' },
    });
    service.handleMessage(ws, doc, frame);
    expect(doc.awareness.getStates().has(clientId)).toBe(true);

    service.handleDisconnect(ws, doc);

    expect(doc.awareness.getStates().has(clientId)).toBe(false);
  });

  it('does not broadcast a server-side user identity on connect', async () => {
    // Regression: handleConnection used to `setLocalStateField('user', {id})`
    // which both leaked every authenticating user's id to awareness AND
    // stomped the previous user's identity.
    const doc = await service.getDocument(documentId);
    const ws = makeSocket();
    await service.handleConnection(ws, documentId, 'user-123');

    const states = doc.awareness.getStates();
    expect(states.size).toBe(0);
    expect(states.has(doc.doc.clientID)).toBe(false);
    for (const [, state] of states) {
      expect((state as { user?: unknown }).user).toBeUndefined();
    }
  });

  it('does not leak ghost users from earlier refreshes to new connections', async () => {
    const doc = await service.getDocument(documentId);

    // First tab connects, sets awareness, then closes (refresh).
    const wsA = makeSocket();
    await service.handleConnection(wsA, documentId);
    const { frame, clientId } = makeAwarenessFrame({
      user: { name: 'Alice', color: '#f00' },
    });
    service.handleMessage(wsA, doc, frame);
    service.handleDisconnect(wsA, doc);

    // Second tab connects. The initial awareness frame it receives must NOT
    // contain the prior client's state.
    const wsB = makeSocket();
    await service.handleConnection(wsB, documentId);

    expect(doc.awareness.getStates().has(clientId)).toBe(false);

    // `handleConnection` sends sync-step-1 + awareness snapshot. With an
    // empty awareness map we should not have emitted an awareness frame.
    const messageTypes = wsB.sent.map((buf) => buf[0]);
    expect(messageTypes.every((t) => t === 0)).toBe(true);
  });

  it('broadcasts awareness removals to peers when a client disconnects', async () => {
    const doc = await service.getDocument(documentId);

    const wsA = makeSocket();
    const wsB = makeSocket();
    await service.handleConnection(wsA, documentId);
    await service.handleConnection(wsB, documentId);

    const { frame } = makeAwarenessFrame({
      user: { name: 'Alice', color: '#f00' },
    });
    service.handleMessage(wsA, doc, frame);

    const framesBeforeDisconnect = wsB.sent.length;

    service.handleDisconnect(wsA, doc);

    // The remaining peer must have received at least one new frame (the
    // awareness removal) so it can unmount the ghost avatar.
    expect(wsB.sent.length).toBeGreaterThan(framesBeforeDisconnect);
    const awarenessFrames = wsB.sent.slice(framesBeforeDisconnect).filter((buf) => buf[0] === 1);
    expect(awarenessFrames.length).toBeGreaterThan(0);
  });

  it('keeps awareness when same client id reconnects on a new socket', async () => {
    const doc = await service.getDocument(documentId);

    const wsA = makeSocket();
    const wsB = makeSocket();
    await service.handleConnection(wsA, documentId);
    await service.handleConnection(wsB, documentId);

    const sharedClientId = 777;

    // First connection owns the client id.
    service.handleMessage(
      wsA,
      doc,
      makeAwarenessFrameForClient(
        sharedClientId,
        {
          user: { name: 'Alice', color: '#f00' },
        },
        1
      )
    );
    expect(doc.awareness.getStates().has(sharedClientId)).toBe(true);

    // Reconnect on a new socket with the same client id before wsA closes.
    service.handleMessage(
      wsB,
      doc,
      makeAwarenessFrameForClient(
        sharedClientId,
        {
          user: { name: 'Alice (reconnected)', color: '#0f0' },
        },
        2
      )
    );

    // Closing the old socket must not remove the live client's awareness.
    service.handleDisconnect(wsA, doc);

    const state = doc.awareness.getStates().get(sharedClientId) as
      | { user?: { name?: string } }
      | undefined;
    expect(state).toBeDefined();
    expect(state?.user?.name).toBe('Alice (reconnected)');
  });
});
