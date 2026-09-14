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
    app.use('/test', rateLimit({ windowMs: 60_000, max: 1, message: 'Custom throttle message' }));
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

  it('uses separate counters for different socket addresses', async () => {
    const app = createApp({ windowMs: 60_000, max: 2 });
    // Hono passes the third app.request() argument through as c.env; on Bun
    // that is the Server, whose requestIP() the key derives from.
    const asIp = (address: string) => ({ requestIP: () => ({ address }) });

    // IP A: 2 requests = ok
    expect((await app.request('/test', { method: 'POST' }, asIp('10.0.0.1'))).status).toBe(200);
    expect((await app.request('/test', { method: 'POST' }, asIp('10.0.0.1'))).status).toBe(200);
    expect((await app.request('/test', { method: 'POST' }, asIp('10.0.0.1'))).status).toBe(429);

    // IP B: should still be allowed (separate counter)
    expect((await app.request('/test', { method: 'POST' }, asIp('10.0.0.2'))).status).toBe(200);
  });

  it('ignores a forged X-Forwarded-For when no proxy is trusted', async () => {
    const previous = process.env['TRUST_PROXY'];
    delete process.env['TRUST_PROXY'];
    try {
      const app = createApp({ windowMs: 60_000, max: 2 });
      const asIp = (address: string) => ({ requestIP: () => ({ address }) });
      const forged = (fake: string) => ({
        method: 'POST',
        headers: { 'x-forwarded-for': fake, 'x-real-ip': fake },
      });

      // Same socket, a different forged header every time: the header must
      // not move the request into a fresh bucket.
      expect((await app.request('/test', forged('1.1.1.1'), asIp('10.0.0.9'))).status).toBe(200);
      expect((await app.request('/test', forged('2.2.2.2'), asIp('10.0.0.9'))).status).toBe(200);
      expect((await app.request('/test', forged('3.3.3.3'), asIp('10.0.0.9'))).status).toBe(429);
    } finally {
      if (previous === undefined) delete process.env['TRUST_PROXY'];
      else process.env['TRUST_PROXY'] = previous;
    }
  });

  it('keys on the trusted proxy hop of X-Forwarded-For when TRUST_PROXY=true', async () => {
    const previous = process.env['TRUST_PROXY'];
    process.env['TRUST_PROXY'] = 'true';
    try {
      const app = createApp({ windowMs: 60_000, max: 1 });
      // The client can prepend anything; only the rightmost entry (added by
      // the trusted proxy) is used.
      const via = (client: string, spoofed: string) => ({
        method: 'POST',
        headers: { 'x-forwarded-for': `${spoofed}, ${client}` },
      });
      expect((await app.request('/test', via('203.0.113.5', '9.9.9.9'))).status).toBe(200);
      expect((await app.request('/test', via('203.0.113.5', '8.8.8.8'))).status).toBe(429);
      expect((await app.request('/test', via('203.0.113.6', '8.8.8.8'))).status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env['TRUST_PROXY'];
      else process.env['TRUST_PROXY'] = previous;
    }
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
