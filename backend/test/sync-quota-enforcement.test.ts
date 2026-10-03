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
import { quotaService } from '../src/services/quota.service';
import { getStorageService } from '../src/services/storage.service';

/**
 * End-to-end enforcement: a user at their sync-capacity limit must be refused
 * new media uploads and new project creation, with a body that identifies the
 * refusal as a quota problem rather than an access-control denial — and their
 * existing projects must remain editable.
 */
describe('Sync quota enforcement (routes)', () => {
  let baseUrl: string;
  let client: TestClient;
  const username = 'quotarouteuser';
  const password = TEST_PASSWORDS.ALT;
  const slug = 'quota-enforcement-project';

  beforeAll(async () => {
    const server = await startTestServer();
    await enablePasswordLoginForTests();
    baseUrl = server.baseUrl;
    client = new TestClient(baseUrl);
  });

  afterAll(async () => {
    await getDatabase().delete(config).where(eq(config.key, 'SYNC_QUOTA_ENABLED'));
    await stopTestServer();
  });

  beforeEach(async () => {
    const db = getDatabase();
    // Project rows are deleted directly, so remove their files too — a media
    // file left over from an earlier run would make an upload an overwrite.
    const storage = getStorageService();
    await storage.deleteProjectDirectory(username, slug);
    await storage.deleteProjectDirectory(username, 'quota-new-project');
    await db.delete(projects).where(eq(projects.slug, slug));
    await db.delete(projects).where(eq(projects.slug, 'quota-new-project'));
    await db.delete(users).where(eq(users.username, username));
    await db.delete(config).where(eq(config.key, 'SYNC_QUOTA_DEFAULT_BYTES'));
    await db
      .insert(config)
      .values({ key: 'SYNC_QUOTA_ENABLED', value: 'true', category: 'general' })
      .onConflictDoUpdate({ target: config.key, set: { value: 'true' } });
    quotaService.clearReconcileCooldown();

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username,
      email: 'quotaroute@example.com',
      password: hashedPassword,
      approved: true,
      enabled: true,
    });

    expect(await client.login(username, password)).toBe(true);

    await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Quota Enforcement Project', slug }),
    });
  });

  /** Force the account over its allowance via a generous, explicit override. */
  async function setQuota(bytes: number): Promise<void> {
    const db = getDatabase();
    const row = (await db.select().from(users).where(eq(users.username, username)))[0];
    await db.update(users).set({ syncQuotaBytes: bytes }).where(eq(users.id, row.id));
  }

  it('allows uploads while under the allowance', async () => {
    await setQuota(10 * 1024 * 1024);
    const formData = new FormData();
    formData.append('file', new Blob(['small'], { type: 'image/png' }), 'ok.png');

    const { response } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
  });

  it('refuses a media upload that would cross the allowance, with quota details', async () => {
    // A zero allowance refuses any non-zero upload immediately.
    await setQuota(0);

    const formData = new FormData();
    formData.append('file', new Blob(['payload'], { type: 'image/png' }), 'blocked.png');

    const { response, json } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(403);
    const body = (await json()) as {
      code: string;
      usedBytes: number;
      quotaBytes: number;
      requiredBytes: number;
      reason: string;
    };
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.reason).toBe('media_upload');
    expect(body.quotaBytes).toBe(0);
    expect(body.requiredBytes).toBeGreaterThan(0);
  });

  it('refuses creating a new project when already over the allowance', async () => {
    await setQuota(0);

    const { response, json } = await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Blocked Project', slug: 'quota-new-project' }),
    });

    expect(response.status).toBe(403);
    const body = (await json()) as { code: string; reason: string };
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.reason).toBe('project_create');
  });

  it('still allows creating a project when there is room', async () => {
    await setQuota(10 * 1024 * 1024);

    const { response } = await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Allowed Project', slug: 'quota-new-project' }),
    });

    expect(response.status).toBe(201);
  });

  it('never blocks reading or editing an existing project when over quota', async () => {
    await setQuota(0);

    // Reading the project must stay available — being over quota is not an
    // access-control failure, and the user must be able to get back under it.
    const read = await client.request(`/api/v1/projects/${username}/${slug}`);
    expect(read.response.status).toBe(200);

    const elements = await client.request(`/api/v1/projects/${username}/${slug}/elements`);
    expect(elements.response.status).toBe(200);
  });

  async function upload(name: string, bytes: number) {
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), name);
    return client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });
  }

  async function storedCounter(): Promise<number> {
    const db = getDatabase();
    const row = (await db.select().from(users).where(eq(users.username, username)))[0];
    return row.storageUsedBytes;
  }

  it('does not enforce anything when SYNC_QUOTA_ENABLED is off', async () => {
    await getDatabase().delete(config).where(eq(config.key, 'SYNC_QUOTA_ENABLED'));
    await setQuota(0);

    const media = await upload('free.png', 64);
    expect(media.response.status).toBe(200);

    const project = await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Free Project', slug: 'quota-new-project' }),
    });
    expect(project.response.status).toBe(201);
  });

  it('charges a re-upload of the same file only for its growth', async () => {
    await setQuota(10 * 1024 * 1024);
    const before = await storedCounter();

    expect((await upload('same.png', 1000)).response.status).toBe(200);
    expect((await upload('same.png', 1000)).response.status).toBe(200);
    expect((await upload('same.png', 1500)).response.status).toBe(200);

    expect((await storedCounter()) - before).toBe(1500);
  });

  it('deletes media and credits the freed bytes back', async () => {
    await setQuota(10 * 1024 * 1024);
    expect((await upload('gone.png', 2048)).response.status).toBe(200);
    const before = await storedCounter();

    const del = await client.request(`/api/v1/media/${username}/${slug}/gone.png`, {
      method: 'DELETE',
    });
    expect(del.response.status).toBe(200);
    expect(((await del.json()) as { freedBytes: number }).freedBytes).toBe(2048);
    expect(before - (await storedCounter())).toBe(2048);

    // Gone from the listing, and a second delete is a harmless no-op.
    const list = await client.request(`/api/v1/media/${username}/${slug}`);
    const items = ((await list.json()) as { items: Array<{ filename: string }> }).items;
    expect(items.some((i) => i.filename === 'gone.png')).toBe(false);
    const again = await client.request(`/api/v1/media/${username}/${slug}/gone.png`, {
      method: 'DELETE',
    });
    expect(again.response.status).toBe(200);
    expect(((await again.json()) as { freedBytes: number }).freedBytes).toBe(0);
  });

  it('lets an over-quota user free space and upload again', async () => {
    await setQuota(10 * 1024 * 1024);
    expect((await upload('big.png', 4096)).response.status).toBe(200);
    // Allow exactly what is stored now, so any further upload is refused.
    await setQuota(await storedCounter());
    expect((await upload('next.png', 1024)).response.status).toBe(403);

    await client.request(`/api/v1/media/${username}/${slug}/big.png`, { method: 'DELETE' });

    expect((await upload('next.png', 1024)).response.status).toBe(200);
  });

  it('refuses a published file that would cross the allowance', async () => {
    await setQuota(0);
    const formData = new FormData();
    formData.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'book.pdf');
    formData.append(
      'metadata',
      JSON.stringify({
        filename: 'book.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        planName: 'Plan',
        metadata: {
          title: 'Book',
          author: 'Me',
          subtitle: null,
          language: null,
          itemCount: 1,
          wordCount: null,
        },
      })
    );

    const { response, json } = await client.request(
      `/api/v1/projects/${username}/${slug}/published`,
      { method: 'POST', body: formData }
    );

    expect(response.status).toBe(403);
    const body = (await json()) as { code: string; reason: string };
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.reason).toBe('published_file');
  });

  it('rejects a media delete whose name would leave the media area', async () => {
    const { response } = await client.request(`/api/v1/media/${username}/${slug}/.yjs`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(400);
  });
});
