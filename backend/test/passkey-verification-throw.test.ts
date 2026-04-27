/**
 * Tests for PasskeyService finishRegistration / finishAuthentication
 * catch blocks when @simplewebauthn/server throws.
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
    verifyRegistrationResponse: async () => {
      throw new Error('Crypto verification failed');
    },
    verifyAuthenticationResponse: async () => {
      throw new Error('Auth verification failed');
    },
  };
});

const { passkeyService } = await import('../src/services/passkey.service');

const USER_ID = crypto.randomUUID();
const USERNAME = 'verifypkthrow';
const PASSWORD = 'Secret123!';
const RP = { rpId: 'localhost', rpName: 'Test', origins: ['http://localhost:4200'] };
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

function makeClientData(challenge: string, type: string): string {
  return btoa(JSON.stringify({ challenge, type, origin: 'http://localhost:4200' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

describe('PasskeyService – finishRegistration catch', () => {
  it('returns error when verifyRegistrationResponse throws', async () => {
    const challenge = 'reg-throw-challenge';
    const now = Math.floor(Date.now() / 1000);
    await db.insert(webauthnChallenges).values({
      challenge,
      type: 'registration',
      userId: USER_ID,
      expiresAt: now + 300,
      createdAt: now,
    });
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0];
    const result = await passkeyService.finishRegistration(
      db,
      user,
      {
        id: 'throw-test',
        rawId: 'throw-test',
        type: 'public-key',
        response: {
          clientDataJSON: makeClientData(challenge, 'webauthn.create'),
          attestationObject: '',
        },
        clientExtensionResults: {},
      },
      RP
    );
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/verification failed/i);
  });
});

describe('PasskeyService – finishAuthentication catch', () => {
  it('returns error when verifyAuthenticationResponse throws', async () => {
    const credentialId = `throw-auth-cred-${crypto.randomUUID()}`;
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
    const challenge = 'auth-throw-challenge';
    const now = Math.floor(Date.now() / 1000);
    await db.insert(webauthnChallenges).values({
      challenge,
      type: 'authentication',
      userId: null,
      expiresAt: now + 300,
      createdAt: now,
    });
    const result = await passkeyService.finishAuthentication(
      db,
      {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: makeClientData(challenge, 'webauthn.get'),
          authenticatorData: '',
          signature: '',
        },
        clientExtensionResults: {},
      },
      RP
    );
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/verification failed/i);
  });
});
