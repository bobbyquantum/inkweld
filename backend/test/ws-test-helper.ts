/**
 * Shared plumbing for integration tests that talk to the Yjs WebSocket route
 * on the Bun test server: a raw socket wrapper that collects frames, a
 * polling wait, and a user + project fixture that yields a session token.
 */
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDecoder, readVarUint } from 'lib0/decoding';
import {
  Y_MESSAGE_PRESENCE,
  readPresenceMessage,
  type DecodedPresenceMessage,
} from '@inkweld/presence';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { TEST_PASSWORDS } from './test-credentials';

export interface CollectedSocket {
  ws: WebSocket;
  /** Text frames in arrival order (`authenticated`, `access-denied:*`, …). */
  texts: string[];
  /** Decoded presence frames; Yjs sync frames are ignored. */
  presence: DecodedPresenceMessage[];
  closed: Promise<{ code: number; reason: string }>;
}

/** Open a socket to the Yjs route for `documentId` and resolve once connected. */
export function connectYjsSocket(baseUrl: string, documentId: string): Promise<CollectedSocket> {
  const url = `${baseUrl.replace('http', 'ws')}/api/v1/ws/yjs?documentId=${encodeURIComponent(documentId)}`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const collected: CollectedSocket = {
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
    const decoder = createDecoder(new Uint8Array(event.data as ArrayBuffer));
    if (readVarUint(decoder) !== Y_MESSAGE_PRESENCE) return;
    collected.presence.push(readPresenceMessage(decoder));
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(collected));
    ws.addEventListener('error', (event) => reject(new Error(`WebSocket error: ${String(event)}`)));
  });
}

/** Poll `predicate` until it holds or `timeoutMs` elapses. */
export async function waitForSocket(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('Timed out waiting for WebSocket traffic');
}

export interface WsFixture {
  userId: string;
  token: string;
  documentId: string;
}

/**
 * Create an approved user, log in for a bearer token and create a project;
 * returns the elements documentId for that project. Pair with
 * {@link removeWsFixture} in `afterAll`.
 */
export async function createWsFixture(
  baseUrl: string,
  username: string,
  slug: string
): Promise<WsFixture> {
  const db = getDatabase();
  await db.delete(users).where(eq(users.username, username));
  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      username,
      email: `${username}@example.com`,
      password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
      approved: true,
      enabled: true,
    })
    .returning();

  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: TEST_PASSWORDS.DEFAULT }),
  });
  const { token } = (await login.json()) as { token: string };
  if (!token) throw new Error(`Login failed for ${username}: ${login.status}`);

  const created = await fetch(`${baseUrl}/api/v1/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ slug, title: `WS fixture ${slug}` }),
  });
  if (created.status !== 201) {
    throw new Error(`Project creation failed for ${username}/${slug}: ${created.status}`);
  }

  return { userId: user.id, token, documentId: `${username}:${slug}:elements` };
}

/** Close the sockets a test opened and delete the fixture's rows. */
export async function removeWsFixture(
  fixture: WsFixture,
  sockets: CollectedSocket[]
): Promise<void> {
  for (const socket of sockets) socket.ws.close();
  const db = getDatabase();
  await db.delete(projects).where(eq(projects.userId, fixture.userId));
  await db.delete(users).where(eq(users.id, fixture.userId));
}
