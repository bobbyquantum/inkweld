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
});
