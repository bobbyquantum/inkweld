import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper.js';

let client: TestClient;

beforeAll(async () => {
  const { baseUrl } = await startTestServer();
  client = new TestClient(baseUrl);
});

afterAll(async () => {
  await stopTestServer();
});

describe('Health Check', () => {
  it('should return 200 for health check', async () => {
    const { response, json } = await client.request('/api/v1/health');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.status).toBe('ok');
  });

  it('should return 200 for readiness check', async () => {
    const { response, json } = await client.request('/api/v1/health/ready');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.status).toBe('ready');
  });
});

describe('Config', () => {
  it('should return config', async () => {
    const { response, json } = await client.request('/api/v1/config');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('userApprovalRequired');
    expect(data).toHaveProperty('githubEnabled');
    expect(typeof data.version).toBe('string');
    expect(typeof data.userApprovalRequired).toBe('boolean');
    expect(typeof data.githubEnabled).toBe('boolean');
  });

  describe('GET /api/v1/config/features', () => {
    it('should return system features configuration', async () => {
      const { response, json } = await client.request('/api/v1/config/features');
      expect(response.status).toBe(200);
      const data = await json();

      // Check all required properties exist
      expect(data).toHaveProperty('aiLinting');
      expect(data).toHaveProperty('aiImageGeneration');
      expect(data).toHaveProperty('captcha');
      expect(data).toHaveProperty('appMode');
      expect(data).toHaveProperty('userApprovalRequired');

      // Check types
      expect(typeof data.aiLinting).toBe('boolean');
      expect(typeof data.aiImageGeneration).toBe('boolean');
      expect(typeof data.userApprovalRequired).toBe('boolean');

      // Check captcha object
      expect(data.captcha).toHaveProperty('enabled');
      expect(typeof data.captcha.enabled).toBe('boolean');

      // Check appMode is valid enum value
      expect(['ONLINE', 'OFFLINE', 'BOTH']).toContain(data.appMode);
    });

    it('should return false for AI features when OPENAI_API_KEY is not set', async () => {
      const { response, json } = await client.request('/api/v1/config/features');
      expect(response.status).toBe(200);
      const data = await json();

      // Without OPENAI_API_KEY in test env, should be false
      expect(data.aiLinting).toBe(false);
      expect(data.aiImageGeneration).toBe(false);
    });

    it('should have captcha configuration based on env vars', async () => {
      const { response, json } = await client.request('/api/v1/config/features');
      expect(response.status).toBe(200);
      const data = await json();

      // Check captcha configuration
      expect(typeof data.captcha.enabled).toBe('boolean');
      if (data.captcha.enabled) {
        expect(data.captcha.siteKey).toBeDefined();
        expect(typeof data.captcha.siteKey).toBe('string');
      }
    });

    it('should return default appMode as BOTH when not configured', async () => {
      const { response, json } = await client.request('/api/v1/config/features');
      expect(response.status).toBe(200);
      const data = await json();

      // Default appMode should be BOTH
      expect(data.appMode).toBe('BOTH');
    });

    it('should not have defaultServerName when not configured', async () => {
      const { response, json } = await client.request('/api/v1/config/features');
      expect(response.status).toBe(200);
      const data = await json();

      // Should be undefined when DEFAULT_SERVER_NAME env var is not set
      expect(data.defaultServerName).toBeUndefined();
    });
  });
});

describe('Root', () => {
  it('should return the SPA index.html', async () => {
    const { response } = await client.request('/');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('</html>');
  });

  it('should return OAuth providers', async () => {
    const { response, json } = await client.request('/api/v1/auth/providers');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('providers');
    expect(data.providers).toHaveProperty('github');
    expect(typeof data.providers.github).toBe('boolean');
  });

  it('should return CSRF token at /api/v1/csrf/token path', async () => {
    const { response, json } = await client.request('/api/v1/csrf/token');
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('token');
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(0);
  });
});
