/**
 * Tests for PasskeyService finishRegistration / finishAuthentication
 * success paths, using mock.module to stub @simplewebauthn/server
 * so the verification returns verified=true.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, userPasskeys, webauthnChallenges } from '../src/db/schema/index';
import { startTestServer, stopTestServer } from './server-test-helper';

mock.module('@simplewebauthn/server', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = require('@simplewebauthn/server');
  return {
    ...actual,
    verifyRegistrationResponse: async () => ({
      verified: true,
      registrationInfo: {
        credential: {
          id: `mock-cred-id-${crypto.randomUUID()}`,
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          transports: ['internal'],
        },
        aaguid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    }),
    verifyAuthenticationResponse: async () => ({
      verified: true,
      authenticationInfo: {
        newCounter: 42,
      },
    }),
  };
});

const { passkeyService } = await import('../src/services/passkey.service');

const USER_ID = crypto.randomUUID();
const USERNAME = 'verifypksuccess';
const PASSWORD = 'Secret123!';

const RP = {
  rpId: 'localhost',
  rpName: 'Test',
  origins: ['http://localhost:4200'],
};

let db: DatabaseInstance;

beforeAll(async () => {
  await startTestServer();
  db = getDatabase();

  await db.delete(users).where(eq(users.username, USERNAME));
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));

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
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
  await stopTestServer();
});

beforeEach(async () => {
  await db.delete(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
  await db.delete(webauthnChallenges);
});

describe('PasskeyService – finishRegistration success', () => {
  it('inserts a credential when verification succeeds', async () => {
    const challenge = 'reg-success-challenge';
    const now = Math.floor(Date.now() / 1000);
    await db.insert(webauthnChallenges).values({
      challenge,
      type: 'registration',
      userId: USER_ID,
      expiresAt: now + 300,
      createdAt: now,
    });

    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];

    const clientDataB64url = btoa(
      JSON.stringify({ challenge, type: 'webauthn.create', origin: 'http://localhost:4200' })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const result = await passkeyService.finishRegistration(
      db,
      user,
      {
        id: 'mock-reg-id',
        rawId: 'mock-reg-id',
        type: 'public-key',
        response: { clientDataJSON: clientDataB64url, attestationObject: 'mock' },
        clientExtensionResults: {},
      },
      RP,
      'test-label'
    );

    expect(result.verified).toBe(true);
    expect(result.passkey).toBeDefined();
    expect(result.passkey!.name).toBe('test-label');
    expect(result.passkey!.userId).toBe(USER_ID);

    const creds = await db.select().from(userPasskeys).where(eq(userPasskeys.userId, USER_ID));
    expect(creds).toHaveLength(1);
  });
});

describe('PasskeyService – finishAuthentication success', () => {
  it('updates counter when authentication succeeds', async () => {
    const credentialId = `mock-auth-cred-${crypto.randomUUID()}`;
    await db.insert(userPasskeys).values({
      userId: USER_ID,
      credentialId,
      publicKey: 'dGVzdA',
      counter: 0,
      transports: null,
      aaguid: null,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    const challenge = 'auth-success-challenge';
    const now = Math.floor(Date.now() / 1000);
    await db.insert(webauthnChallenges).values({
      challenge,
      type: 'authentication',
      userId: null,
      expiresAt: now + 300,
      createdAt: now,
    });

    const clientDataB64url = btoa(
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
        response: {
          clientDataJSON: clientDataB64url,
          authenticatorData: 'mock',
          signature: 'mock',
        },
        clientExtensionResults: {},
      },
      RP
    );

    expect(result.verified).toBe(true);
    expect(result.userId).toBe(USER_ID);

    const updated = (
      await db
        .select()
        .from(userPasskeys)
        .where(eq(userPasskeys.credentialId, credentialId))
        .limit(1)
    )[0];
    expect(updated.counter).toBe(42);
  });
});
