import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { users, oauthLoginCodes } from '../src/db/schema/index';
import { oauthLoginCodeService } from '../src/services/oauth-login-code.service';
import { userService } from '../src/services/user.service';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('GitHub Auth Routes', () => {
  let client: TestClient;
  let testServer: { port: number; baseUrl: string };
  let originalGithubEnabled: string | undefined;

  beforeAll(async () => {
    // Save and override env var for tests
    originalGithubEnabled = process.env.GITHUB_ENABLED;
    process.env.GITHUB_ENABLED = 'false';
    testServer = await startTestServer();
    client = new TestClient(testServer.baseUrl);
  });

  afterAll(async () => {
    // Restore original env var
    if (originalGithubEnabled === undefined) {
      delete process.env.GITHUB_ENABLED;
    } else {
      process.env.GITHUB_ENABLED = originalGithubEnabled;
    }
    await stopTestServer();
  });

  describe('GET /api/v1/auth/github', () => {
    it('should return 403 when GitHub OAuth is not enabled', async () => {
      const { response, json } = await client.request('/api/v1/auth/github', {
        method: 'GET',
        redirect: 'manual',
      });

      expect(response.status).toBe(403);
      const data = await json();
      expect((data as { error: string }).error).toBe('GitHub OAuth is not enabled');
    });
  });

  describe('GET /api/v1/auth/providers', () => {
    it('should indicate GitHub is disabled', async () => {
      const { json } = await client.request('/api/v1/auth/providers', {
        method: 'GET',
      });

      const data = (await json()) as { providers: { github: boolean } };
      expect(data.providers).toBeDefined();
      expect(data.providers.github).toBe(false);
    });
  });

  describe('POST /api/v1/auth/exchange-code', () => {
    it('should return 400 when no code is provided', async () => {
      const { response, json } = await client.request('/api/v1/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await json();
      expect((data as { error: string }).error).toBe('Authorization code is required');
    });

    it('should return 401 for an invalid code', async () => {
      const { response, json } = await client.request('/api/v1/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'nonexistent-code' }),
      });

      expect(response.status).toBe(401);
      const data = await json();
      expect((data as { error: string }).error).toBe('Invalid or expired authorization code');
    });

    it('exchanges a database-backed code exactly once and re-checks the account', async () => {
      const db = getDatabase();
      await db.delete(users).where(eq(users.username, 'ghcodeuser'));
      const [user] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          username: 'ghcodeuser',
          email: 'ghcodeuser@example.com',
          approved: true,
          enabled: true,
        })
        .returning();

      const code = await oauthLoginCodeService.issue(db, user.id);
      const first = await client.request('/api/v1/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      expect(first.response.status).toBe(200);
      expect(((await first.json()) as { token: string }).token).toBeTruthy();

      // Single use.
      const second = await client.request('/api/v1/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      expect(second.response.status).toBe(401);

      // A disabled account cannot redeem even a fresh code.
      const disabledCode = await oauthLoginCodeService.issue(db, user.id);
      await userService.setUserEnabled(db, user.id, false);
      const disabled = await client.request('/api/v1/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disabledCode }),
      });
      expect(disabled.response.status).toBe(401);

      await db.delete(users).where(eq(users.id, user.id));
    });

    it('rejects an expired code and prunes it on the next issue', async () => {
      const db = getDatabase();
      await db.delete(users).where(eq(users.username, 'ghcodeexpiry'));
      const [user] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          username: 'ghcodeexpiry',
          email: 'ghcodeexpiry@example.com',
          approved: true,
          enabled: true,
        })
        .returning();

      const code = await oauthLoginCodeService.issue(db, user.id);
      await db
        .update(oauthLoginCodes)
        .set({ expiresAt: Date.now() - 1 })
        .where(eq(oauthLoginCodes.userId, user.id));
      expect(await oauthLoginCodeService.redeem(db, code)).toBeNull();

      await oauthLoginCodeService.issue(db, user.id); // prunes expired rows
      const rows = await db
        .select()
        .from(oauthLoginCodes)
        .where(eq(oauthLoginCodes.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].expiresAt).toBeGreaterThan(Date.now());

      await db.delete(users).where(eq(users.id, user.id));
    });

    it('should return 400 when code is not a string', async () => {
      const { response, json } = await client.request('/api/v1/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 12345 }),
      });

      expect(response.status).toBe(400);
      const data = await json();
      expect((data as { error: string }).error).toBe('Authorization code is required');
    });
  });
});
