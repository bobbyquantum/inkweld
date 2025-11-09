import { describe, it, expect } from 'bun:test';
import { app } from './setup.shared.js';

describe('Health Check', () => {
  it('should return 200 for health check', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('should return 200 for readiness check', async () => {
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ready');
  });
});

describe('Config', () => {
  it('should return config', async () => {
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('version');
    expect(json).toHaveProperty('userApprovalRequired');
    expect(json).toHaveProperty('githubEnabled');
    expect(typeof json.version).toBe('string');
    expect(typeof json.userApprovalRequired).toBe('boolean');
    expect(typeof json.githubEnabled).toBe('boolean');
  });

  describe('GET /api/config/features', () => {
    it('should return system features configuration', async () => {
      const res = await app.request('/api/config/features');
      expect(res.status).toBe(200);
      const json = await res.json();

      // Check all required properties exist
      expect(json).toHaveProperty('aiLinting');
      expect(json).toHaveProperty('aiImageGeneration');
      expect(json).toHaveProperty('captcha');
      expect(json).toHaveProperty('appMode');
      expect(json).toHaveProperty('userApprovalRequired');

      // Check types
      expect(typeof json.aiLinting).toBe('boolean');
      expect(typeof json.aiImageGeneration).toBe('boolean');
      expect(typeof json.userApprovalRequired).toBe('boolean');

      // Check captcha object
      expect(json.captcha).toHaveProperty('enabled');
      expect(typeof json.captcha.enabled).toBe('boolean');

      // Check appMode is valid enum value
      expect(['ONLINE', 'OFFLINE', 'BOTH']).toContain(json.appMode);
    });

    it('should return false for AI features when OPENAI_API_KEY is not set', async () => {
      const res = await app.request('/api/config/features');
      expect(res.status).toBe(200);
      const json = await res.json();

      // Without OPENAI_API_KEY in test env, should be false
      expect(json.aiLinting).toBe(false);
      expect(json.aiImageGeneration).toBe(false);
    });

    it('should have captcha configuration based on env vars', async () => {
      const res = await app.request('/api/config/features');
      expect(res.status).toBe(200);
      const json = await res.json();

      // Check captcha configuration matches environment
      expect(json.captcha.enabled).toBe(typeof json.captcha.enabled === 'boolean');
      if (json.captcha.enabled) {
        expect(json.captcha.siteKey).toBeDefined();
        expect(typeof json.captcha.siteKey).toBe('string');
      }
    });

    it('should return default appMode as BOTH when not configured', async () => {
      const res = await app.request('/api/config/features');
      expect(res.status).toBe(200);
      const json = await res.json();

      // Default appMode should be BOTH
      expect(json.appMode).toBe('BOTH');
    });

    it('should not have defaultServerName when not configured', async () => {
      const res = await app.request('/api/config/features');
      expect(res.status).toBe(200);
      const json = await res.json();

      // Should be undefined when DEFAULT_SERVER_NAME env var is not set
      expect(json.defaultServerName).toBeUndefined();
    });
  });
});

describe('Root', () => {
  it('should return API info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Inkweld API');
  });

  it('should return OAuth providers', async () => {
    const res = await app.request('/providers');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('providers');
    expect(json.providers).toHaveProperty('github');
    expect(typeof json.providers.github).toBe('boolean');
  });

  it('should return CSRF token at root /csrf/token path', async () => {
    const res = await app.request('/csrf/token');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('token');
    expect(typeof json.token).toBe('string');
    expect(json.token.length).toBeGreaterThan(0);
  });
});
