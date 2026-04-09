import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
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
