import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDecoder, readVarUint } from 'lib0/decoding';
import {
  PRESENCE_MSG_HELLO,
  PRESENCE_MSG_SNAPSHOT,
  Y_MESSAGE_PRESENCE,
  encodePresenceFrame,
  readPresenceMessage,
  writeHello,
  type DecodedPresenceMessage,
  type PresenceSession,
} from '@inkweld/presence';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { enablePasswordLoginForTests, startTestServer, stopTestServer } from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * End-to-end check of the presence identity binding over the real Bun
 * WebSocket route: whatever identity a client writes into its Hello, peers
 * see the identity the socket authenticated with. Exercises both delivery
 * paths in yjs.routes.ts — a Hello queued before the auth token arrives
 * (drained after authentication) and a Hello sent on a live socket.
 */

const USERNAME = 'presencewsuser';
const SLUG = 'presence-ws';

interface Collected {
  ws: WebSocket;
  texts: string[];
  presence: DecodedPresenceMessage[];
  closed: Promise<{ code: number; reason: string }>;
}

function connect(baseUrl: string, documentId: string): Promise<Collected> {
  const url = `${baseUrl.replace('http', 'ws')}/api/v1/ws/yjs?documentId=${encodeURIComponent(documentId)}`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const collected: Collected = {
    ws,
    texts: [],
    presence: [],
    closed: new Promise((resolve) => {
      ws.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }));
    }),
  };
  ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') {
      collected.texts.push(event.data);
      return;
    }
    const bytes = new Uint8Array(event.data as ArrayBuffer);
    const decoder = createDecoder(bytes);
    if (readVarUint(decoder) !== Y_MESSAGE_PRESENCE) return; // Yjs sync traffic
    collected.presence.push(readPresenceMessage(decoder));
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(collected));
    ws.addEventListener('error', (event) => reject(new Error(`WebSocket error: ${String(event)}`)));
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('Timed out waiting for WebSocket traffic');
}

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

function hellosSeen(c: Collected) {
  return c.presence.filter((m) => m.type === PRESENCE_MSG_HELLO) as Array<{
    type: typeof PRESENCE_MSG_HELLO;
    session: PresenceSession;
  }>;
}

describe('Yjs WebSocket presence identity', () => {
  let baseUrl = '';
  let token = '';
  let userId = '';
  const documentId = `${USERNAME}:${SLUG}:elements`;
  const open: Collected[] = [];

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    const db = getDatabase();
    await db.delete(users).where(eq(users.username, USERNAME));
    const [user] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: USERNAME,
        email: `${USERNAME}@example.com`,
        password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
        approved: true,
        enabled: true,
      })
      .returning();
    userId = user.id;

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: TEST_PASSWORDS.DEFAULT }),
    });
    ({ token } = (await login.json()) as { token: string });
    expect(token).toBeTruthy();

    const created = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: SLUG, title: 'Presence over WS' }),
    });
    expect(created.status).toBe(201);
  });

  afterAll(async () => {
    for (const c of open) c.ws.close();
    const db = getDatabase();
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await stopTestServer();
  });

  it('replaces a spoofed Hello identity with the authenticated user on both delivery paths', async () => {
    // Observer: authenticates first and announces itself.
    const observer = await connect(baseUrl, documentId);
    open.push(observer);
    observer.ws.send(token);
    await waitFor(() => observer.texts.includes('authenticated'));
    observer.ws.send(hello('observer-session', { id: 'not-me', username: 'not-me' }));
    // An empty room gets no snapshot back, so give the server a moment to
    // register the observer before anyone else joins.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Queued path: the Hello arrives BEFORE the auth token and is drained
    // once the socket authenticates.
    const early = await connect(baseUrl, documentId);
    open.push(early);
    early.ws.send(hello('early-session', { id: 'mallory', username: 'mallory' }));
    early.ws.send(token);
    await waitFor(() => early.texts.includes('authenticated'));
    await waitFor(() => hellosSeen(observer).some((m) => m.session.sessionId === 'early-session'));

    const earlyHello = hellosSeen(observer).find((m) => m.session.sessionId === 'early-session');
    expect(earlyHello?.session.user.id).toBe(userId);
    expect(earlyHello?.session.user.username).toBe(USERNAME);

    // The joiner's snapshot carries the observer's real identity too.
    await waitFor(() => early.presence.some((m) => m.type === PRESENCE_MSG_SNAPSHOT));
    const snapshot = early.presence.find((m) => m.type === PRESENCE_MSG_SNAPSHOT) as {
      sessions: PresenceSession[];
    };
    const observed = snapshot.sessions.find((s) => s.sessionId === 'observer-session');
    expect(observed?.user).toMatchObject({ id: userId, username: USERNAME });

    // Live path: a Hello sent after authentication.
    const live = await connect(baseUrl, documentId);
    open.push(live);
    live.ws.send(token);
    await waitFor(() => live.texts.includes('authenticated'));
    live.ws.send(hello('live-session', { id: 'mallory', username: 'mallory' }));
    await waitFor(() => hellosSeen(observer).some((m) => m.session.sessionId === 'live-session'));

    const liveHello = hellosSeen(observer).find((m) => m.session.sessionId === 'live-session');
    expect(liveHello?.session.user.id).toBe(userId);
    expect(liveHello?.session.user.username).toBe(USERNAME);
    expect(hellosSeen(observer).map((m) => m.session.user.username)).not.toContain('mallory');
  }, 20000);
});
