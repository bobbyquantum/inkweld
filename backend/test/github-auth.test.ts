import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('GitHub Auth Routes', () => {
  let client: TestClient;
  let testServer: { port: number; baseUrl: string };

  beforeAll(async () => {
    // Ensure GitHub OAuth is disabled by default for tests
    process.env.GITHUB_ENABLED = 'false';
    testServer = await startTestServer();
    client = new TestClient(testServer.baseUrl);
  });

  afterAll(async () => {
    delete process.env.GITHUB_ENABLED;
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
});
