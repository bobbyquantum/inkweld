/**
 * Integration tests for route handlers with 0% function coverage.
 * Tests robots, admin, admin-config, announcement, snapshot, and mcp-keys routes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects, announcements } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

const db = getDatabase();
let client: TestClient;
let adminClient: TestClient;
let testServer: { port: number; baseUrl: string };

const ADMIN_ID = crypto.randomUUID();
const USER_ID = crypto.randomUUID();

beforeAll(async () => {
  testServer = await startTestServer();
  client = new TestClient(testServer.baseUrl);
  adminClient = new TestClient(testServer.baseUrl);

  // Clean up
  await db.delete(users).where(eq(users.username, 'routeadmin'));
  await db.delete(users).where(eq(users.username, 'routeuser'));

  const hashedPassword = await bcrypt.hash('adminpass123', 10);

  // Create admin user
  await db.insert(users).values({
    id: ADMIN_ID,
    username: 'routeadmin',
    email: 'routeadmin@example.com',
    password: hashedPassword,
    approved: true,
    enabled: true,
    isAdmin: true,
  });

  // Create regular user
  await db.insert(users).values({
    id: USER_ID,
    username: 'routeuser',
    email: 'routeuser@example.com',
    password: hashedPassword,
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  await adminClient.login('routeadmin', 'adminpass123');
  await client.login('routeuser', 'adminpass123');
});

afterAll(async () => {
  await db.delete(announcements);
  await db.delete(users).where(eq(users.username, 'routeadmin'));
  await db.delete(users).where(eq(users.username, 'routeuser'));
  await db.delete(users).where(eq(users.username, 'pendinguser'));
  await stopTestServer();
});

// ============================================
// ROBOTS.TXT
// ============================================
describe('Robots.txt Route', () => {
  it('should return robots.txt content', async () => {
    const { response } = await client.request('/robots.txt');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('GPTBot');
    expect(response.headers.get('content-type')).toContain('text/plain');
  });
});

// ============================================
// ADMIN ROUTES
// ============================================
describe('Admin Routes', () => {
  it('should reject non-admin access', async () => {
    const { response } = await client.request('/api/v1/admin/users/pending');
    expect(response.status).toBe(403);
  });

  it('should list pending users', async () => {
    const { response, json } = await adminClient.request('/api/v1/admin/users/pending');
    expect(response.status).toBe(200);
    const data = await json();
    expect(Array.isArray(data)).toBe(true);
  });

  describe('user management', () => {
    let pendingUserId: string;

    beforeEach(async () => {
      await db.delete(users).where(eq(users.username, 'pendinguser'));
      pendingUserId = crypto.randomUUID();
      const hashedPassword = await bcrypt.hash('pending123', 10);
      await db.insert(users).values({
        id: pendingUserId,
        username: 'pendinguser',
        email: 'pending@example.com',
        password: hashedPassword,
        approved: false,
        enabled: true,
        isAdmin: false,
      });
    });

    it('should approve a user', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/users/${pendingUserId}/approve`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.approved).toBe(true);
    });

    it('should reject a user', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/users/${pendingUserId}/reject`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.message).toBe('User rejected');
    });

    it('should disable a user', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/users/${pendingUserId}/disable`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.enabled).toBe(false);
    });

    it('should enable a user', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/users/${pendingUserId}/enable`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.enabled).toBe(true);
    });

    it('should set user admin status', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/users/${pendingUserId}/set-admin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAdmin: true }),
        }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.isAdmin).toBe(true);
    });

    it('should delete a user', async () => {
      const { response, json } = await adminClient.request(`/api/v1/admin/users/${pendingUserId}`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.message).toBe('User deleted');
    });

    it('should return 404 for non-existent user', async () => {
      const { response } = await adminClient.request(
        '/api/v1/admin/users/non-existent-id/approve',
        { method: 'POST' }
      );
      expect(response.status).toBe(404);
    });
  });
});

// ============================================
// ADMIN CONFIG ROUTES
// ============================================
describe('Admin Config Routes', () => {
  it('should reject non-admin access', async () => {
    const { response } = await client.request('/api/v1/admin/config');
    expect(response.status).toBe(403);
  });

  it('should list config keys', async () => {
    const { response, json } = await adminClient.request('/api/v1/admin/config/keys');
    expect(response.status).toBe(200);
    const data = await json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('key');
    expect(data[0]).toHaveProperty('category');
  });

  it('should get all config values', async () => {
    const { response, json } = await adminClient.request('/api/v1/admin/config');
    expect(response.status).toBe(200);
    const data = await json();
    expect(typeof data).toBe('object');
  });

  it('should get config by category', async () => {
    const { response, json } = await adminClient.request('/api/v1/admin/config/category/general');
    expect(response.status).toBe(200);
    const data = await json();
    expect(typeof data).toBe('object');
  });

  it('should get a single config value', async () => {
    const { response, json } = await adminClient.request(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(data).toHaveProperty('key');
    expect(data).toHaveProperty('source');
  });

  it('should return 400 for invalid config key', async () => {
    const { response } = await adminClient.request('/api/v1/admin/config/invalid_key_xyz');
    expect(response.status).toBe(400);
  });

  it('should set and delete a config value', async () => {
    // Set
    const { response: setRes, json: setJson } = await adminClient.request(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'true' }),
      }
    );
    expect(setRes.status).toBe(200);
    const setData = await setJson();
    expect(setData).toHaveProperty('source', 'database');

    // Delete (revert)
    const { response: delRes } = await adminClient.request(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED',
      { method: 'DELETE' }
    );
    expect(delRes.status).toBe(200);
  });
});

// ============================================
// ANNOUNCEMENT ROUTES
// ============================================
describe('Announcement Routes', () => {
  let announcementId: string;

  describe('admin announcement management', () => {
    it('should create an announcement', async () => {
      const { response, json } = await adminClient.request('/api/v1/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Announcement',
          content: 'This is a test announcement body.',
          type: 'announcement',
          priority: 'normal',
        }),
      });
      expect(response.status).toBe(201);
      const data = await json();
      expect(data.title).toBe('Test Announcement');
      announcementId = data.id;
    });

    it('should list all announcements (admin)', async () => {
      const { response, json } = await adminClient.request('/api/v1/admin/announcements');
      expect(response.status).toBe(200);
      const data = await json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('should get a single announcement (admin)', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/announcements/${announcementId}`
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.id).toBe(announcementId);
    });

    it('should update an announcement', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/announcements/${announcementId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Updated Announcement' }),
        }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.title).toBe('Updated Announcement');
    });

    it('should publish an announcement', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/announcements/${announcementId}/publish`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.publishedAt).toBeTruthy();
    });

    it('should unpublish an announcement', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/announcements/${announcementId}/unpublish`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.publishedAt).toBeNull();
    });

    it('should return 404 for non-existent announcement', async () => {
      const { response } = await adminClient.request('/api/v1/admin/announcements/non-existent-id');
      expect(response.status).toBe(404);
    });
  });

  describe('authenticated user announcements', () => {
    beforeAll(async () => {
      // Publish the announcement so it shows for users
      await adminClient.request(`/api/v1/admin/announcements/${announcementId}/publish`, {
        method: 'POST',
      });
    });

    it('should list announcements for authenticated user', async () => {
      const { response, json } = await client.request('/api/v1/announcements');
      expect(response.status).toBe(200);
      const data = await json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should get unread count', async () => {
      const { response, json } = await client.request('/api/v1/announcements/unread-count');
      expect(response.status).toBe(200);
      const data = await json();
      expect(typeof data.count).toBe('number');
    });

    it('should mark announcement as read', async () => {
      const { response, json } = await client.request(
        `/api/v1/announcements/${announcementId}/read`,
        { method: 'POST' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.message).toContain('read');
    });

    it('should mark all as read', async () => {
      const { response, json } = await client.request('/api/v1/announcements/read-all', {
        method: 'POST',
      });
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.message).toContain('read');
    });

    it('should return 404 for non-existent announcement mark-read', async () => {
      const { response } = await client.request('/api/v1/announcements/non-existent-id/read', {
        method: 'POST',
      });
      expect(response.status).toBe(404);
    });
  });

  describe('public announcements', () => {
    it('should list public announcements', async () => {
      const unauthClient = new TestClient(testServer.baseUrl);
      const { response, json } = await unauthClient.request('/api/v1/announcements/public');
      expect(response.status).toBe(200);
      const data = await json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should delete the announcement', async () => {
      const { response, json } = await adminClient.request(
        `/api/v1/admin/announcements/${announcementId}`,
        { method: 'DELETE' }
      );
      expect(response.status).toBe(200);
      const data = await json();
      expect(data.message).toContain('deleted');
    });
  });
});

// ============================================
// SNAPSHOT ROUTES
// ============================================
describe('Snapshot Routes', () => {
  let projectId: string;
  let snapshotId: string;

  beforeAll(async () => {
    // Create a project for snapshot tests
    await db.delete(projects).where(eq(projects.slug, 'snap-test-project'));
    projectId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectId,
      name: 'Snap Test Project',
      title: 'Snap Test Project',
      slug: 'snap-test-project',
      userId: USER_ID,
      createdDate: Date.now(),
      updatedDate: Date.now(),
    });
  });

  afterAll(async () => {
    await db.delete(projects).where(eq(projects.slug, 'snap-test-project'));
  });

  it('should list snapshots (empty)', async () => {
    const { response, json } = await client.request(
      '/api/v1/snapshots/routeuser/snap-test-project'
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should create a snapshot', async () => {
    const { response, json } = await client.request(
      '/api/v1/snapshots/routeuser/snap-test-project',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: 'doc-123',
          name: 'Test Snapshot',
          description: 'A test snapshot',
          xmlContent: '<doc>Hello</doc>',
          wordCount: 1,
        }),
      }
    );
    expect(response.status).toBe(201);
    const data = await json();
    expect(data.name).toBe('Test Snapshot');
    snapshotId = data.id;
  });

  it('should get a single snapshot', async () => {
    const { response, json } = await client.request(
      `/api/v1/snapshots/routeuser/snap-test-project/${snapshotId}`
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.id).toBe(snapshotId);
    expect(data.xmlContent).toBe('<doc>Hello</doc>');
  });

  it('should preview a snapshot', async () => {
    const { response, json } = await client.request(
      `/api/v1/snapshots/routeuser/snap-test-project/${snapshotId}/preview`
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.id).toBe(snapshotId);
  });

  it('should restore a snapshot', async () => {
    const { response, json } = await client.request(
      `/api/v1/snapshots/routeuser/snap-test-project/${snapshotId}/restore`,
      { method: 'POST' }
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.snapshotId).toBe(snapshotId);
  });

  it('should return 404 for non-existent project', async () => {
    const { response } = await client.request('/api/v1/snapshots/routeuser/nonexistent-project');
    expect(response.status).toBe(404);
  });

  it('should delete a snapshot', async () => {
    const { response, json } = await client.request(
      `/api/v1/snapshots/routeuser/snap-test-project/${snapshotId}`,
      { method: 'DELETE' }
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.message).toContain('deleted');
  });
});

// ============================================
// MCP KEY ROUTES
// ============================================
describe('MCP Key Routes', () => {
  let projectId: string;
  let keyId: string;

  beforeAll(async () => {
    await db.delete(projects).where(eq(projects.slug, 'mcp-key-test'));
    projectId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectId,
      name: 'MCP Key Test',
      title: 'MCP Key Test',
      slug: 'mcp-key-test',
      userId: USER_ID,
      createdDate: Date.now(),
      updatedDate: Date.now(),
    });
  });

  afterAll(async () => {
    await db.delete(projects).where(eq(projects.slug, 'mcp-key-test'));
  });

  it('should reject unauthenticated access', async () => {
    const unauthClient = new TestClient(testServer.baseUrl);
    const { response } = await unauthClient.request(`/api/v1/mcp-keys/routeuser/mcp-key-test/keys`);
    expect(response.status).toBe(401);
  });

  it('should list keys (empty)', async () => {
    const { response, json } = await client.request(`/api/v1/mcp-keys/routeuser/mcp-key-test/keys`);
    expect(response.status).toBe(200);
    const data = await json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should create an MCP key', async () => {
    const { response, json } = await client.request(
      `/api/v1/mcp-keys/routeuser/mcp-key-test/keys`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Key',
          permissions: ['read:project', 'read:elements'],
        }),
      }
    );
    expect(response.status).toBe(201);
    const data = await json();
    expect(data.key.name).toBe('Test Key');
    expect(data).toHaveProperty('fullKey');
    keyId = data.key.id;
  });

  it('should delete an MCP key', async () => {
    const { response, json } = await client.request(
      `/api/v1/mcp-keys/routeuser/mcp-key-test/keys/${keyId}`,
      { method: 'DELETE' }
    );
    expect(response.status).toBe(200);
    const data = await json();
    expect(data.message).toContain('deleted');
  });
});
