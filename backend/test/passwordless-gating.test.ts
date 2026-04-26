/**
 * Tests for the passwordless-first deployment mode.
 *
 * These tests deliberately exercise the gating-OFF state — they assert
 * that legacy password endpoints refuse to operate when an operator has
 * chosen `PASSWORD_LOGIN_ENABLED=false`, and that the magic-link passkey
 * recovery flow only activates when both PASSKEYS_ENABLED and
 * EMAIL_RECOVERY_ENABLED are on.
 *
 * The default test fixture in `setup.ts` deliberately leaves
 * PASSWORD_LOGIN_ENABLED unset (production default is `false`). Suites
 * that need it on call `enablePasswordLoginForTests()`. This suite calls
 * `disablePasswordLoginForTests()` in `beforeAll` so we run against the
 * production-default surface, then restores it in `afterAll` so other
 * suites that share the in-memory database aren't affected.
 *
 * Recovery-flow happy-path coverage that depends on a real WebAuthn
 * ceremony lives in `passkey.test.ts`; here we cover the parts that
 * don't require a credential (token issuance, gating, expiry, idempotency,
 * race protection) plus the routing layer around them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { getDatabase } from '../src/db/index';
import { passkeyRecoveryTokens, userPasskeys, users } from '../src/db/schema/index';
import { configService } from '../src/services/config.service';
import { passkeyRecoveryService } from '../src/services/passkey-recovery.service';
import {
  disablePasswordLoginForTests,
  disableUserApprovalForTests,
  enablePasswordLoginForTests,
  enableUserApprovalForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

const USERNAME = 'gateduser';
const EMAIL = 'gateduser@example.com';

describe('Passwordless-first gating', () => {
  let testServer: { port: number; baseUrl: string };
  let client: TestClient;
  let db: ReturnType<typeof getDatabase>;
  let userId: string;

  beforeAll(async () => {
    testServer = await startTestServer();
    db = getDatabase();
    client = new TestClient(testServer.baseUrl);

    // Run this suite in passwordless-first mode (matches production default).
    await disablePasswordLoginForTests();

    // Make sure we don't collide with users from other suites that share
    // the in-memory DB. (Suite order isn't guaranteed by the bun runner.)
    await db.delete(users).where(eq(users.username, USERNAME));

    const hashed = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const inserted = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: USERNAME,
        email: EMAIL,
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    userId = inserted[0].id;
  });

  afterAll(async () => {
    await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, userId));
    await db.delete(userPasskeys).where(eq(userPasskeys.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    // Restore the global default for any suites that run after us.
    // (Most suites set their own state in `beforeAll`, but a stale value
    // would leak into anything that doesn't.)
    await enablePasswordLoginForTests();

    await stopTestServer();
  });

  // ─── /login gating ───────────────────────────────────────────────────────
  describe('POST /api/v1/auth/login when PASSWORD_LOGIN_ENABLED=false', () => {
    it('returns 403 with a passkey hint even for valid credentials', async () => {
      const { response, json } = await client.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USERNAME, password: TEST_PASSWORDS.DEFAULT }),
      });

      expect(response.status).toBe(403);
      const data = (await json()) as { error: string };
      expect(data.error).toMatch(/password login is disabled/i);
      expect(data.error).toMatch(/passkey/i);
    });

    it('returns 403 (not 401) for unknown users to avoid signaling existence', async () => {
      // The gate fires before we hit the user lookup, so we shouldn't be
      // able to use the response code to enumerate accounts.
      const { response } = await client.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'totally-unknown', password: 'whatever' }),
      });

      expect(response.status).toBe(403);
    });
  });

  // ─── /forgot-password & /reset-password gating ───────────────────────────
  describe('Password reset endpoints when PASSWORD_LOGIN_ENABLED=false', () => {
    it('POST /forgot-password returns 404', async () => {
      const { response, json } = await client.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL }),
      });

      expect(response.status).toBe(404);
      const data = (await json()) as { error: string };
      expect(data.error).toMatch(/disabled/i);
    });

    it('POST /reset-password returns 404 even with a syntactically valid body', async () => {
      const { response } = await client.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'a'.repeat(64),
          newPassword: 'AnotherP@ss123!',
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  // ─── /register passwordless behaviour ────────────────────────────────────
  describe('POST /api/v1/auth/register when PASSWORD_LOGIN_ENABLED=false', () => {
    const NEW_USERNAME = 'pwlessnewuser';

    beforeEach(async () => {
      await db.delete(users).where(eq(users.username, NEW_USERNAME));
    });

    it('creates a user with NULL password even when one is provided', async () => {
      // The handler explicitly ignores the password field in passwordless
      // mode rather than storing it (so flipping the flag back on later
      // can't retroactively grant access via stale registration-time
      // passwords). Verify by reading the row directly.
      const { response, json } = await client.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: NEW_USERNAME,
          email: `${NEW_USERNAME}@example.com`,
          password: 'ShouldBeIgnored123!',
        }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { user: { username: string }; token: string };
      expect(data.user.username).toBe(NEW_USERNAME);
      // Auto-login still issues a token in this mode — the frontend uses
      // it to immediately run the WebAuthn enrolment ceremony.
      expect(typeof data.token).toBe('string');
      expect(data.token.length).toBeGreaterThan(20);

      const row = await db.select().from(users).where(eq(users.username, NEW_USERNAME)).get();
      expect(row).toBeDefined();
      expect(row?.password).toBeNull();
    });

    it('succeeds when password is omitted entirely', async () => {
      const { response } = await client.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: NEW_USERNAME,
          email: `${NEW_USERNAME}@example.com`,
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  // ─── /register with USER_APPROVAL_REQUIRED — enrolment-token issuance ────
  //
  // Brand-new accounts in passwordless+approval-required mode have NO
  // credential at all (no password, no passkey). Without a way to attach
  // a passkey BEFORE the dialog navigates to /approval-pending, admin
  // approval would unlock an account the user can't sign into. The
  // backend mints a 15-minute enrolment-scope JWT specifically for this
  // window. These tests pin the contract:
  //
  //   1. Token is issued only when requiresApproval AND password login off.
  //   2. Token works for POST /passkeys/register/start (the whole point).
  //   3. Token is rejected by every other authenticated endpoint
  //      (requireAuth and requireAdmin paths).
  //
  // The full WebAuthn ceremony (register/finish) needs a real authenticator
  // and is exercised in passkey.test.ts via the CDP virtual authenticator;
  // here we stop at the start endpoint, which is sufficient to prove the
  // session scope works end-to-end through the auth middleware.
  describe('POST /api/v1/auth/register issues enrolment token in passwordless+approval mode', () => {
    const APPROVAL_USERNAME = 'pwlessapproval';

    beforeAll(async () => {
      await enableUserApprovalForTests();
    });

    afterAll(async () => {
      // Critical: the test process shares one in-memory DB across all
      // suites, so leaving USER_APPROVAL_REQUIRED on would make every
      // subsequent registration require approval and break unrelated
      // tests that run after this file.
      await disableUserApprovalForTests();
    });

    beforeEach(async () => {
      await db.delete(users).where(eq(users.username, APPROVAL_USERNAME));
    });

    it('returns enrolmentToken alongside requiresApproval=true', async () => {
      const { response, json } = await client.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: APPROVAL_USERNAME,
          email: `${APPROVAL_USERNAME}@example.com`,
        }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as {
        requiresApproval: boolean;
        enrolmentToken?: string;
        token?: string;
      };
      expect(data.requiresApproval).toBe(true);
      // No full session token in approval mode — the user can't transact.
      expect(data.token).toBeUndefined();
      expect(typeof data.enrolmentToken).toBe('string');
      expect((data.enrolmentToken ?? '').length).toBeGreaterThan(20);
    });

    it('enrolment token is accepted by POST /passkeys/register/start', async () => {
      // Register, capture token, then call the WebAuthn start endpoint
      // with it. A 200 + challenge proves the auth middleware honoured
      // the enrolment scope. We don't complete the ceremony — that
      // requires a real authenticator and is covered by passkey.test.ts.
      const { json } = await client.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: APPROVAL_USERNAME,
          email: `${APPROVAL_USERNAME}@example.com`,
        }),
      });
      const { enrolmentToken } = (await json()) as { enrolmentToken: string };

      const { response, json: startJson } = await client.request(
        '/api/v1/auth/passkeys/register/start',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${enrolmentToken}`,
          },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(200);
      const opts = (await startJson()) as { challenge?: string; user?: { name?: string } };
      expect(typeof opts.challenge).toBe('string');
      // The RP should encode the just-registered user — confirms the
      // token's userId claim is being honoured by the handler.
      expect(opts.user?.name).toBe(APPROVAL_USERNAME);
    });

    it('enrolment token is rejected by general authenticated endpoints', async () => {
      // GET /api/v1/projects sits directly behind requireAuth (no
      // pre-empting handler-level session check like /users/me has),
      // so this exercises rejectEnrolmentScope cleanly. If this ever
      // returns 200 the scope check has regressed and an enrolment
      // token would grant general account access.
      const { json } = await client.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: APPROVAL_USERNAME,
          email: `${APPROVAL_USERNAME}@example.com`,
        }),
      });
      const { enrolmentToken } = (await json()) as { enrolmentToken: string };

      const { response } = await client.request('/api/v1/projects', {
        method: 'GET',
        headers: { Authorization: `Bearer ${enrolmentToken}` },
      });

      expect(response.status).toBe(403);
    });
  });

  // ─── Passkey recovery routes — gating-only assertions ────────────────────
  describe('POST /api/v1/auth/passkey-recovery when EMAIL_RECOVERY_ENABLED=false', () => {
    beforeAll(async () => {
      // PASSKEYS_ENABLED defaults to true; EMAIL_RECOVERY_ENABLED defaults
      // to false. Verify the route 404s in that combination.
      await configService.set(db, 'PASSKEYS_ENABLED', 'true');
      await configService.delete(db, 'EMAIL_RECOVERY_ENABLED');
    });

    it('returns 404 for /request', async () => {
      const { response } = await client.request('/api/v1/auth/passkey-recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL }),
      });
      expect(response.status).toBe(404);
    });

    it('returns 404 for /start', async () => {
      const { response } = await client.request('/api/v1/auth/passkey-recovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'a'.repeat(64) }),
      });
      expect(response.status).toBe(404);
    });

    it('returns 404 for /finish', async () => {
      const { response } = await client.request('/api/v1/auth/passkey-recovery/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'a'.repeat(64),
          response: {
            id: 'x',
            rawId: 'x',
            type: 'public-key',
            response: { clientDataJSON: '', attestationObject: '' },
            clientExtensionResults: {},
          },
        }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/auth/passkey-recovery when both flags ON', () => {
    beforeAll(async () => {
      await configService.set(db, 'PASSKEYS_ENABLED', 'true');
      await configService.set(db, 'EMAIL_RECOVERY_ENABLED', 'true');
      // Email isn't actually wired in tests; the service treats that as
      // "no email sent" and still returns success (anti-enumeration).
    });

    afterAll(async () => {
      await configService.delete(db, 'EMAIL_RECOVERY_ENABLED');
    });

    it('/request always returns 200 (anti-enumeration) for unknown email', async () => {
      const { response, json } = await client.request('/api/v1/auth/passkey-recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'noone@example.invalid' }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { message: string };
      expect(data.message).toMatch(/recovery link/i);
    });

    it('/request returns 200 for a known email and does NOT issue a token when email is disabled', async () => {
      // EMAIL_ENABLED defaults to false in tests, so the service path
      // skips token issuance entirely (no point creating a magic-link the
      // user can never receive). Verify by counting active tokens.
      const before = await passkeyRecoveryService._countActiveTokensForUser(db, userId);

      const { response } = await client.request('/api/v1/auth/passkey-recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL }),
      });
      expect(response.status).toBe(200);

      const after = await passkeyRecoveryService._countActiveTokensForUser(db, userId);
      expect(after).toBe(before);
    });

    it('/start returns 400 for an unknown token', async () => {
      const { response, json } = await client.request('/api/v1/auth/passkey-recovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'b'.repeat(64) }),
      });

      expect(response.status).toBe(400);
      const data = (await json()) as { error: string };
      expect(data.error).toMatch(/invalid|expired/i);
    });
  });
});

// ─── Service-layer tests for branches not reachable via HTTP ──────────────
describe('PasskeyRecoveryService internals', () => {
  let db: ReturnType<typeof getDatabase>;
  let userId: string;

  beforeAll(async () => {
    // We don't need the test server for these — they go straight to the
    // service. But we DO need the DB initialized.
    await startTestServer();
    db = getDatabase();

    await db.delete(users).where(eq(users.username, 'recovsvcuser'));
    const hashed = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const [u] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'recovsvcuser',
        email: 'recovsvc@example.com',
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    userId = u.id;
  });

  afterAll(async () => {
    await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    // Mirror the cleanup in the HTTP-level describe above. startTestServer is
    // idempotent but stopTestServer is not — leaving the server up here would
    // leak the listener into whichever test file Bun runs next.
    await stopTestServer();
  });

  beforeEach(async () => {
    await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, userId));
  });

  it('cleanup() removes expired tokens immediately', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    await db.insert(passkeyRecoveryTokens).values({
      userId,
      tokenHash: 'a'.repeat(64),
      expiresAt: past,
      createdAt: past - 100,
    });

    const removed = await passkeyRecoveryService.cleanup(db);
    expect(removed).toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select()
      .from(passkeyRecoveryTokens)
      .where(eq(passkeyRecoveryTokens.userId, userId));
    expect(remaining).toHaveLength(0);
  });

  it('cleanup() retains used tokens younger than 24h (debugging window)', async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.insert(passkeyRecoveryTokens).values({
      userId,
      tokenHash: 'b'.repeat(64),
      expiresAt: now + 900,
      usedAt: now - 60, // used a minute ago
      createdAt: now - 120,
    });

    await passkeyRecoveryService.cleanup(db);

    const remaining = await db
      .select()
      .from(passkeyRecoveryTokens)
      .where(eq(passkeyRecoveryTokens.userId, userId));
    expect(remaining).toHaveLength(1);
  });

  it('cleanup() removes used tokens older than 24h', async () => {
    const now = Math.floor(Date.now() / 1000);
    const longAgo = now - 86400 - 60;
    await db.insert(passkeyRecoveryTokens).values({
      userId,
      tokenHash: 'c'.repeat(64),
      expiresAt: longAgo + 900,
      usedAt: longAgo,
      createdAt: longAgo,
    });

    const removed = await passkeyRecoveryService.cleanup(db);
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it('redeemStart() rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    // We need to know the *raw* token to call redeemStart, so plant a
    // record whose tokenHash we can compute deterministically.
    const raw = 'd'.repeat(64);
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(raw).digest('hex');

    await db.insert(passkeyRecoveryTokens).values({
      userId,
      tokenHash,
      expiresAt: past,
      createdAt: past - 100,
    });

    const result = await passkeyRecoveryService.redeemStart(db, raw, {
      rpId: 'localhost',
      rpName: 'Test',
      origins: ['http://localhost:4200'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid|expired/i);
    }
  });

  it('redeemStart() rejects an already-used token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = 'e'.repeat(64);
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(raw).digest('hex');

    await db.insert(passkeyRecoveryTokens).values({
      userId,
      tokenHash,
      expiresAt: now + 900,
      usedAt: now - 5,
      createdAt: now - 10,
    });

    const result = await passkeyRecoveryService.redeemStart(db, raw, {
      rpId: 'localhost',
      rpName: 'Test',
      origins: ['http://localhost:4200'],
    });

    expect(result.success).toBe(false);
  });

  it('redeemStart() returns options for a fresh, valid token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = 'f'.repeat(64);
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(raw).digest('hex');

    await db.insert(passkeyRecoveryTokens).values({
      userId,
      tokenHash,
      expiresAt: now + 900,
      createdAt: now,
    });

    const result = await passkeyRecoveryService.redeemStart(db, raw, {
      rpId: 'localhost',
      rpName: 'Test',
      origins: ['http://localhost:4200'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.options).toBeDefined();
      expect(result.options.challenge).toBeDefined();
      // The token MUST NOT be marked used yet — only redeemFinish does that.
      const stillActive = await passkeyRecoveryService._countActiveTokensForUser(db, userId);
      expect(stillActive).toBe(1);
    }
  });

  it('isAvailable() returns false when EMAIL_RECOVERY_ENABLED is off', async () => {
    await configService.delete(db, 'EMAIL_RECOVERY_ENABLED');
    expect(await passkeyRecoveryService.isAvailable(db)).toBe(false);
  });

  it('isAvailable() returns false when flag is on but email is disabled', async () => {
    await configService.set(db, 'EMAIL_RECOVERY_ENABLED', 'true');
    await configService.delete(db, 'EMAIL_ENABLED');
    expect(await passkeyRecoveryService.isAvailable(db)).toBe(false);
  });

  it('isAvailable() returns true only when both flags are on', async () => {
    await configService.set(db, 'EMAIL_RECOVERY_ENABLED', 'true');
    await configService.set(db, 'EMAIL_ENABLED', 'true');
    expect(await passkeyRecoveryService.isAvailable(db)).toBe(true);
    // Cleanup so we don't leak state to other suites.
    await configService.delete(db, 'EMAIL_ENABLED');
    await configService.delete(db, 'EMAIL_RECOVERY_ENABLED');
  });

  it('requestRecovery() invalidates any prior outstanding token for the same user', async () => {
    // Plant a fake outstanding token, then call requestRecovery and
    // check that the old hash has been replaced by a fresh one.
    //
    // The cleanup only happens once the service has decided it WILL
    // attempt to send an email; if EMAIL_ENABLED is false the service
    // short-circuits to "no-op success" and (deliberately) doesn't
    // touch the existing token. So we flip EMAIL_ENABLED on for this
    // test — the actual SMTP call still fails harmlessly because no
    // host is configured, which is what we want for a unit test.
    await configService.set(db, 'EMAIL_ENABLED', 'true');
    try {
      const now = Math.floor(Date.now() / 1000);
      await db.insert(passkeyRecoveryTokens).values({
        userId,
        tokenHash: 'old'.padEnd(64, '0'),
        expiresAt: now + 900,
        createdAt: now - 60,
      });
      expect(await passkeyRecoveryService._countActiveTokensForUser(db, userId)).toBe(1);

      await passkeyRecoveryService.requestRecovery(db, 'recovsvc@example.com');

      const remaining = await db
        .select()
        .from(passkeyRecoveryTokens)
        .where(eq(passkeyRecoveryTokens.userId, userId));
      // Old token must be gone; a new one should have been inserted.
      expect(remaining.find((r) => r.tokenHash === 'old'.padEnd(64, '0'))).toBeUndefined();
      expect(remaining.length).toBe(1);
    } finally {
      await configService.delete(db, 'EMAIL_ENABLED');
    }
  });
});
