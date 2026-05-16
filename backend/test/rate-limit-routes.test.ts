import { describe, it, expect, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { registerRateLimits } from '../src/config/routes';

describe('registerRateLimits', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalDisableRateLimit = process.env['INKWELD_DISABLE_RATE_LIMIT'];

  afterEach(() => {
    // Restore env vars after each test
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
    if (originalDisableRateLimit === undefined) {
      delete process.env['INKWELD_DISABLE_RATE_LIMIT'];
    } else {
      process.env['INKWELD_DISABLE_RATE_LIMIT'] = originalDisableRateLimit;
    }
  });

  it('does not apply rate limits when NODE_ENV=test', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['INKWELD_DISABLE_RATE_LIMIT'];

    const app = new Hono();
    registerRateLimits(app);
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }));

    // Should not be rate-limited — NODE_ENV=test disables the limiter
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/v1/auth/login', { method: 'POST' });
      expect(res.status).toBe(200);
    }
  });

  it('does not apply rate limits when INKWELD_DISABLE_RATE_LIMIT=true', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['INKWELD_DISABLE_RATE_LIMIT'] = 'true';

    const app = new Hono();
    registerRateLimits(app);
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }));

    // Should not be rate-limited — INKWELD_DISABLE_RATE_LIMIT=true
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/v1/auth/login', { method: 'POST' });
      expect(res.status).toBe(200);
    }
  });

  it('applies rate limits on /api/v1/auth/login when enabled', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['INKWELD_DISABLE_RATE_LIMIT'];

    const app = new Hono();
    registerRateLimits(app);
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }));

    // 5 requests should be allowed
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/v1/auth/login', { method: 'POST' });
      expect(res.status).toBe(200);
    }

    // 6th request should be rate-limited
    const blocked = await app.request('/api/v1/auth/login', { method: 'POST' });
    expect(blocked.status).toBe(429);
  });

  it('applies rate limits on /api/v1/auth/register when enabled', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['INKWELD_DISABLE_RATE_LIMIT'];

    const app = new Hono();
    registerRateLimits(app);
    app.post('/api/v1/auth/register', (c) => c.json({ ok: true }));

    // 3 requests should be allowed
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/v1/auth/register', { method: 'POST' });
      expect(res.status).toBe(200);
    }

    // 4th request should be rate-limited
    const blocked = await app.request('/api/v1/auth/register', { method: 'POST' });
    expect(blocked.status).toBe(429);
  });

  it('applies rate limits on passkey recovery when enabled', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['INKWELD_DISABLE_RATE_LIMIT'];

    const app = new Hono();
    registerRateLimits(app);
    app.post('/api/v1/auth/passkey-recovery/request', (c) => c.json({ ok: true }));

    // 3 requests should be allowed
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/v1/auth/passkey-recovery/request', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
    }

    // 4th request should be rate-limited
    const blocked = await app.request('/api/v1/auth/passkey-recovery/request', {
      method: 'POST',
    });
    expect(blocked.status).toBe(429);
  });

  it('does not rate-limit unregistered paths', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['INKWELD_DISABLE_RATE_LIMIT'];

    const app = new Hono();
    registerRateLimits(app);
    app.post('/api/v1/auth/providers', (c) => c.json({ ok: true }));

    // /providers is not rate-limited — should always pass through
    for (let i = 0; i < 20; i++) {
      const res = await app.request('/api/v1/auth/providers', { method: 'POST' });
      expect(res.status).toBe(200);
    }
  });
});
