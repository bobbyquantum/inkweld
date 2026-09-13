import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  PRESENCE_MSG_HELLO,
  PRESENCE_MSG_SNAPSHOT,
  encodePresenceFrame,
  writeHello,
  type PresenceSession,
} from '@inkweld/presence';
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
 * End-to-end check of the presence identity binding over the real Bun
 * WebSocket route: whatever identity a client writes into its Hello, peers
 * see the identity the socket authenticated with. Exercises both delivery
 * paths in yjs.routes.ts — a Hello queued before the auth token arrives
 * (drained after authentication) and a Hello sent on a live socket.
 */

const USERNAME = 'presencewsuser';

function hello(sessionId: string, user: { id: string; username: string }): Uint8Array {
  const session: PresenceSession = {
    sessionId,
    user: { ...user, color: '#123456' },
    status: 'active',
    location: { kind: 'elements' },
    lastActivityAt: Date.now(),
  };
  return encodePresenceFrame((encoder) => writeHello(encoder, session));
}

function hellosSeen(c: CollectedSocket) {
  return c.presence.filter((m) => m.type === PRESENCE_MSG_HELLO) as Array<{
    type: typeof PRESENCE_MSG_HELLO;
    session: PresenceSession;
  }>;
}

describe('Yjs WebSocket presence identity', () => {
  let baseUrl = '';
  let fixture: WsFixture;
  const open: CollectedSocket[] = [];

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    fixture = await createWsFixture(baseUrl, USERNAME, 'presence-ws');
  });

  afterAll(async () => {
    await removeWsFixture(fixture, open);
    await stopTestServer();
  });

  it('replaces a spoofed Hello identity with the authenticated user on both delivery paths', async () => {
    const { token, userId, documentId } = fixture;

    // Observer: authenticates first and announces itself.
    const observer = await connectYjsSocket(baseUrl, documentId);
    open.push(observer);
    observer.ws.send(token);
    await waitForSocket(() => observer.texts.includes('authenticated'));
    observer.ws.send(hello('observer-session', { id: 'not-me', username: 'not-me' }));
    // An empty room gets no snapshot back, so give the server a moment to
    // register the observer before anyone else joins.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Queued path: the Hello arrives BEFORE the auth token and is drained
    // once the socket authenticates.
    const early = await connectYjsSocket(baseUrl, documentId);
    open.push(early);
    early.ws.send(hello('early-session', { id: 'mallory', username: 'mallory' }));
    early.ws.send(token);
    await waitForSocket(() => early.texts.includes('authenticated'));
    await waitForSocket(() =>
      hellosSeen(observer).some((m) => m.session.sessionId === 'early-session')
    );

    const earlyHello = hellosSeen(observer).find((m) => m.session.sessionId === 'early-session');
    expect(earlyHello?.session.user.id).toBe(userId);
    expect(earlyHello?.session.user.username).toBe(USERNAME);

    // The joiner's snapshot carries the observer's real identity too.
    await waitForSocket(() => early.presence.some((m) => m.type === PRESENCE_MSG_SNAPSHOT));
    const snapshot = early.presence.find((m) => m.type === PRESENCE_MSG_SNAPSHOT) as {
      sessions: PresenceSession[];
    };
    const observed = snapshot.sessions.find((s) => s.sessionId === 'observer-session');
    expect(observed?.user).toMatchObject({ id: userId, username: USERNAME });

    // Live path: a Hello sent after authentication.
    const live = await connectYjsSocket(baseUrl, documentId);
    open.push(live);
    live.ws.send(token);
    await waitForSocket(() => live.texts.includes('authenticated'));
    live.ws.send(hello('live-session', { id: 'mallory', username: 'mallory' }));
    await waitForSocket(() =>
      hellosSeen(observer).some((m) => m.session.sessionId === 'live-session')
    );

    const liveHello = hellosSeen(observer).find((m) => m.session.sessionId === 'live-session');
    expect(liveHello?.session.user.id).toBe(userId);
    expect(liveHello?.session.user.username).toBe(USERNAME);
    expect(hellosSeen(observer).map((m) => m.session.user.username)).not.toContain('mallory');
  }, 20000);
});
