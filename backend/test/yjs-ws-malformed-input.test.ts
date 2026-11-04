import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import {
  PRESENCE_KEEPALIVE_PING,
  PRESENCE_KEEPALIVE_PONG,
  Y_MESSAGE_PRESENCE,
  encodePresenceFrame,
  writeHello,
} from '@inkweld/presence';
import { authService } from '../src/services/auth.service';
import { presenceService } from '../src/services/presence.service';
import { yjsService } from '../src/services/yjs.service';
import {
  WS_CLOSE_INVALID_DOCUMENT,
  WS_CLOSE_PROJECT_NOT_FOUND,
  WS_CLOSE_SERVER_ERROR,
} from '../src/utils/ws-close-codes';
import { MAX_YJS_JSON_DEPTH } from '../src/utils/yjs-message-limits';
import { enablePasswordLoginForTests, startTestServer, stopTestServer } from './server-test-helper';
import {
  connectYjsSocket,
  createWsFixture,
  removeWsFixture,
  waitForSocket,
  type CollectedSocket,
  type WsFixture,
} from './ws-test-helper';
import {
  MESSAGE_AWARENESS,
  awarenessMessage,
  legacyJsonUpdate,
  nestedArrays,
  syncMessage,
  updateOf,
} from './yjs-message-fixtures';

/**
 * These tests drive the real Bun sync route: frames that do not decode, and
 * content nested deeper than the message limits allow, are dropped while the
 * socket, its peers and plain HTTP keep working; a failing handler only closes
 * its own socket; document ids are checked when the socket opens, so a
 * malformed one is closed before any token or document work, while every id
 * form real clients send still syncs.
 */

const USERNAME = 'malformedwsuser';
const SLUG = 'malformed-ws';

/** Binary frames a client might send that no sync handler can read. */
const MALFORMED_FRAMES: { name: string; bytes: Uint8Array }[] = [
  // A varuint with its continuation bit set and nothing after it.
  { name: 'truncated message type', bytes: new Uint8Array([0x80]) },
  // Continuation bytes past the largest integer lib0 reads.
  { name: 'oversized message type', bytes: new Uint8Array(16).fill(0xff) },
  { name: 'empty frame', bytes: new Uint8Array(0) },
  // Valid outer types with nothing readable after them.
  { name: 'presence tag only', bytes: new Uint8Array([Y_MESSAGE_PRESENCE]) },
  { name: 'truncated sync body', bytes: new Uint8Array([0, 0x80]) },
  { name: 'truncated awareness body', bytes: new Uint8Array([1, 0xff, 0xff]) },
];

function syncStep1(): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, new Y.Doc());
  return encoding.toUint8Array(encoder);
}

/** A sync update frame that writes `text` into the `probe` text. */
function updateFrame(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText('probe').insert(0, text);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
  return encoding.toUint8Array(encoder);
}

/** Collect the Yjs payloads of the sync step 2 replies and updates `socket` receives. */
function collectSyncPayloads(socket: CollectedSocket): Uint8Array[] {
  const payloads: Uint8Array[] = [];
  socket.ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') return;
    const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
    if (decoding.readVarUint(decoder) !== 0) return;
    const subType = decoding.readVarUint(decoder);
    if (subType !== 1 && subType !== 2) return;
    payloads.push(decoding.readVarUint8Array(decoder));
  });
  return payloads;
}

function probeText(payloads: Uint8Array[]): string {
  const doc = new Y.Doc();
  for (const payload of payloads) Y.applyUpdate(doc, payload);
  return doc.getText('probe').toString();
}

/** The shared Bun service's document under `documentId`, if it holds one. */
function serviceDoc(documentId: string): { conns: Map<unknown, unknown> } | undefined {
  return (
    yjsService as unknown as { docs: Map<string, { conns: Map<unknown, unknown> }> }
  ).docs.get(documentId);
}

/** Whether the shared Bun service holds a document under `documentId`. */
function serviceHolds(documentId: string): boolean {
  return serviceDoc(documentId) !== undefined;
}

/** Collect the awareness client ids `socket` is told about. */
function collectAwarenessClients(socket: CollectedSocket): Set<number> {
  const scratchDoc = new Y.Doc();
  const scratch = new awarenessProtocol.Awareness(scratchDoc);
  scratch.setLocalState(null);
  const clients = new Set<number>();
  socket.ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') return;
    const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
    if (decoding.readVarUint(decoder) !== MESSAGE_AWARENESS) return;
    awarenessProtocol.applyAwarenessUpdate(scratch, decoding.readVarUint8Array(decoder), 'test');
    for (const id of scratch.getStates().keys()) clients.add(id);
  });
  socket.closed.then(
    () => scratch.destroy(),
    () => scratch.destroy()
  );
  return clients;
}

describe('Yjs WebSocket route with malformed input', () => {
  let baseUrl = '';
  let fixture: WsFixture;
  const open: CollectedSocket[] = [];

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    fixture = await createWsFixture(baseUrl, USERNAME, SLUG);
  });

  afterAll(async () => {
    await removeWsFixture(fixture, open);
    await stopTestServer();
  });

  async function connect(documentId: string): Promise<CollectedSocket> {
    const socket = await connectYjsSocket(baseUrl, documentId);
    open.push(socket);
    return socket;
  }

  async function connectSignedIn(documentId = fixture.documentId): Promise<CollectedSocket> {
    const socket = await connect(documentId);
    socket.ws.send(fixture.token);
    await waitForSocket(() => socket.texts.length > 0);
    expect(socket.texts).toEqual(['authenticated']);
    return socket;
  }

  describe('frames that do not decode', () => {
    it('drops them and keeps serving the socket, its peers and HTTP', async () => {
      const peer = await connectSignedIn();
      const peerPayloads = collectSyncPayloads(peer);
      const sender = await connectSignedIn();
      const senderPayloads = collectSyncPayloads(sender);

      for (const { bytes } of MALFORMED_FRAMES) sender.ws.send(bytes);
      // Frames on one socket are handled in order, so the update and the
      // reply to the read request show everything before them was handled.
      sender.ws.send(updateFrame('[after malformed frames]'));
      sender.ws.send(syncStep1());
      await waitForSocket(() => probeText(senderPayloads).includes('[after malformed frames]'));

      expect(sender.ws.readyState).toBe(WebSocket.OPEN);
      expect(sender.texts).toEqual(['authenticated']);

      // The socket still answers the keepalive.
      sender.ws.send(PRESENCE_KEEPALIVE_PING);
      await waitForSocket(() => sender.texts.includes(PRESENCE_KEEPALIVE_PONG));

      // The peer received the update broadcast and still syncs.
      await waitForSocket(() => probeText(peerPayloads).includes('[after malformed frames]'));
      expect(peer.ws.readyState).toBe(WebSocket.OPEN);

      // The server still answers HTTP and authenticates new sockets.
      const health = await fetch(`${baseUrl}/api/v1/health`);
      expect(health.status).toBe(200);
      await connectSignedIn();
    });

    it('drops them when they were queued before the token', async () => {
      const socket = await connect(fixture.documentId);
      const payloads = collectSyncPayloads(socket);
      for (const { bytes } of MALFORMED_FRAMES) socket.ws.send(bytes);
      socket.ws.send(updateFrame('[queued after malformed frames]'));
      socket.ws.send(syncStep1());
      socket.ws.send(fixture.token);

      await waitForSocket(() => probeText(payloads).includes('[queued after malformed frames]'));
      expect(socket.texts).toEqual(['authenticated']);
      expect(socket.ws.readyState).toBe(WebSocket.OPEN);

      const health = await fetch(`${baseUrl}/api/v1/health`);
      expect(health.status).toBe(200);
    });
  });

  describe('a handler that fails', () => {
    /** The server still answers HTTP and signs a new socket in. */
    async function expectServerServing(): Promise<void> {
      const health = await fetch(`${baseUrl}/api/v1/health`);
      expect(health.status).toBe(200);
      await connectSignedIn();
    }

    it('closes only that socket, with the transient code, when a frame handler throws', async () => {
      const peer = await connectSignedIn();
      const socket = await connectSignedIn();
      const handleMessage = spyOn(yjsService, 'handleMessage').mockImplementation(() => {
        throw new Error('simulated handler failure');
      });
      try {
        socket.ws.send(syncStep1());
        const closed = await socket.closed;
        expect(closed.code).toBe(WS_CLOSE_SERVER_ERROR);
      } finally {
        handleMessage.mockRestore();
      }
      expect(peer.ws.readyState).toBe(WebSocket.OPEN);
      await expectServerServing();
    });

    it('denies with the transient code when sign-in fails', async () => {
      const verifyToken = spyOn(authService, 'verifyToken').mockRejectedValue(
        new Error('simulated sign-in failure')
      );
      try {
        const socket = await connect(fixture.documentId);
        socket.ws.send(fixture.token);
        const closed = await socket.closed;
        expect(closed.code).toBe(WS_CLOSE_SERVER_ERROR);
        expect(socket.texts).toEqual(['access-denied:error']);
      } finally {
        verifyToken.mockRestore();
      }
      await expectServerServing();
    });

    it('runs the rest of the close cleanup when one step throws', async () => {
      const id = `${USERNAME}:${SLUG}:close-cleanup-doc/`;
      const socket = await connectSignedIn(id);
      expect(serviceDoc(id)?.conns.size).toBe(1);
      const removeSocket = spyOn(presenceService, 'removeSocket').mockImplementation(() => {
        throw new Error('simulated cleanup failure');
      });
      try {
        socket.ws.close();
        await socket.closed;
        await waitForSocket(() => removeSocket.mock.calls.length > 0);
        // The disconnect step after the failing one still let go of the socket.
        await waitForSocket(() => serviceDoc(id)?.conns.size === 0);
      } finally {
        removeSocket.mockRestore();
      }
      await expectServerServing();
    });
  });

  describe('content nested deeper than the limits allow', () => {
    it('drops it, and the socket, later sockets and HTTP keep working', async () => {
      const id = `${USERNAME}:${SLUG}:nesting-doc/`;
      const sender = await connectSignedIn(id);
      const senderPayloads = collectSyncPayloads(sender);
      const tooDeep = nestedArrays(MAX_YJS_JSON_DEPTH + 1);

      sender.ws.send(
        awarenessMessage([{ clientId: 4242, clock: 1, stateJson: JSON.stringify(tooDeep) }])
      );
      sender.ws.send(syncMessage(updateOf((doc) => doc.getArray('deep').insert(0, [tooDeep]))));
      sender.ws.send(syncMessage(legacyJsonUpdate('legacy', JSON.stringify(tooDeep))));
      sender.ws.send(awarenessMessage([{ clientId: 4343, clock: 1, stateJson: '{"user":"a"}' }]));
      sender.ws.send(updateFrame('[after nested content]'));
      sender.ws.send(syncStep1());
      await waitForSocket(() => probeText(senderPayloads).includes('[after nested content]'));
      expect(sender.ws.readyState).toBe(WebSocket.OPEN);
      expect(sender.texts).toEqual(['authenticated']);

      // A socket that joins now signs in, gets the awareness state that was
      // kept and the document without the dropped content.
      const late = await connect(id);
      const lateClients = collectAwarenessClients(late);
      const latePayloads = collectSyncPayloads(late);
      late.ws.send(fixture.token);
      await waitForSocket(() => late.texts.length > 0);
      expect(late.texts).toEqual(['authenticated']);
      late.ws.send(syncStep1());
      await waitForSocket(() => probeText(latePayloads).includes('[after nested content]'));
      expect([...lateClients]).toEqual([4343]);
      const copy = new Y.Doc();
      for (const payload of latePayloads) Y.applyUpdate(copy, payload);
      expect(copy.getArray('deep')).toHaveLength(0);
      expect(copy.getArray('legacy')).toHaveLength(0);

      const health = await fetch(`${baseUrl}/api/v1/health`);
      expect(health.status).toBe(200);
    });
  });

  describe('document ids', () => {
    const MALFORMED_IDS: { name: string; id: string }[] = [
      { name: 'owner and slug only', id: `${USERNAME}:${SLUG}` },
      { name: 'owner and slug with a trailing colon', id: `${USERNAME}:${SLUG}:` },
      { name: 'an empty document name before the slash', id: `${USERNAME}:${SLUG}:/` },
      { name: 'two trailing slashes', id: `${USERNAME}:${SLUG}:elements//` },
      { name: 'an empty slug', id: `${USERNAME}::elements` },
      { name: 'an empty owner', id: `:${SLUG}:elements` },
      { name: 'no separator', id: 'malformed' },
      { name: 'an empty id', id: '' },
    ];

    it('closes a socket opened with a malformed id before it authenticates', async () => {
      await Promise.all(
        MALFORMED_IDS.map(async ({ name, id }) => {
          const socket = await connect(id);
          const closed = await socket.closed;
          expect({ name, code: closed.code }).toEqual({ name, code: WS_CLOSE_INVALID_DOCUMENT });
          expect({ name, texts: socket.texts }).toEqual({
            name,
            texts: ['access-denied:invalid-document'],
          });
          expect(serviceHolds(id)).toBe(false);
        })
      );
    });

    it('closes a socket opened without a document id', async () => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/api/v1/ws/yjs`);
      const texts: string[] = [];
      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') texts.push(event.data);
      });
      const closed = await new Promise<number>((resolve) => {
        ws.addEventListener('close', (event) => resolve(event.code));
      });
      expect(closed).toBe(WS_CLOSE_INVALID_DOCUMENT);
      expect(texts).toEqual(['access-denied:invalid-document']);
    });

    it('never signs in or loads a document for an owner:slug id', async () => {
      const id = `${USERNAME}:${SLUG}`;
      const socket = await connect(id);
      // Sending the token anyway changes nothing: the socket is already closing.
      try {
        socket.ws.send(fixture.token);
      } catch {
        // Already closed by the server.
      }
      const closed = await socket.closed;
      expect(closed.code).toBe(WS_CLOSE_INVALID_DOCUMENT);
      expect(socket.texts).not.toContain('authenticated');
      expect(serviceHolds(id)).toBe(false);
    });

    it('accepts every id form real clients send', async () => {
      const ids = [
        `${USERNAME}:${SLUG}:elements`,
        `${USERNAME}:${SLUG}:elements/`,
        `${USERNAME}:${SLUG}:Kx2_document-id`,
        `${USERNAME}:${SLUG}:Kx2_document-id/`,
      ];
      await Promise.all(
        ids.map(async (id) => {
          const socket = await connectSignedIn(id);
          expect({ id, held: serviceHolds(id) }).toEqual({ id, held: true });
          socket.ws.close();
        })
      );
    });

    it('reads a worldbuilding: prefix as the owner, as persistence does', async () => {
      // No client sends the prefix on the wire. Read like any other id, it
      // names the project `worldbuilding/<owner>`, which does not exist, so
      // access is never checked against the owner's own project.
      const id = `worldbuilding:${USERNAME}:${SLUG}:Kx2_document-id`;
      const socket = await connect(id);
      socket.ws.send(fixture.token);
      const closed = await socket.closed;
      expect(closed.code).toBe(WS_CLOSE_PROJECT_NOT_FOUND);
      expect(socket.texts).toEqual(['access-denied:project-not-found']);
      expect(serviceHolds(id)).toBe(false);
    });

    it('ignores presence frames on a document socket', async () => {
      const socket = await connectSignedIn(`${USERNAME}:${SLUG}:Kx2_document-id/`);
      const payloads = collectSyncPayloads(socket);
      socket.ws.send(
        encodePresenceFrame((encoder) =>
          writeHello(encoder, {
            sessionId: 'document-socket-session',
            user: { id: fixture.userId, username: USERNAME, color: '#123456' },
            status: 'active',
            location: { kind: 'elements' },
            lastActivityAt: Date.now(),
          })
        )
      );
      // Handled in order: the reply means the Hello was handled first.
      socket.ws.send(syncStep1());
      await waitForSocket(() => payloads.length > 0);

      const sessions = presenceService.getProjectSessions(`${USERNAME}:${SLUG}`);
      expect(sessions?.has('document-socket-session') ?? false).toBe(false);
    });
  });
});
