import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import sharp from 'sharp';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';
import { createObjectBucket } from './r2-bucket-mock';
import { getDatabase } from '../src/db/index';
import { fileStorageService } from '../src/services/file-storage.service';
import { users, projects } from '../src/db/schema/index';
import { errorHandler } from '../src/middleware/error-handler';
import projectRoutes from '../src/routes/project.routes';
import imageRoutes from '../src/routes/image.routes';
import mediaRoutes from '../src/routes/media.routes';
import type { AppContext } from '../src/types/context';

/**
 * A slug rename must take the project's files with it: media and the cover
 * are stored under `<username>/<slug>/`, on disk (Bun) and in R2 (Workers).
 */
describe('Project rename moves stored files', () => {
  const username = 'renamestorageuser';
  let client: TestClient;
  let userId: string;
  let coverPng: Buffer;

  const removeProjectDirectories = () =>
    Promise.all(
      ['fs-before', 'fs-after'].map((slug) =>
        fileStorageService.deleteProjectDirectory(username, slug)
      )
    );

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    await removeProjectDirectories();
    await enablePasswordLoginForTests();
    client = new TestClient(baseUrl);

    const db = getDatabase();
    await db.delete(users).where(eq(users.username, username));
    const [user] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username,
        email: `${username}@example.com`,
        password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
        approved: true,
        enabled: true,
      })
      .returning();
    userId = user.id;
    expect(await client.login(username, TEST_PASSWORDS.DEFAULT)).toBe(true);

    coverPng = await sharp({
      create: { width: 400, height: 600, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await removeProjectDirectories();
    await stopTestServer();
  });

  type Send = (path: string, init?: RequestInit) => Promise<Response>;

  /** Create a project, upload media and a cover, rename it, read both back. */
  async function renameWithFiles(send: Send, oldSlug: string, newSlug: string) {
    const created = await send('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: oldSlug, title: 'Rename me' }),
    });
    expect(created.status).toBe(201);

    const media = new FormData();
    media.append('file', new Blob([new Uint8Array(coverPng)], { type: 'image/png' }), 'map.png');
    expect(
      (await send(`/api/v1/media/${username}/${oldSlug}`, { method: 'POST', body: media })).status
    ).toBe(200);

    const cover = new FormData();
    cover.append('cover', new Blob([new Uint8Array(coverPng)], { type: 'image/png' }), 'cover.png');
    expect(
      (await send(`/api/v1/projects/${username}/${oldSlug}/cover`, { method: 'POST', body: cover }))
        .status
    ).toBe(200);

    const renamed = await send(`/api/v1/projects/${username}/${oldSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: newSlug }),
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { slug: string }).slug).toBe(newSlug);

    const mediaAfter = await send(`/api/v1/media/${username}/${newSlug}/map.png`);
    expect(mediaAfter.status).toBe(200);
    expect(Buffer.from(await mediaAfter.arrayBuffer()).equals(coverPng)).toBe(true);

    const coverAfter = await send(`/api/v1/projects/${username}/${newSlug}/cover`);
    expect(coverAfter.status).toBe(200);
    expect((await coverAfter.arrayBuffer()).byteLength).toBeGreaterThan(0);

    // The old slug redirects to the new one.
    const old = await send(`/api/v1/projects/${username}/${oldSlug}`);
    expect(old.status).toBe(301);
    expect(((await old.json()) as { newSlug: string }).newSlug).toBe(newSlug);
  }

  it('on the filesystem', async () => {
    await renameWithFiles(
      async (path, init) => (await client.request(path, init)).response,
      'fs-before',
      'fs-after'
    );
  });

  it('in R2', async () => {
    const r2 = createObjectBucket();
    const app = new OpenAPIHono<AppContext>();
    app.use('*', async (c, next) => {
      c.set('db', getDatabase());
      c.set('storage', r2.bucket);
      await next();
    });
    app.onError(errorHandler);
    app.route('/api/v1/projects', projectRoutes);
    app.route('/api/v1/projects', imageRoutes);
    app.route('/api/v1/media', mediaRoutes);

    const token = (client as unknown as { token: string }).token;
    const send: Send = async (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return await app.request(path, { ...init, headers });
    };

    await renameWithFiles(send, 'r2-before', 'r2-after');

    const keys = [...r2.store.keys()];
    expect(keys.some((key) => key.startsWith(`${username}/r2-before/`))).toBe(false);
    expect(keys).toContain(`${username}/r2-after/map.png`);
    const coverKey = keys.find((key) => key.startsWith(`${username}/r2-after/cover-`));
    expect(coverKey).toBeDefined();
    expect(r2.store.get(coverKey as string)?.httpMetadata?.contentType).toBe('image/jpeg');
  });
});
