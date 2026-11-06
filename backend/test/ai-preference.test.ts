import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import {
  aiAllowedFromPreferences,
  appearanceService,
  parseUserPreferences,
} from '../src/services/appearance.service';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * The "No AI / Allow AI" choice lives on the account (`users.preferences`),
 * so it follows the user to every device: it comes back from `GET /users/me`
 * and the login response, and `PATCH /users/me` stores it.
 */

const AUTHOR = 'aiprefauthor';
const OTHER = 'aiprefother';

describe('AI preference on the account', () => {
  let baseUrl: string;
  let client: TestClient;
  let otherClient: TestClient;
  let authorId: string;
  let otherId: string;

  async function getMe(c: TestClient = client): Promise<Record<string, unknown>> {
    const { response, json } = await c.request('/api/v1/users/me');
    expect(response.status).toBe(200);
    return (await json()) as Record<string, unknown>;
  }

  async function patchMe(
    body: unknown
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const { response, json } = await client.request('/api/v1/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: (await json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    client = new TestClient(baseUrl);
    otherClient = new TestClient(baseUrl);

    const db = getDatabase();
    for (const u of [AUTHOR, OTHER]) {
      await db.delete(users).where(eq(users.username, u));
    }
    const hashed = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const [author] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: AUTHOR,
        email: `${AUTHOR}@example.com`,
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    authorId = author.id;
    const [other] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: OTHER,
        email: `${OTHER}@example.com`,
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    otherId = other.id;

    expect(await client.login(AUTHOR, TEST_PASSWORDS.DEFAULT)).toBe(true);
    expect(await otherClient.login(OTHER, TEST_PASSWORDS.DEFAULT)).toBe(true);
  });

  afterAll(async () => {
    const db = getDatabase();
    for (const id of [authorId, otherId]) {
      await db.delete(users).where(eq(users.id, id));
    }
    await stopTestServer();
  });

  beforeEach(async () => {
    await getDatabase().update(users).set({ preferences: null }).where(eq(users.id, authorId));
  });

  it('is null until the user chooses', async () => {
    expect((await getMe()).aiAllowed).toBeNull();
  });

  it('stores Allow AI and returns it from PATCH and GET /users/me', async () => {
    const patched = await patchMe({ aiAllowed: true });
    expect(patched.status).toBe(200);
    expect(patched.json.aiAllowed).toBe(true);
    expect((await getMe()).aiAllowed).toBe(true);
  });

  it('stores No AI as false, not as "never chosen"', async () => {
    await patchMe({ aiAllowed: true });
    const patched = await patchMe({ aiAllowed: false });
    expect(patched.json.aiAllowed).toBe(false);
    expect((await getMe()).aiAllowed).toBe(false);
  });

  it('leaves the choice alone when a profile update does not mention it', async () => {
    await patchMe({ aiAllowed: true });
    const patched = await patchMe({ bio: 'Writes at night.' });
    expect(patched.json.aiAllowed).toBe(true);
    expect(patched.json.bio).toBe('Writes at night.');
  });

  it('keeps the other preferences in the blob', async () => {
    const db = getDatabase();
    await appearanceService.setBackgroundPreference(db, authorId, {
      kind: 'preset',
      presetId: 'dusk',
    });
    await patchMe({ aiAllowed: true });
    const stored = await appearanceService.getPreferences(db, authorId);
    expect(stored.background).toEqual({ kind: 'preset', presetId: 'dusk' });
    expect(stored.aiAllowed).toBe(true);
  });

  it('rejects a value that is not a boolean', async () => {
    expect((await patchMe({ aiAllowed: 'allow' })).status).toBe(400);
    expect((await getMe()).aiAllowed).toBeNull();
  });

  it('comes back with a new sign-in on another device', async () => {
    await patchMe({ aiAllowed: true });
    const { response, json } = await new TestClient(baseUrl).request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: AUTHOR, password: TEST_PASSWORDS.DEFAULT }),
    });
    expect(response.status).toBe(200);
    const body = (await json()) as { user: Record<string, unknown> };
    expect(body.user.aiAllowed).toBe(true);
  });

  it('is per account', async () => {
    await patchMe({ aiAllowed: true });
    expect((await getMe(otherClient)).aiAllowed).toBeNull();
  });

  it('is not part of the anonymous user', async () => {
    const me = await getMe(new TestClient(baseUrl));
    expect(me.username).toBe('anonymous');
    expect('aiAllowed' in me).toBe(false);
  });

  it('needs a session to change', async () => {
    const { response } = await new TestClient(baseUrl).request('/api/v1/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiAllowed: true }),
    });
    expect(response.status).toBe(401);
  });
});

describe('aiAllowedFromPreferences', () => {
  it('reads a stored boolean', () => {
    expect(aiAllowedFromPreferences('{"aiAllowed":true}')).toBe(true);
    expect(aiAllowedFromPreferences('{"aiAllowed":false}')).toBe(false);
  });

  it('is null when never chosen, malformed or not a boolean', () => {
    expect(aiAllowedFromPreferences(null)).toBeNull();
    expect(aiAllowedFromPreferences(undefined)).toBeNull();
    expect(aiAllowedFromPreferences('{}')).toBeNull();
    expect(aiAllowedFromPreferences('not json')).toBeNull();
    expect(aiAllowedFromPreferences('{"aiAllowed":"allow"}')).toBeNull();
  });

  it('treats a non-object blob as empty preferences', () => {
    expect(parseUserPreferences('[1,2]')).toEqual({});
    expect(parseUserPreferences('42')).toEqual({});
  });
});
