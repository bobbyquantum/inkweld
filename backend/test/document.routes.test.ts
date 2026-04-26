import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

describe('Document Routes', () => {
  let ownerUserId: string;
  let ownerUsername: string;
  let projectSlug: string;
  let client: TestClient;
  let baseUrl: string;

  beforeAll(async () => {
    const server = await startTestServer();
    // Legacy password-flow tests: opt in to PASSWORD_LOGIN_ENABLED.
    await enablePasswordLoginForTests();
    baseUrl = server.baseUrl;
    client = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'docroutes-user'));

    // Create test user
    const hashedPassword = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const [testUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'docroutes-user',
        email: 'docroutes@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    ownerUserId = testUser.id;
    ownerUsername = testUser.username ?? 'docroutes-user';

    // Login
    const loggedIn = await client.login('docroutes-user', TEST_PASSWORDS.DEFAULT);
    expect(loggedIn).toBe(true);

    // Create a test project
    const { response, json } = await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'doc-test-project',
        title: 'Doc Test Project',
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

  // ───────────────────── GET /:username/:slug/docs ─────────────────────

  describe('GET /api/v1/projects/:username/:slug/docs', () => {
    it('should return 401 without authentication', async () => {
      const unauthClient = new TestClient(baseUrl);
      const { response } = await unauthClient.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs`
      );
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/nonexistent-project/docs`
      );
      expect(response.status).toBe(404);
    });

    it('should return 200 with document list for owner', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs`
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ───────────────────── GET /:username/:slug/docs/:docId ─────────────

  describe('GET /api/v1/projects/:username/:slug/docs/:docId', () => {
    it('should return 401 without authentication', async () => {
      const unauthClient = new TestClient(baseUrl);
      const { response } = await unauthClient.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1`
      );
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/nonexistent/docs/doc-1`
      );
      expect(response.status).toBe(404);
    });

    it('should return 200 for valid project and docId', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/some-doc`
      );
      expect(response.status).toBe(200);
      const data = (await json()) as { id: string };
      expect(data).toHaveProperty('id', 'some-doc');
    });
  });

  // ───────────────────── GET /:username/:slug/docs/:docId/html ────────

  describe('GET /api/v1/projects/:username/:slug/docs/:docId/html', () => {
    it('should return 401 without authentication', async () => {
      const unauthClient = new TestClient(baseUrl);
      const { response } = await unauthClient.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1/html`
      );
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/nonexistent/docs/doc-1/html`
      );
      expect(response.status).toBe(404);
    });

    it('should return HTML content for valid project', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/test-doc/html`
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('test-doc');
    });

    it('should escape special characters in docId to prevent XSS', async () => {
      const { response } = await client.request(
        `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/${encodeURIComponent('<script>alert(1)</script>')}/html`
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      // Verify the raw script tag is NOT in the output
      expect(html).not.toContain('<script>');
      // Should be HTML-escaped
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
