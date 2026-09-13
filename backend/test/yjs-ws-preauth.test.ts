import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { WS_CLOSE_AUTH_TIMEOUT, WS_CLOSE_PREAUTH_OVERFLOW } from '../src/utils/ws-close-codes';
import {
  MAX_PREAUTH_QUEUED_BYTES,
  MAX_PREAUTH_QUEUED_FRAMES,
  PREAUTH_TIMEOUT_MS,
} from '../src/utils/ws-preauth';
import { enablePasswordLoginForTests, startTestServer, stopTestServer } from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * The Bun WebSocket route queues binary frames that arrive before the auth
 * token. These tests drive the real route to check the two limits on that
 * window: the frame/byte budget (closed with the permanent overflow code)
 * and the authentication deadline (closed with the timeout code), and that
 * a socket which does authenticate stays open.
 */

const USERNAME = 'preauthwsuser';
const SLUG = 'preauth-ws';

interface Collected {
  ws: WebSocket;
  texts: string[];
  closed: Promise<{ code: number; reason: string }>;
}

function connect(baseUrl: string, documentId: string): Promise<Collected> {
  const url = `${baseUrl.replace('http', 'ws')}/api/v1/ws/yjs?documentId=${encodeURIComponent(documentId)}`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const collected: Collected = {
    ws,
    texts: [],
    closed: new Promise((resolve) => {
      ws.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }));
    }),
  };
  ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') collected.texts.push(event.data);
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
      body: JSON.stringify({ slug: SLUG, title: 'Pre-auth limits' }),
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

  it('closes a socket that queues more frames than the budget before authenticating', async () => {
    const c = await connect(baseUrl, documentId);
    open.push(c);
    for (let i = 0; i <= MAX_PREAUTH_QUEUED_FRAMES; i++) {
      trySend(c.ws, new Uint8Array([0]));
    }
    const closed = await c.closed;
    expect(closed.code).toBe(WS_CLOSE_PREAUTH_OVERFLOW);
    expect(c.texts).toContain('access-denied:queue-overflow');
  }, 10000);

  it('closes a socket that queues more bytes than the budget before authenticating', async () => {
    const c = await connect(baseUrl, documentId);
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
      const c = await connect(baseUrl, documentId);
      open.push(c);
      c.ws.send(token);
      await waitFor(() => c.texts.includes('authenticated'));
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
      const c = await connect(baseUrl, documentId);
      open.push(c);
      const closed = await c.closed;
      expect(closed.code).toBe(WS_CLOSE_AUTH_TIMEOUT);
      expect(c.texts).toContain('access-denied:auth-timeout');
    },
    PREAUTH_TIMEOUT_MS + 5000
  );
});
