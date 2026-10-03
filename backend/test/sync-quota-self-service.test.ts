import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { config } from '../src/db/schema/config';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * The self-service `GET /api/v1/users/me/storage` endpoint: a user must be able
 * to see their own usage and allowance (this is what the settings and dashboard
 * meters read), and an anonymous caller must not.
 */
describe('Self-service storage usage (route)', () => {
  let baseUrl: string;
  let client: TestClient;
  const username = 'storageusageuser';
  const password = TEST_PASSWORDS.ALT;
  const slug = 'storage-usage-project';

  beforeAll(async () => {
    const server = await startTestServer();
    await enablePasswordLoginForTests();
    baseUrl = server.baseUrl;
    client = new TestClient(baseUrl);
  });

  afterAll(async () => {
    await stopTestServer();
  });

  beforeEach(async () => {
    const db = getDatabase();
    await db.delete(projects).where(eq(projects.slug, slug));
    await db.delete(users).where(eq(users.username, username));
    await db.delete(config).where(eq(config.key, 'SYNC_QUOTA_DEFAULT_BYTES'));

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username,
      email: 'storageusage@example.com',
      password: hashedPassword,
      approved: true,
      enabled: true,
    });

    expect(await client.login(username, password)).toBe(true);

    await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Storage Usage Project', slug }),
    });
  });

  it('reports the effective allowance and usage to the owner', async () => {
    const db = getDatabase();
    const row = (await db.select().from(users).where(eq(users.username, username)))[0];
    await db.update(users).set({ syncQuotaBytes: 1000 }).where(eq(users.id, row.id));

    const { response, json } = await client.request('/api/v1/users/me/storage');
    expect(response.status).toBe(200);

    const body = (await json()) as {
      usedBytes: number;
      quotaBytes: number;
      overQuota: boolean;
      overSoftLimit: boolean;
      projects: Array<{ slug: string }>;
    };
    expect(body.quotaBytes).toBe(1000);
    expect(body.usedBytes).toBeGreaterThanOrEqual(0);
    expect(body.overQuota).toBe(false);
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.some((p) => p.slug === slug)).toBe(true);
  });

  it('reports over-quota state against a zero allowance', async () => {
    const db = getDatabase();
    const row = (await db.select().from(users).where(eq(users.username, username)))[0];
    await db.update(users).set({ syncQuotaBytes: 0 }).where(eq(users.id, row.id));

    const { response, json } = await client.request('/api/v1/users/me/storage');
    expect(response.status).toBe(200);

    const body = (await json()) as { overQuota: boolean; overSoftLimit: boolean };
    expect(body.overQuota).toBe(true);
    expect(body.overSoftLimit).toBe(true);
  });

  it('uses the instance default when the user has no override', async () => {
    const { response, json } = await client.request('/api/v1/users/me/storage');
    expect(response.status).toBe(200);
    const body = (await json()) as { quotaBytes: number };
    expect(body.quotaBytes).toBe(104857600);
  });

  it('refuses an anonymous caller', async () => {
    const anon = new TestClient(baseUrl);
    const { response } = await anon.request('/api/v1/users/me/storage');
    expect(response.status).toBe(401);
  });

  it('reports whether enforcement is on, and keeps the counter in step', async () => {
    const db = getDatabase();
    const off = await client.request('/api/v1/users/me/storage');
    const offBody = (await off.json()) as { enabled: boolean; usedBytes: number };
    expect(offBody.enabled).toBe(false);

    // The endpoint ran an authoritative recompute, so it persisted the figure.
    const row = (await db.select().from(users).where(eq(users.username, username)))[0];
    expect(row.storageUsedBytes).toBe(offBody.usedBytes);

    await db
      .insert(config)
      .values({ key: 'SYNC_QUOTA_ENABLED', value: 'true', category: 'general' })
      .onConflictDoUpdate({ target: config.key, set: { value: 'true' } });
    try {
      const on = await client.request('/api/v1/users/me/storage');
      expect(((await on.json()) as { enabled: boolean }).enabled).toBe(true);
    } finally {
      await db.delete(config).where(eq(config.key, 'SYNC_QUOTA_ENABLED'));
    }
  });

  it('credits a deleted project back to the counter', async () => {
    const db = getDatabase();
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(3000)], { type: 'image/png' }), 'p.png');
    await client.request(`/api/v1/media/${username}/${slug}`, { method: 'POST', body: formData });
    // Sync the counter with reality first.
    await client.request('/api/v1/users/me/storage');
    const before = (await db.select().from(users).where(eq(users.username, username)))[0];
    expect(before.storageUsedBytes).toBeGreaterThanOrEqual(3000);

    const del = await client.request(`/api/v1/projects/${username}/${slug}`, { method: 'DELETE' });
    expect(del.response.status).toBe(200);

    const after = (await db.select().from(users).where(eq(users.username, username)))[0];
    expect(after.storageUsedBytes).toBe(0);
  });
});
