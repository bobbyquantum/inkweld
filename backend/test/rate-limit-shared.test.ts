import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { like } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { rateLimitBuckets } from '../src/db/schema/index';
import { rateLimit, takeSharedRateWindow } from '../src/middleware/rate-limit';
import type { DatabaseInstance } from '../src/types/context';
import { startTestServer, stopTestServer } from './server-test-helper';

/**
 * On Workers every isolate has its own memory, so the limiter counts in the
 * database there. These tests drive that store directly and through the
 * middleware with a Workers-style `env.DB` binding.
 */
describe('shared rate-limit store', () => {
  let db: DatabaseInstance;
  const PREFIX = 'shared-test';

  beforeAll(async () => {
    await startTestServer();
    db = getDatabase() as unknown as DatabaseInstance;
  });

  afterAll(async () => {
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, `${PREFIX}%`));
    await stopTestServer();
  });

  it('counts across calls in one window and starts again in the next', async () => {
    const key = `${PREFIX}:window`;
    const start = 1_700_000_040_000; // aligned to a 60 s window
    expect(await takeSharedRateWindow(db, key, 60_000, 2, start)).toBeNull();
    expect(await takeSharedRateWindow(db, key, 60_000, 2, start + 1_000)).toBeNull();
    // Third call in the window: refused until the window ends (59 s left)
    expect(await takeSharedRateWindow(db, key, 60_000, 2, start + 1_000)).toBe(59);
    // Next window: counting starts again
    expect(await takeSharedRateWindow(db, key, 60_000, 2, start + 60_000)).toBeNull();
  });

  it('is used by a named limiter when the request has a D1-style binding', async () => {
    const app = new Hono<{ Bindings: { DB: unknown }; Variables: { db: DatabaseInstance } }>();
    app.use('*', async (c, next) => {
      c.set('db', db);
      await next();
    });
    app.use('/limited', rateLimit({ name: `${PREFIX}-mw`, windowMs: 60_000, max: 1 }));
    app.post('/limited', (c) => c.json({ ok: true }));
    const env = { DB: {} };
    const headers = { 'CF-Connecting-IP': '203.0.113.9' };

    expect((await app.request('/limited', { method: 'POST', headers }, env)).status).toBe(200);
    expect((await app.request('/limited', { method: 'POST', headers }, env)).status).toBe(429);

    const rows = await db
      .select()
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.key, `${PREFIX}-mw:%`));
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it('lets requests through when the shared counter fails', async () => {
    const app = new Hono<{ Variables: { db: unknown } }>();
    app.use('*', async (c, next) => {
      c.set('db', {
        insert: () => {
          throw new Error('D1 unavailable');
        },
      });
      await next();
    });
    app.use('/limited', rateLimit({ name: `${PREFIX}-broken`, windowMs: 60_000, max: 0 }));
    app.post('/limited', (c) => c.json({ ok: true }));
    const response = await app.request('/limited', { method: 'POST' }, { DB: {} });
    expect(response.status).toBe(200);
  });
});
