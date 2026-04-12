import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

describe('Element Routes', () => {
  let ownerUserId: string;
  let ownerUsername: string;
  let projectSlug: string;
  let client: TestClient;
  let baseUrl: string;

  beforeAll(async () => {
    const server = await startTestServer();
    baseUrl = server.baseUrl;
    client = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'elemroutes-user'));

    // Create test user
    const hashedPassword = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const [testUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'elemroutes-user',
        email: 'elemroutes@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    ownerUserId = testUser.id;
    ownerUsername = testUser.username ?? 'elemroutes-user';

    // Login
    const loggedIn = await client.login('elemroutes-user', TEST_PASSWORDS.DEFAULT);
    expect(loggedIn).toBe(true);

    // Create a test project
    const { response, json } = await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'elem-test-project',
        title: 'Element Test Project',
      }),
    });
    expect(response.status).toBe(201);
    const project = (await json()) as { slug: string };
    projectSlug = project.slug;
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(projects).where(eq(projects.userId, ownerUserId));
    await db.delete(users).where(eq(users.id, ownerUserId));
    await stopTestServer();
  });

  // ───────────────────── GET /:username/:slug/elements ─────────────────

  describe('GET /api/v1/projects/:username/:slug/elements', () => {
    it('should return 401 without authentication', async () => {
      const unauthClient = new TestClient(baseUrl);
      const { response } = await unauthClient.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/elements`
      );
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/nonexistent-project/elements`
      );
      expect(response.status).toBe(404);
    });

    it('should return 200 with element list for owner', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/elements`
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ───────────────────── POST /:username/:slug/element-images ──────────

  describe('POST /api/v1/projects/:username/:slug/element-images', () => {
    it('should return 401 without authentication', async () => {
      const unauthClient = new TestClient(baseUrl);
      const { response } = await unauthClient.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/element-images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elementIds: ['elem-1'] }),
        }
      );
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/nonexistent-project/element-images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elementIds: ['elem-1'] }),
        }
      );
      expect(response.status).toBe(404);
    });

    it('should return 400 for empty elementIds array', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/element-images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elementIds: [] }),
        }
      );
      expect(response.status).toBe(400);
    });

    it('should return 200 with images map for valid request', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/element-images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elementIds: ['nonexistent-elem-1'] }),
        }
      );
      expect(response.status).toBe(200);
      const data = (await json()) as { images: Record<string, string | null> };
      expect(data).toHaveProperty('images');
      // Non-existent elements should return null
      expect(data.images['nonexistent-elem-1']).toBeNull();
    });
  });
});
