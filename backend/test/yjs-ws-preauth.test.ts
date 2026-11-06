import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { createEncoder, toUint8Array, writeVarUint, writeVarUint8Array } from 'lib0/encoding';
import { PRESENCE_KEEPALIVE_PING, PRESENCE_KEEPALIVE_PONG } from '@inkweld/presence';
import { yjsService } from '../src/services/yjs.service';
import { getDatabase } from '../src/db/index';
import { projects } from '../src/db/schema/index';
import { WS_CLOSE_AUTH_TIMEOUT, WS_CLOSE_PREAUTH_OVERFLOW } from '../src/utils/ws-close-codes';
import {
  MAX_PREAUTH_QUEUED_BYTES,
  MAX_PREAUTH_QUEUED_FRAMES,
  PREAUTH_TIMEOUT_MS,
} from '../src/utils/ws-preauth';
import { enablePasswordLoginForTests, startTestServer, stopTestServer } from './server-test-helper';
import {
  connectYjsSocket,
  createWsFixture,
  removeWsFixture,
  waitForSocket,
  type CollectedSocket,
  type WsFixture,
} from './ws-test-helper';

/**
 * The Bun WebSocket route queues binary frames that arrive before the auth
 * token. These tests drive the real route to check the two limits on that
 * window: the frame/byte budget (closed with the permanent overflow code)
 * and the authentication deadline (closed with the timeout code), and that
 * a socket which does authenticate stays open.
 */

/** Send a frame, tolerating the socket having already been closed by the server. */
function trySend(ws: WebSocket, frame: Uint8Array): void {
  try {
    ws.send(frame);
  } catch {
    // The server closed us mid-burst — exactly what the overflow tests expect.
  }
}

describe('Yjs WebSocket pre-auth limits', () => {
  let baseUrl = '';
  let fixture: WsFixture;
  const open: CollectedSocket[] = [];

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    fixture = await createWsFixture(baseUrl, 'preauthwsuser', 'preauth-ws');
  });

  afterAll(async () => {
    await removeWsFixture(fixture, open);
    await stopTestServer();
  });

  it('closes a socket that queues more frames than the budget before authenticating', async () => {
    const c = await connectYjsSocket(baseUrl, fixture.documentId);
    open.push(c);
    for (let i = 0; i <= MAX_PREAUTH_QUEUED_FRAMES; i++) {
      trySend(c.ws, new Uint8Array([0]));
    }
    const closed = await c.closed;
    expect(closed.code).toBe(WS_CLOSE_PREAUTH_OVERFLOW);
    expect(c.texts).toContain('access-denied:queue-overflow');
  }, 10000);

  it('closes a socket that queues more bytes than the budget before authenticating', async () => {
    const c = await connectYjsSocket(baseUrl, fixture.documentId);
    open.push(c);
    const chunk = new Uint8Array(Math.ceil(MAX_PREAUTH_QUEUED_BYTES / 4));
    for (let i = 0; i < 5; i++) {
      trySend(c.ws, chunk);
    }
    const closed = await c.closed;
    expect(closed.code).toBe(WS_CLOSE_PREAUTH_OVERFLOW);
    expect(c.texts).toContain('access-denied:queue-overflow');
  }, 10000);

  it(
    'keeps an authenticated socket open past the pre-auth deadline',
    async () => {
      const c = await connectYjsSocket(baseUrl, fixture.documentId);
      open.push(c);
      c.ws.send(fixture.token);
      await waitForSocket(() => c.texts.includes('authenticated'));
      // The deadline was armed on connect; authenticating must have cleared
      // it, so the socket is still open once it would have fired.
      let closedEarly = false;
      void c.closed.then(() => {
        closedEarly = true;
      });
      await new Promise((resolve) => setTimeout(resolve, PREAUTH_TIMEOUT_MS + 500));
      expect(closedEarly).toBe(false);
      expect(c.ws.readyState).toBe(WebSocket.OPEN);
    },
    PREAUTH_TIMEOUT_MS + 5000
  );

  it(
    'closes a socket that never sends a token once the deadline passes',
    async () => {
      const c = await connectYjsSocket(baseUrl, fixture.documentId);
      open.push(c);
      const closed = await c.closed;
      expect(closed.code).toBe(WS_CLOSE_AUTH_TIMEOUT);
      expect(c.texts).toContain('access-denied:auth-timeout');
    },
    PREAUTH_TIMEOUT_MS + 5000
  );

  it('rejects public-view authentication while the project is private', async () => {
    const db = getDatabase();
    await db.update(projects).set({ isPublic: false }).where(eq(projects.userId, fixture.userId));

    const c = await connectYjsSocket(baseUrl, fixture.documentId);
    open.push(c);
    c.ws.send('public-view');

    const closed = await c.closed;
    expect(closed.code).not.toBe(1000);
    expect(c.texts).toContain('access-denied:forbidden');
  }, 10000);

  it('blocks public mutations and revokes existing viewers without closing the owner', async () => {
    const db = getDatabase();
    await db.update(projects).set({ isPublic: true }).where(eq(projects.userId, fixture.userId));

    try {
      const c = await connectYjsSocket(baseUrl, fixture.documentId);
      open.push(c);
      c.ws.send('public-view');

      await waitForSocket(() => c.texts.includes('authenticated'));
      expect(c.ws.readyState).toBe(WebSocket.OPEN);

      const owner = await connectYjsSocket(baseUrl, fixture.documentId);
      open.push(owner);
      owner.ws.send(fixture.token);
      await waitForSocket(() => owner.texts.includes('authenticated'));

      const maliciousDoc = new Y.Doc();
      maliciousDoc.getMap('public-write-probe').set('mutated', true);
      const encoder = createEncoder();
      writeVarUint8Array(encoder, Y.encodeStateAsUpdate(maliciousDoc));
      const payload = toUint8Array(encoder);
      for (const header of [
        [0, 1],
        [0, 2],
        [0x80, 0, 1],
        [0, 0x82, 0],
      ]) {
        c.ws.send(new Uint8Array([...header, ...payload]));
      }
      // Awareness (cursor, name) from an anonymous viewer never reaches peers.
      const handled = spyOn(yjsService, 'handleMessage');
      const awareness = new awarenessProtocol.Awareness(new Y.Doc());
      awareness.setLocalState({ user: { name: 'Owner (spoofed)' } });
      const awarenessEncoder = createEncoder();
      writeVarUint(awarenessEncoder, 1);
      writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID])
      );
      c.ws.send(toUint8Array(awarenessEncoder));
      c.ws.send(PRESENCE_KEEPALIVE_PING);
      await waitForSocket(
        () => c.texts.filter((text) => text === PRESENCE_KEEPALIVE_PONG).length > 0
      );
      const serverDoc = await yjsService.getDocument(fixture.documentId);
      expect(serverDoc.doc.getMap('public-write-probe').size).toBe(0);
      expect(handled).not.toHaveBeenCalled();
      handled.mockRestore();
      awareness.destroy();
      maliciousDoc.destroy();

      const response = await fetch(`${baseUrl}/api/v1/projects/preauthwsuser/preauth-ws`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: false }),
      });
      expect(response.status).toBe(200);
      expect((await c.closed).code).not.toBe(1000);
      expect(c.texts).toContain('access-denied:forbidden');
      expect(owner.ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      await db.update(projects).set({ isPublic: false }).where(eq(projects.userId, fixture.userId));
    }
  }, 10000);
});
