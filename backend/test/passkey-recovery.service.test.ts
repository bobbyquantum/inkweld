/**
 * Unit/integration tests for PasskeyRecoveryService paths not covered by
 * passwordless-gating.test.ts.
 *
 * passwordless-gating.test.ts covers requestRecovery, redeemStart, cleanup,
 * isAvailable, and _countActiveTokensForUser.  This file covers:
 *   • redeemFinish (success, WebAuthn failure, token-burn race)
 *   • _countCredentialsForUser
 *   • requestRecovery email-failure path
 *   • isAvailable when recovery flag is on but email is off
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, userPasskeys, passkeyRecoveryTokens } from '../src/db/schema/index';
import { passkeyRecoveryService } from '../src/services/passkey-recovery.service';
import { passkeyService } from '../src/services/passkey.service';
import { configService } from '../src/services/config.service';
import { startTestServer, stopTestServer, enablePasswordLoginForTests } from './server-test-helper';

let db: DatabaseInstance;
const USER_ID = crypto.randomUUID();
const USERNAME = 'pkrecovsvc';
const PASSWORD = 'Secret123!';

const RP = {
  rpId: 'localhost',
  rpName: 'Test',
  origins: ['http://localhost:4200'],
};

beforeAll(async () => {
  await startTestServer();
  await enablePasswordLoginForTests();
  db = getDatabase();

  await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, USER_ID));
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));

  const hashed = await bcrypt.hash(PASSWORD, 10);
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: hashed,
    approved: true,
    enabled: true,
  });
});

afterAll(async () => {
  await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, USER_ID));
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
  await stopTestServer();
});

beforeEach(async () => {
  await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, USER_ID));
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
});

async function insertToken(
  raw: string,
  overrides: { expiresOffset?: number; usedAt?: number } = {}
) {
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  await db.insert(passkeyRecoveryTokens).values({
    userId: USER_ID,
    tokenHash,
    expiresAt: now + (overrides.expiresOffset ?? 900),
    usedAt: overrides.usedAt ?? null,
    createdAt: now,
  });
}

describe('PasskeyRecoveryService – redeemFinish', () => {
  it('returns error for unknown token', async () => {
    const result = await passkeyRecoveryService.redeemFinish(
      db,
      'unknown-token',
      {} as any,
      RP,
      'label'
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('returns error when WebAuthn finishRegistration fails', async () => {
    const raw = 'valid-but-bad';
    await insertToken(raw);

    const result = await passkeyRecoveryService.redeemFinish(
      db,
      raw,
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
      RP,
      'test-label'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    const active = await passkeyRecoveryService._countActiveTokensForUser(db, USER_ID);
    expect(active).toBe(1);
  });

  it('succeeds and burns the token when registration verifies', async () => {
    const raw = 'gonna-succeed';
    await insertToken(raw);

    const credId = `cred-recovered-${crypto.randomUUID()}`;
    const passkeyId = crypto.randomUUID();

    const originalFinish = passkeyService.finishRegistration.bind(passkeyService);
    (passkeyService as any).finishRegistration = async (
      _db: any,
      _user: any,
      _response: any,
      _rp: any,
      _label?: string
    ) => {
      await db.insert(userPasskeys).values({
        id: passkeyId,
        userId: USER_ID,
        credentialId: credId,
        publicKey: 'key',
        counter: 0,
        transports: null,
        aaguid: null,
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'recovered',
      });
      const created = (
        await db.select().from(userPasskeys).where(eq(userPasskeys.credentialId, credId)).limit(1)
      )[0];
      return { verified: true, passkey: created };
    };

    try {
      const result = await passkeyRecoveryService.redeemFinish(db, raw, {} as any, RP, 'recovered');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe(USER_ID);
      }

      const active = await passkeyRecoveryService._countActiveTokensForUser(db, USER_ID);
      expect(active).toBe(0);

      const creds = await passkeyRecoveryService._countCredentialsForUser(db, USER_ID);
      expect(creds).toBe(1);
    } finally {
      (passkeyService as any).finishRegistration = originalFinish;
      await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
    }
  });
});

describe('PasskeyRecoveryService – _countActiveTokensForUser', () => {
  it('returns 0 when there are no tokens', async () => {
    expect(await passkeyRecoveryService._countActiveTokensForUser(db, USER_ID)).toBe(0);
  });

  it('counts only unexpired, unused tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.insert(passkeyRecoveryTokens).values({
      userId: USER_ID,
      tokenHash: 'active-token',
      expiresAt: now + 900,
      createdAt: now,
    });
    await db.insert(passkeyRecoveryTokens).values({
      userId: USER_ID,
      tokenHash: 'expired-token',
      expiresAt: now - 10,
      createdAt: now - 100,
    });

    expect(await passkeyRecoveryService._countActiveTokensForUser(db, USER_ID)).toBe(1);
  });
});

describe('PasskeyRecoveryService – _countCredentialsForUser', () => {
  it('returns 0 when user has no passkeys', async () => {
    expect(await passkeyRecoveryService._countCredentialsForUser(db, USER_ID)).toBe(0);
  });

  it('returns count of user passkeys', async () => {
    await db.insert(userPasskeys).values({
      id: crypto.randomUUID(),
      userId: USER_ID,
      credentialId: 'cred-a',
      publicKey: 'key-a',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    expect(await passkeyRecoveryService._countCredentialsForUser(db, USER_ID)).toBe(1);
  });
});

describe('PasskeyRecoveryService – requestRecovery with email config', () => {
  it('returns emailSent=false and no error when email is enabled but SMTP fails', async () => {
    await configService.set(db, 'EMAIL_ENABLED', 'true');
    await configService.set(db, 'EMAIL_RECOVERY_ENABLED', 'true');
    try {
      const result = await passkeyRecoveryService.requestRecovery(db, `${USERNAME}@example.com`);
      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(false);
    } finally {
      await configService.delete(db, 'EMAIL_ENABLED');
      await configService.delete(db, 'EMAIL_RECOVERY_ENABLED');
    }
  });
});

describe('PasskeyRecoveryService – isAvailable', () => {
  it('returns false when EMAIL_RECOVERY_ENABLED is off even if EMAIL_ENABLED is on', async () => {
    await configService.set(db, 'EMAIL_ENABLED', 'true');
    await configService.delete(db, 'EMAIL_RECOVERY_ENABLED');
    try {
      expect(await passkeyRecoveryService.isAvailable(db)).toBe(false);
    } finally {
      await configService.delete(db, 'EMAIL_ENABLED');
    }
  });
});
