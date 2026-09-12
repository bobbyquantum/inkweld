import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { userService } from '../src/services/user.service';
import { isSessionRevoked } from '../src/utils/session-validity';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * Sessions are stateless 30-day JWTs. Until users.sessionsValidFrom existed,
 * nothing could end one early: a password reset, a passkey recovery or an
 * admin disabling the account left every outstanding token usable.
 */
describe('session revocation watermark', () => {
  let baseUrl: string;
  const NAME = 'revoke-me';
  let userId: string;

  async function login(): Promise<TestClient> {
    const client = new TestClient(baseUrl);
    expect(await client.login(NAME, TEST_PASSWORDS.DEFAULT)).toBe(true);
    return client;
  }

  /**
   * Who the server thinks we are. /users/me answers 200 with the user for a
   * live token and 401 for a revoked one (so the client clears credentials).
   */
  async function whoAmI(client: TestClient): Promise<string> {
    const { response, json } = await client.request('/api/v1/users/me');
    if (response.status === 401) return 'revoked';
    expect(response.status).toBe(200);
    return (await json()).username as string;
  }

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    const db = getDatabase();
    await db.delete(users).where(eq(users.username, NAME));
    const [row] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: NAME,
        email: `${NAME}@example.com`,
        password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
        approved: true,
        enabled: true,
      })
      .returning();
    userId = row.id;
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(users).where(eq(users.username, NAME));
    await stopTestServer();
  });

  it('isSessionRevoked compares iat against the watermark', () => {
    expect(isSessionRevoked({ sessionsValidFrom: 0 }, { iat: 5 })).toBe(false);
    expect(isSessionRevoked({ sessionsValidFrom: 0 }, {})).toBe(false);
    expect(isSessionRevoked({ sessionsValidFrom: 100 }, { iat: 99 })).toBe(true);
    expect(isSessionRevoked({ sessionsValidFrom: 100 }, { iat: 100 })).toBe(false);
    expect(isSessionRevoked({ sessionsValidFrom: 100 }, {})).toBe(true);
  });

  it('a password change ends sessions issued before it', async () => {
    const before = await login();
    expect(await whoAmI(before)).toBe(NAME);

    // The watermark has one-second resolution; make sure the new password
    // lands in a later second than the token's iat.
    await new Promise((r) => setTimeout(r, 1100));
    await userService.updatePassword(getDatabase(), userId, TEST_PASSWORDS.DEFAULT);

    expect(await whoAmI(before)).toBe('revoked');

    const after = await login();
    expect(await whoAmI(after)).toBe(NAME);
  });

  it('disabling an account ends its sessions and re-enabling does not restore them', async () => {
    const client = await login();
    expect(await whoAmI(client)).toBe(NAME);
    await new Promise((r) => setTimeout(r, 1100));

    await userService.setUserEnabled(getDatabase(), userId, false);
    expect(await whoAmI(client)).toBe('revoked');

    await userService.setUserEnabled(getDatabase(), userId, true);
    expect(await whoAmI(client)).toBe('revoked');
    expect(await whoAmI(await login())).toBe(NAME);
  });

  it('invalidateSessions alone is enough', async () => {
    const client = await login();
    await new Promise((r) => setTimeout(r, 1100));
    await userService.invalidateSessions(getDatabase(), userId);
    expect(await whoAmI(client)).toBe('revoked');
  });
});
