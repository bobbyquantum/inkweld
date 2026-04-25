/**
 * Unit / integration tests for PasskeyService and the passkey HTTP routes.
 *
 * Strategy
 * ─────────
 * • Management operations (list, rename, delete, cleanupChallenges) are
 *   tested directly against the in-memory SQLite database so we can assert
 *   on exact DB state without going through HTTP.
 *
 * • The registration / authentication flows rely on @simplewebauthn/server
 *   calling `verifyRegistrationResponse` / `verifyAuthenticationResponse`.
 *   These functions perform cryptographic checks that we cannot fake without
 *   a real authenticator, so those paths are exercised via the HTTP routes
 *   (which return meaningful error shapes) plus targeted unit tests for the
 *   early-exit / error branches that do NOT require a real credential.
 *
 * • Route-level tests (401, 400, 404) ensure the Hono glue is wired up
 *   correctly and middleware (auth) is enforced.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, userPasskeys, webauthnChallenges } from '../src/db/schema/index';
import { passkeyService } from '../src/services/passkey.service';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

// ─── Shared fixtures ───────────────────────────────────────────────────────

const USER_ID = crypto.randomUUID();
const USER2_ID = crypto.randomUUID();
const USERNAME = 'passkeyuser';
const USERNAME2 = 'passkeyuser2';
const PASSWORD = 'P@ssw0rd!Test';
const RP: Parameters<typeof passkeyService.startRegistration>[2] = {
  rpId: 'localhost',
  rpName: 'Test',
  origins: ['http://localhost:4200'],
};

// db is initialized lazily in beforeAll after startTestServer() runs
let db: DatabaseInstance;
let client: TestClient;
let client2: TestClient;
let testServer: { port: number; baseUrl: string };

// Helper: insert a passkey row directly (bypasses WebAuthn ceremony)
async function insertPasskey(
  userId: string,
  overrides: Partial<{
    id: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    name: string | null;
  }> = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  const credentialId = overrides.credentialId ?? `cred-${crypto.randomUUID()}`;
  await db.insert(userPasskeys).values({
    id,
    userId,
    credentialId,
    publicKey: overrides.publicKey ?? 'dGVzdA', // base64url of "test"
    counter: overrides.counter ?? 0,
    transports: null,
    aaguid: null,
    deviceType: 'singleDevice',
    backedUp: false,
    name: overrides.name ?? null,
  });
  return { id, credentialId };
}

// Helper: insert an unexpired challenge row directly
async function insertChallenge(
  challenge: string,
  type: 'registration' | 'authentication',
  userId: string | null,
  expiresOffsetSeconds = 300
) {
  const now = Math.floor(Date.now() / 1000);
  await db.insert(webauthnChallenges).values({
    challenge,
    type,
    userId,
    expiresAt: now + expiresOffsetSeconds,
    createdAt: now,
  });
}

beforeAll(async () => {
  testServer = await startTestServer();
  db = getDatabase();
  client = new TestClient(testServer.baseUrl);
  client2 = new TestClient(testServer.baseUrl);

  // Clean up any leftover rows from previous runs
  await db.delete(users).where(eq(users.username, USERNAME));
  await db.delete(users).where(eq(users.username, USERNAME2));

  const hashedPw = await bcrypt.hash(PASSWORD, 10);
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: hashedPw,
    approved: true,
    enabled: true,
  });
  await db.insert(users).values({
    id: USER2_ID,
    username: USERNAME2,
    email: `${USERNAME2}@example.com`,
    password: hashedPw,
    approved: true,
    enabled: true,
  });

  await client.login(USERNAME, PASSWORD);
  await client2.login(USERNAME2, PASSWORD);
});

afterAll(async () => {
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER2_ID));
  await db.delete(webauthnChallenges);
  await db.delete(users).where(eq(users.username, USERNAME));
  await db.delete(users).where(eq(users.username, USERNAME2));
  await stopTestServer();
});

beforeEach(async () => {
  // Keep each test isolated
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER2_ID));
  await db.delete(webauthnChallenges);
});

// ═══════════════════════════════════════════════════════════════════════════
// PasskeyService – management (direct DB tests, no WebAuthn ceremony)
// ═══════════════════════════════════════════════════════════════════════════

describe('PasskeyService – listForUser', () => {
  it('returns an empty array when the user has no passkeys', async () => {
    const list = await passkeyService.listForUser(db, USER_ID);
    expect(list).toHaveLength(0);
  });

  it('returns only passkeys belonging to the requested user', async () => {
    await insertPasskey(USER_ID, { name: 'mine' });
    await insertPasskey(USER2_ID, { name: 'not mine' });

    const list = await passkeyService.listForUser(db, USER_ID);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('mine');
    expect(list[0].userId).toBe(USER_ID);
  });

  it('returns multiple passkeys for the same user', async () => {
    await insertPasskey(USER_ID, { name: 'key-1' });
    await insertPasskey(USER_ID, { name: 'key-2' });

    const list = await passkeyService.listForUser(db, USER_ID);
    expect(list).toHaveLength(2);
  });
});

describe('PasskeyService – deleteForUser', () => {
  it('returns true and removes the row when credential belongs to user', async () => {
    const { id } = await insertPasskey(USER_ID);
    const ok = await passkeyService.deleteForUser(db, USER_ID, id);
    expect(ok).toBe(true);

    const remaining = await passkeyService.listForUser(db, USER_ID);
    expect(remaining).toHaveLength(0);
  });

  it('returns false when the passkey does not exist', async () => {
    const ok = await passkeyService.deleteForUser(db, USER_ID, crypto.randomUUID());
    expect(ok).toBe(false);
  });

  it('returns false when the passkey belongs to a different user (ownership check)', async () => {
    const { id } = await insertPasskey(USER2_ID);
    const ok = await passkeyService.deleteForUser(db, USER_ID, id);
    expect(ok).toBe(false);

    // Row must still exist for USER2
    const list = await passkeyService.listForUser(db, USER2_ID);
    expect(list).toHaveLength(1);
  });
});

describe('PasskeyService – renameForUser', () => {
  it('updates the name and returns true for the owning user', async () => {
    const { id } = await insertPasskey(USER_ID, { name: 'old name' });
    const ok = await passkeyService.renameForUser(db, USER_ID, id, 'new name');
    expect(ok).toBe(true);

    const [updated] = await passkeyService.listForUser(db, USER_ID);
    expect(updated.name).toBe('new name');
  });

  it('returns false when the passkey does not exist', async () => {
    const ok = await passkeyService.renameForUser(db, USER_ID, crypto.randomUUID(), 'x');
    expect(ok).toBe(false);
  });

  it('returns false when the passkey belongs to a different user', async () => {
    const { id } = await insertPasskey(USER2_ID, { name: 'their key' });
    const ok = await passkeyService.renameForUser(db, USER_ID, id, 'hijacked');
    expect(ok).toBe(false);

    // Original name preserved
    const [pk] = await passkeyService.listForUser(db, USER2_ID);
    expect(pk.name).toBe('their key');
  });
});

describe('PasskeyService – cleanupChallenges', () => {
  it('returns 0 when there are no challenges', async () => {
    const n = await passkeyService.cleanupChallenges(db);
    expect(n).toBe(0);
  });

  it('removes only expired challenges and returns the count', async () => {
    await insertChallenge('fresh-challenge', 'registration', USER_ID, 300); // not expired
    await insertChallenge('old-challenge', 'authentication', null, -1); // already expired

    const n = await passkeyService.cleanupChallenges(db);
    expect(n).toBe(1);

    // Fresh one still there
    const remaining = await db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.challenge, 'fresh-challenge'));
    expect(remaining).toHaveLength(1);
  });

  it('removes all challenges if they are all expired', async () => {
    await insertChallenge('c1', 'registration', USER_ID, -1);
    await insertChallenge('c2', 'authentication', null, -1);

    const n = await passkeyService.cleanupChallenges(db);
    expect(n).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PasskeyService – startRegistration / startAuthentication
// (only assert on the shape of returned options; no crypto verification)
// ═══════════════════════════════════════════════════════════════════════════

describe('PasskeyService – startRegistration', () => {
  it('returns valid PublicKeyCredentialCreationOptionsJSON', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];
    const opts = await passkeyService.startRegistration(db, user, RP);

    expect(opts).toHaveProperty('challenge');
    expect(typeof opts.challenge).toBe('string');
    expect(opts.challenge.length).toBeGreaterThan(0);
    expect(opts.rp).toHaveProperty('id', RP.rpId);
    expect(opts.rp).toHaveProperty('name', RP.rpName);
    expect(opts.user).toHaveProperty('name', user.username);
    expect(opts.authenticatorSelection?.residentKey).toBe('required');
  });

  it('saves a registration challenge to the database', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];
    await passkeyService.startRegistration(db, user, RP);

    const challenges = await db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.userId, USER_ID));
    expect(challenges).toHaveLength(1);
    expect(challenges[0].type).toBe('registration');
  });

  it('excludes credentials already registered to the user', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];
    const { credentialId } = await insertPasskey(USER_ID);

    const opts = await passkeyService.startRegistration(db, user, RP);

    const excluded = (opts.excludeCredentials ?? []).map((c) => c.id);
    expect(excluded).toContain(credentialId);
  });
});

describe('PasskeyService – startAuthentication', () => {
  it('returns valid PublicKeyCredentialRequestOptionsJSON', async () => {
    const opts = await passkeyService.startAuthentication(db, RP);

    expect(opts).toHaveProperty('challenge');
    expect(typeof opts.challenge).toBe('string');
    expect(opts.rpId).toBe(RP.rpId);
    // Discoverable: no allowCredentials hint
    expect(opts.allowCredentials).toHaveLength(0);
  });

  it('saves an authentication challenge (no userId) to the database', async () => {
    await passkeyService.startAuthentication(db, RP);

    const challenges = await db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.type, 'authentication'));
    expect(challenges.length).toBeGreaterThanOrEqual(1);
    // Discoverable flow: userId is null
    expect(challenges[0].userId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PasskeyService – finishRegistration / finishAuthentication error paths
// (we can't forge a real credential, but we can test all the early-exit paths)
// ═══════════════════════════════════════════════════════════════════════════

describe('PasskeyService – finishRegistration (error paths)', () => {
  it('returns verified=false when clientDataJSON is missing / empty', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];
    const result = await passkeyService.finishRegistration(
      db,
      user,
      {
        id: 'test',
        rawId: 'test',
        type: 'public-key',
        response: {
          clientDataJSON: '',
          attestationObject: '',
        },
        clientExtensionResults: {},
      },
      RP
    );
    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns verified=false when challenge is expired / not found', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];
    // clientDataJSON with an unknown challenge
    const fakeClientData = btoa(
      JSON.stringify({
        challenge: 'no-such-challenge',
        type: 'webauthn.create',
        origin: 'http://localhost:4200',
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const result = await passkeyService.finishRegistration(
      db,
      user,
      {
        id: 'test',
        rawId: 'test',
        type: 'public-key',
        response: {
          clientDataJSON: fakeClientData,
          attestationObject: '',
        },
        clientExtensionResults: {},
      },
      RP
    );
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/challenge/i);
  });
});

describe('PasskeyService – finishAuthentication (error paths)', () => {
  it('returns verified=false for an unknown credential id', async () => {
    const fakeClientData = btoa(
      JSON.stringify({ challenge: 'x', type: 'webauthn.get', origin: 'http://localhost:4200' })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const result = await passkeyService.finishAuthentication(
      db,
      {
        id: 'unknown-cred-id',
        rawId: 'unknown-cred-id',
        type: 'public-key',
        response: {
          clientDataJSON: fakeClientData,
          authenticatorData: '',
          signature: '',
        },
        clientExtensionResults: {},
      },
      RP
    );
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/credential/i);
  });

  it('returns verified=false when challenge is not found for a known credential', async () => {
    const { credentialId } = await insertPasskey(USER_ID);
    const fakeClientData = btoa(
      JSON.stringify({
        challenge: 'missing-challenge',
        type: 'webauthn.get',
        origin: 'http://localhost:4200',
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const result = await passkeyService.finishAuthentication(
      db,
      {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: fakeClientData,
          authenticatorData: '',
          signature: '',
        },
        clientExtensionResults: {},
      },
      RP
    );
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/challenge/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HTTP route tests — auth enforcement & happy-path shapes
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/auth/passkeys/register/start – auth', () => {
  it('returns 401 when not authenticated', async () => {
    const anon = new TestClient(testServer.baseUrl);
    const { response } = await anon.request('/api/v1/auth/passkeys/register/start', {
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  it('returns registration options for an authenticated user', async () => {
    const { response, json } = await client.request('/api/v1/auth/passkeys/register/start', {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('challenge');
    expect(data).toHaveProperty('rp');
    expect(data.rp).toHaveProperty('id');
  });
});

describe('POST /api/v1/auth/passkeys/register/finish – auth + validation', () => {
  it('returns 401 when not authenticated', async () => {
    const anon = new TestClient(testServer.baseUrl);
    const { response } = await anon.request('/api/v1/auth/passkeys/register/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: {} }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 400 when registration verification fails (bad credential data)', async () => {
    // Start so a challenge is saved; finish with garbage data
    await client.request('/api/v1/auth/passkeys/register/start', { method: 'POST' });

    const { response } = await client.request('/api/v1/auth/passkeys/register/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response: {
          id: 'bad',
          rawId: 'bad',
          type: 'public-key',
          response: { clientDataJSON: '', attestationObject: '' },
          clientExtensionResults: {},
        },
      }),
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/passkeys/login/start', () => {
  it('returns authentication options without authentication', async () => {
    const anon = new TestClient(testServer.baseUrl);
    const { response, json } = await anon.request('/api/v1/auth/passkeys/login/start', {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('challenge');
    expect(data).toHaveProperty('rpId');
  });
});

describe('POST /api/v1/auth/passkeys/login/finish', () => {
  it('returns 401 when the credential is unknown', async () => {
    // Start so a challenge is saved
    await new TestClient(testServer.baseUrl).request('/api/v1/auth/passkeys/login/start', {
      method: 'POST',
    });

    const fakeClientData = btoa(
      JSON.stringify({
        challenge: 'no-such-challenge',
        type: 'webauthn.get',
        origin: 'http://localhost',
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const anon = new TestClient(testServer.baseUrl);
    const { response } = await anon.request('/api/v1/auth/passkeys/login/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response: {
          id: 'unknown',
          rawId: 'unknown',
          type: 'public-key',
          response: { clientDataJSON: fakeClientData, authenticatorData: '', signature: '' },
          clientExtensionResults: {},
        },
      }),
    });
    // Route returns 401 for failed authentication (not 400)
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/auth/passkeys – list', () => {
  it('returns 401 when not authenticated', async () => {
    const anon = new TestClient(testServer.baseUrl);
    const { response } = await anon.request('/api/v1/auth/passkeys');
    expect(response.status).toBe(401);
  });

  it('returns an empty list when the user has no passkeys', async () => {
    const { response, json } = await client.request('/api/v1/auth/passkeys');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('passkeys');
    expect(data.passkeys).toHaveLength(0);
  });

  it('returns passkeys for the authenticated user only', async () => {
    await insertPasskey(USER_ID, { name: 'my key' });
    await insertPasskey(USER2_ID, { name: 'their key' });

    const { response, json } = await client.request('/api/v1/auth/passkeys');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.passkeys).toHaveLength(1);
    expect(data.passkeys[0].name).toBe('my key');
  });
});

describe('PATCH /api/v1/auth/passkeys/:id – rename', () => {
  it('returns 401 when not authenticated', async () => {
    const anon = new TestClient(testServer.baseUrl);
    const { response } = await anon.request('/api/v1/auth/passkeys/some-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the passkey does not exist', async () => {
    const { response } = await client.request(`/api/v1/auth/passkeys/${crypto.randomUUID()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 404 when the passkey belongs to a different user', async () => {
    const { id } = await insertPasskey(USER2_ID, { name: 'theirs' });
    const { response } = await client.request(`/api/v1/auth/passkeys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'hijacked' }),
    });
    expect(response.status).toBe(404);
  });

  it('renames the passkey and returns 200', async () => {
    const { id } = await insertPasskey(USER_ID, { name: 'old' });
    const { response, json } = await client.request(`/api/v1/auth/passkeys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'new' }),
    });
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('message');

    // Verify DB
    const list = await passkeyService.listForUser(db, USER_ID);
    expect(list[0].name).toBe('new');
  });
});

describe('DELETE /api/v1/auth/passkeys/:id', () => {
  it('returns 401 when not authenticated', async () => {
    const anon = new TestClient(testServer.baseUrl);
    const { response } = await anon.request('/api/v1/auth/passkeys/some-id', {
      method: 'DELETE',
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the passkey does not exist', async () => {
    const { response } = await client.request(`/api/v1/auth/passkeys/${crypto.randomUUID()}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });

  it('returns 404 when the passkey belongs to a different user', async () => {
    const { id } = await insertPasskey(USER2_ID);
    const { response } = await client.request(`/api/v1/auth/passkeys/${id}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });

  it('deletes the passkey and returns 200', async () => {
    const { id } = await insertPasskey(USER_ID);
    const { response, json } = await client.request(`/api/v1/auth/passkeys/${id}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('message');

    const list = await passkeyService.listForUser(db, USER_ID);
    expect(list).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Expired challenge paths
// ═══════════════════════════════════════════════════════════════════════════

describe('PasskeyService – finishRegistration (expired challenge)', () => {
  it('returns verified=false when the registration challenge is expired', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];

    const challenge = 'expired-reg-challenge';
    // Insert an already-expired challenge (expiresAt in the past)
    await insertChallenge(challenge, 'registration', USER_ID, -1);

    const fakeClientData = btoa(
      JSON.stringify({ challenge, type: 'webauthn.create', origin: 'http://localhost:4200' })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const result = await passkeyService.finishRegistration(
      db,
      user,
      {
        id: 'test',
        rawId: 'test',
        type: 'public-key',
        response: { clientDataJSON: fakeClientData, attestationObject: '' },
        clientExtensionResults: {},
      },
      RP
    );

    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/challenge/i);
  });

  it('returns verified=false when the challenge belongs to a different user', async () => {
    // Insert the challenge for USER_ID, then attempt to claim it as a *different* user.
    // This exercises the `record.userId !== userId` branch in takeChallengeByValue.
    const challenge = `reg-challenge-wrong-user-${crypto.randomUUID()}`;
    await insertChallenge(challenge, 'registration', USER_ID, 300);

    const fakeClientData = btoa(
      JSON.stringify({ challenge, type: 'webauthn.create', origin: 'http://localhost:4200' })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Use a user object with a different id so the userId check fails
    const wrongUser = { id: crypto.randomUUID(), username: 'wrong' } as Parameters<
      typeof passkeyService.finishRegistration
    >[1];

    const result = await passkeyService.finishRegistration(
      db,
      wrongUser,
      {
        id: 'test-wrong-user',
        rawId: 'test-wrong-user',
        type: 'public-key',
        response: { clientDataJSON: fakeClientData, attestationObject: '' },
        clientExtensionResults: {},
      },
      RP
    );

    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/challenge/i);
  });
});

describe('PasskeyService – finishAuthentication (expired challenge)', () => {
  it('returns verified=false when the authentication challenge is expired', async () => {
    const { credentialId } = await insertPasskey(USER_ID);

    const challenge = 'expired-auth-challenge';
    // Insert an already-expired challenge
    await insertChallenge(challenge, 'authentication', null, -1);

    const fakeClientData = btoa(
      JSON.stringify({ challenge, type: 'webauthn.get', origin: 'http://localhost:4200' })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const result = await passkeyService.finishAuthentication(
      db,
      {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: { clientDataJSON: fakeClientData, authenticatorData: '', signature: '' },
        clientExtensionResults: {},
      },
      RP
    );

    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/challenge/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Disabled / unapproved user — login/finish route
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/auth/passkeys/login/finish – disabled/unapproved user', () => {
  const DISABLED_USER_ID = crypto.randomUUID();
  const UNAPPROVED_USER_ID = crypto.randomUUID();

  beforeAll(async () => {
    const hashedPw = await bcrypt.hash(PASSWORD, 10);
    await db.insert(users).values({
      id: DISABLED_USER_ID,
      username: 'disabled-passkey-user',
      email: 'disabled-passkey@example.com',
      password: hashedPw,
      approved: true,
      enabled: false, // <-- disabled
    });
    await db.insert(users).values({
      id: UNAPPROVED_USER_ID,
      username: 'unapproved-passkey-user',
      email: 'unapproved-passkey@example.com',
      password: hashedPw,
      approved: false, // <-- not approved
      enabled: true,
    });
  });

  afterAll(async () => {
    await db.delete(userPasskeys).where(eq(userPasskeys.userId, DISABLED_USER_ID));
    await db.delete(userPasskeys).where(eq(userPasskeys.userId, UNAPPROVED_USER_ID));
    await db.delete(users).where(eq(users.id, DISABLED_USER_ID));
    await db.delete(users).where(eq(users.id, UNAPPROVED_USER_ID));
  });

  /**
   * Drive the post-verification user-status branch of `/login/finish` by
   * stubbing `passkeyService.finishAuthentication` to return a successful
   * verification for the target user. We can't forge a real WebAuthn assertion,
   * so this stub is the only way to actually reach the disabled/unapproved
   * checks (otherwise crypto verification fails first and the route returns
   * 401 before evaluating user status).
   */
  async function loginFinishFor(userId: string) {
    const original = passkeyService.finishAuthentication.bind(passkeyService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (passkeyService as any).finishAuthentication = async () => ({
      verified: true,
      userId,
      passkeyId: crypto.randomUUID(),
    });

    try {
      const anon = new TestClient(testServer.baseUrl);
      return await anon.request('/api/v1/auth/passkeys/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: {
            id: 'stub',
            rawId: 'stub',
            type: 'public-key',
            response: {
              clientDataJSON: '',
              authenticatorData: '',
              signature: '',
            },
            clientExtensionResults: {},
          },
        }),
      });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (passkeyService as any).finishAuthentication = original;
    }
  }

  it('returns 403 when the passkey owner account is disabled', async () => {
    const { response, json } = await loginFinishFor(DISABLED_USER_ID);
    expect(response.status).toBe(403);
    expect(await json()).toMatchObject({ error: expect.stringMatching(/disabled/i) });
  });

  it('returns 403 when the passkey owner account is unapproved', async () => {
    const { response, json } = await loginFinishFor(UNAPPROVED_USER_ID);
    expect(response.status).toBe(403);
    expect(await json()).toMatchObject({ error: expect.stringMatching(/approval/i) });
  });
});
