import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
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
});
