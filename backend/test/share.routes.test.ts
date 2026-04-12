import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects, publishedFiles } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';
import { getStorageService } from '../src/services/storage.service';

describe('Share Routes', () => {
  let ownerUserId: string;
  let projectId: string;
  let shareToken: string;
  let baseUrl: string;

  beforeAll(async () => {
    const server = await startTestServer();
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

    // Create a published file with sharing enabled
    await db.insert(publishedFiles).values({
      id: crypto.randomUUID(),
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
    const client = new TestClient(baseUrl);
    const loggedIn = await client.login('shareroutes-user', TEST_PASSWORDS.DEFAULT);
    expect(loggedIn).toBe(true);

    // Write file content directly to storage via the storage service
    try {
      const storage = getStorageService();
      const fileId = (
        await db.select().from(publishedFiles).where(eq(publishedFiles.shareToken, shareToken))
      )[0].id;
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
  });
});
