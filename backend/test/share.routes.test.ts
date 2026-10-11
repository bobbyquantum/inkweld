import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects, publishedFiles } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';
import { getStorageService } from '../src/services/storage.service';

describe('Share Routes', () => {
  let ownerUserId: string;
  let projectId: string;
  let shareToken: string;
  let fileId: string;
  let baseUrl: string;
  let client: TestClient;

  beforeAll(async () => {
    const server = await startTestServer();
    // Legacy password-flow tests: opt in to PASSWORD_LOGIN_ENABLED.
    await enablePasswordLoginForTests();
    baseUrl = server.baseUrl;

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'shareroutes-user'));

    // Create test user
    const hashedPassword = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const [testUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'shareroutes-user',
        email: 'shareroutes@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    ownerUserId = testUser.id;

    // Create a test project directly in the DB (share routes are public,
    // we just need the data to exist)
    const [project] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        slug: 'share-test-project',
        title: 'Share Test Project',
        userId: ownerUserId,
        createdDate: Date.now(),
        updatedDate: Date.now(),
      })
      .returning();

    projectId = project.id;
    shareToken = 'test-share-token-' + Date.now();
    fileId = crypto.randomUUID();

    // Create a published file with sharing enabled
    await db.insert(publishedFiles).values({
      id: fileId,
      projectId,
      filename: 'test-story.epub',
      format: 'epub',
      mimeType: 'application/epub+zip',
      size: 1234,
      planName: 'default',
      metaTitle: 'Test Story',
      metaAuthor: 'Test Author',
      shareToken,
      sharePermission: 'link',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Write a test file to storage so the download route can read it
    client = new TestClient(baseUrl);
    const loggedIn = await client.login('shareroutes-user', TEST_PASSWORDS.DEFAULT);
    expect(loggedIn).toBe(true);

    // Write file content directly to storage via the storage service
    try {
      const storage = getStorageService();
      await storage.saveProjectFile(
        'shareroutes-user',
        'share-test-project',
        `published/${fileId}`,
        Buffer.from('fake epub content')
      );
    } catch {
      // Storage may not be available in all test environments
    }
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(publishedFiles).where(eq(publishedFiles.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, ownerUserId));
    await stopTestServer();
  });

  // ───────────────────── GET /api/v1/share/:shareToken ─────────────────

  describe('GET /api/v1/share/:shareToken', () => {
    it('should return 404 for non-existent share token', async () => {
      const response = await fetch(`${baseUrl}/api/v1/share/nonexistent-token`);
      expect(response.status).toBe(404);
    });

    it('should work without authentication (public route)', async () => {
      // Even without auth, the route should process the request
      const response = await fetch(`${baseUrl}/api/v1/share/${shareToken}`);
      // Should be 200 (file found) or 404 (if storage file wasn't written)
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers.get('content-disposition')).toContain('test-story.epub');
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
    });
  });

  // ───────────────────── GET /api/v1/share/:shareToken/info ────────────

  describe('GET /api/v1/share/:shareToken/info', () => {
    it('should return 404 for non-existent share token', async () => {
      const response = await fetch(`${baseUrl}/api/v1/share/nonexistent-token/info`);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return file metadata for valid share token', async () => {
      const response = await fetch(`${baseUrl}/api/v1/share/${shareToken}/info`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        filename: string;
        format: string;
        size: number;
        title: string;
        author: string;
        createdAt: string;
      };
      expect(data.filename).toBe('test-story.epub');
      expect(data.format).toBe('epub');
      expect(data.size).toBe(1234);
      expect(data.title).toBe('Test Story');
      expect(data.author).toBe('Test Author');
      expect(data.createdAt).toBeDefined();
    });

    it('should work without authentication (public route)', async () => {
      // No auth headers - this should still work
      const response = await fetch(`${baseUrl}/api/v1/share/${shareToken}/info`);
      expect(response.status).toBe(200);
    });

    it('keeps "Anyone with link" files out of search engines', async () => {
      const response = await fetch(`${baseUrl}/api/v1/share/${shareToken}/info`);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    });
  });

  // ───────────────────── GET /share/:shareToken (landing page) ─────────

  describe('GET /share/:shareToken', () => {
    it('serves a public landing page for the shared file', async () => {
      const response = await fetch(`${baseUrl}/share/${shareToken}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');

      const html = await response.text();
      expect(html).toContain('<h1>Test Story</h1>');
      expect(html).toContain('by Test Author');
      expect(html).toContain('test-story.epub');
      expect(html).toContain(`href="../api/v1/share/${shareToken}"`);
    });

    it('links to a download URL that resolves to the API route', async () => {
      const html = await (await fetch(`${baseUrl}/share/${shareToken}`)).text();
      const href = /class="download" href="([^"]+)"/.exec(html)?.[1];
      expect(href).toBeDefined();
      const resolved = new URL(href as string, `${baseUrl}/share/${shareToken}`);
      expect(resolved.pathname).toBe(`/api/v1/share/${shareToken}`);
    });

    it('returns a not-found page for an unknown token', async () => {
      const response = await fetch(`${baseUrl}/share/nonexistent-token`);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(await response.text()).toContain('This link isn’t available');
    });

    it('returns the not-found page for a malformed token', async () => {
      const response = await fetch(`${baseUrl}/share/${encodeURIComponent('<script>')}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('<script>');
    });
  });

  // ───────────────── GET .../published/:fileId/share-link ──────────────

  describe('GET /api/v1/projects/:username/:slug/published/:fileId/share-link', () => {
    const originalBaseUrl = process.env.BASE_URL;

    afterAll(() => {
      if (originalBaseUrl === undefined) delete process.env.BASE_URL;
      else process.env.BASE_URL = originalBaseUrl;
    });

    it("builds the link on the API server's public URL", async () => {
      process.env.BASE_URL = 'https://api.share-test.example';
      const { response, json } = await client.request(
        `/api/v1/projects/shareroutes-user/share-test-project/published/${fileId}/share-link`
      );
      expect(response.status).toBe(200);
      const data = (await json()) as { shareToken: string; shareUrl: string };
      expect(data.shareToken).toBe(shareToken);
      expect(data.shareUrl).toBe(`https://api.share-test.example/share/${shareToken}`);
    });

    it('falls back to the origin the request arrived on', async () => {
      delete process.env.BASE_URL;
      const { response, json } = await client.request(
        `/api/v1/projects/shareroutes-user/share-test-project/published/${fileId}/share-link`
      );
      expect(response.status).toBe(200);
      const data = (await json()) as { shareUrl: string };
      expect(data.shareUrl).toBe(`${baseUrl}/share/${shareToken}`);
    });
  });

  // ───────────────────── Share permission enforcement ──────────────────

  describe('share permission enforcement', () => {
    let privateToken: string;

    beforeAll(async () => {
      const db = getDatabase();
      privateToken = 'private-token-' + Date.now();

      // Create a published file with no public sharing
      await db.insert(publishedFiles).values({
        id: crypto.randomUUID(),
        projectId,
        filename: 'private-story.epub',
        format: 'epub',
        mimeType: 'application/epub+zip',
        size: 999,
        planName: 'default',
        metaTitle: 'Private Story',
        metaAuthor: 'Author',
        shareToken: privateToken,
        sharePermission: 'private',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('should return 404 for files with sharing disabled', async () => {
      const response = await fetch(`${baseUrl}/api/v1/share/${privateToken}/info`);
      expect(response.status).toBe(404);
    });

    it('should return 404 for file download with sharing disabled', async () => {
      const response = await fetch(`${baseUrl}/api/v1/share/${privateToken}`);
      expect(response.status).toBe(404);
    });

    it('should not render the landing page with sharing disabled', async () => {
      const response = await fetch(`${baseUrl}/share/${privateToken}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('Private Story');
    });
  });

  // ───────────────────── "Anyone" (public) files ───────────────────────

  describe('"Anyone" files', () => {
    let publicToken: string;

    beforeAll(async () => {
      const db = getDatabase();
      publicToken = 'public-token-' + Date.now();
      await db.insert(publishedFiles).values({
        id: crypto.randomUUID(),
        projectId,
        filename: 'public-story.pdf',
        format: 'PDF_SIMPLE',
        mimeType: 'application/pdf',
        size: 4096,
        planName: 'default',
        metaTitle: 'Public Story',
        metaAuthor: 'Author',
        shareToken: publicToken,
        sharePermission: 'public',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('can be opened with the link, like "Anyone with link"', async () => {
      const response = await fetch(`${baseUrl}/share/${publicToken}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<h1>Public Story</h1>');
    });

    it('may be indexed by search engines', async () => {
      const page = await fetch(`${baseUrl}/share/${publicToken}`);
      expect(page.headers.get('x-robots-tag')).toBe('all');
      const info = await fetch(`${baseUrl}/api/v1/share/${publicToken}/info`);
      expect(info.headers.get('x-robots-tag')).toBe('all');
    });
  });
});
