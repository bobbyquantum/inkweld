import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { rateLimit } from '../src/middleware/rate-limit';

function createApp(options: { windowMs: number; max: number }) {
  const app = new Hono();
  app.use('/test', rateLimit(options));
  app.post('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimit middleware', () => {
  it('allows requests within the limit', async () => {
    const app = createApp({ windowMs: 60_000, max: 3 });

    const res1 = await app.request('/test', { method: 'POST' });
    expect(res1.status).toBe(200);

    const res2 = await app.request('/test', { method: 'POST' });
    expect(res2.status).toBe(200);

    const res3 = await app.request('/test', { method: 'POST' });
    expect(res3.status).toBe(200);
  });

  it('returns 429 when the limit is exceeded', async () => {
    const app = createApp({ windowMs: 60_000, max: 2 });

    await app.request('/test', { method: 'POST' }); // 1
    await app.request('/test', { method: 'POST' }); // 2
    const res = await app.request('/test', { method: 'POST' }); // 3rd → blocked

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too many requests, please try again later');
  });

  it('returns custom message in the 429 response', async () => {
    const app = new Hono();
    app.use(
      '/test',
      rateLimit({ windowMs: 60_000, max: 1, message: 'Custom throttle message' })
    );
    app.post('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { method: 'POST' }); // 1
    const res = await app.request('/test', { method: 'POST' }); // blocked

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Custom throttle message');
  });

  it('includes a Retry-After header', async () => {
    const app = createApp({ windowMs: 60_000, max: 1 });

    await app.request('/test', { method: 'POST' }); // 1
    const res = await app.request('/test', { method: 'POST' }); // blocked

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('uses separate counters for different IPs', async () => {
    const app = createApp({ windowMs: 60_000, max: 2 });

    // IP A: 2 requests = ok
    const resA1 = await app.request('/test', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(resA1.status).toBe(200);

    const resA2 = await app.request('/test', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(resA2.status).toBe(200);

    const resA3 = await app.request('/test', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(resA3.status).toBe(429);

    // IP B: should still be allowed (separate counter)
    const resB1 = await app.request('/test', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    expect(resB1.status).toBe(200);
  });

  it('supports custom keyGenerator', async () => {
    const app = new Hono();
    app.use(
      '/test',
      rateLimit({
        windowMs: 60_000,
        max: 1,
        keyGenerator: (c) => c.req.header('x-user-id') || 'unknown',
      })
    );
    app.post('/test', (c) => c.json({ ok: true }));

    // User A
    await app.request('/test', {
      method: 'POST',
      headers: { 'x-user-id': 'user-a' },
    });
    const resBlocked = await app.request('/test', {
      method: 'POST',
      headers: { 'x-user-id': 'user-a' },
    });
    expect(resBlocked.status).toBe(429);

    // User B (different key)
    const resAllowed = await app.request('/test', {
      method: 'POST',
      headers: { 'x-user-id': 'user-b' },
    });
    expect(resAllowed.status).toBe(200);
  });

  it('does not rate-limit paths that are not matched', async () => {
    const app = new Hono();
    app.use('/test', rateLimit({ windowMs: 60_000, max: 1 }));
    app.post('/test', (c) => c.json({ ok: true }));
    app.post('/other', (c) => c.json({ ok: true }));

    // Exhaust /test
    await app.request('/test', { method: 'POST' });
    const blocked = await app.request('/test', { method: 'POST' });
    expect(blocked.status).toBe(429);

    // /other should be fine
    const resp = await app.request('/other', { method: 'POST' });
    expect(resp.status).toBe(200);
  });
});
