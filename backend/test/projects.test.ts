import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('Projects', () => {
  let testUserId: string;
  let testUsername: string;
  let client: TestClient;
  let testProject: { name: string; slug: string; id: string };

  beforeAll(async () => {
    // Start test server
    const { baseUrl } = await startTestServer();
    client = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'projectuser'));

    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    const [testUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'projectuser',
        email: 'projectuser@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    testUserId = testUser.id;
    // Username is required in the schema, this assertion is safe
    testUsername = testUser.username ?? 'projectuser';

    // Login to get session
    const loggedIn = await client.login('projectuser', 'testpassword123');
    expect(loggedIn).toBe(true);
  });

  afterAll(async () => {
    const db = getDatabase();

    // Clean up test projects
    await db.delete(projects).where(eq(projects.userId, testUserId));

    // Clean up test user
    await db.delete(users).where(eq(users.id, testUserId));

    // Stop test server
    await stopTestServer();
  });

  describe('POST /api/v1/projects', () => {
    it('should create a new project', async () => {
      const { response, json } = await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'my-test-project',
          title: 'My Test Project',
          description: 'A test project',
        }),
      });

      expect(response.status).toBe(201);
      const data = await json();
      expect(data).toHaveProperty('title', 'My Test Project');
      expect(data).toHaveProperty('slug', 'my-test-project');
      testProject = data;
    });

    it('should require authentication', async () => {
      const unauthClient = new TestClient(client['baseUrl']);
      const { response } = await unauthClient.request('/api/v1/projects');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/projects/:username/:slug', () => {
    it('should get project by slug', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${testUsername}/${testProject.slug}`
      );

      expect(response.status).toBe(200);
      const data = await json();
      expect(data).toHaveProperty('slug', testProject.slug);
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(`/api/v1/projects/${testUsername}/nonexistent`);
      expect(response.status).toBe(404);
    });

    it('should validate required fields', async () => {
      const { response } = await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing slug and title
          description: 'Incomplete project',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/projects', () => {
    it('should list user projects', async () => {
      const { response, json } = await client.request('/api/v1/projects');

      expect(response.status).toBe(200);
      const data = await json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      const unauthClient = new TestClient(client['baseUrl']);
      const { response } = await unauthClient.request('/api/v1/projects');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/projects/:username/:slug', () => {
    it('should get project by slug', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${testUsername}/${testProject.slug}`
      );

      expect(response.status).toBe(200);
      const data = await json();
      expect(data).toHaveProperty('title', 'My Test Project');
      expect(data).toHaveProperty('slug', 'my-test-project');
    });

    it('should return 404 for non-existent project', async () => {
      const { response } = await client.request(`/api/v1/projects/${testUsername}/nonexistent`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/projects/:username/:slug', () => {
    it('should update project', async () => {
      const { response, json } = await client.request(
        `/api/v1/projects/${testUsername}/${testProject.slug}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Updated Project Title',
            description: 'Updated description',
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = await json();
      expect(data).toHaveProperty('title', 'Updated Project Title');
      expect(data).toHaveProperty('description', 'Updated description');
    });

    it('should require authentication', async () => {
      const unauthClient = new TestClient(client['baseUrl']);

      const { response } = await unauthClient.request(
        `/api/v1/projects/${testUsername}/${testProject.slug}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Unauthorized' }),
        }
      );

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/projects/:username/:slug', () => {
    it('should delete project', async () => {
      // Create a project to delete
      const { json: createJson } = await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'project-to-delete',
          title: 'Project to Delete',
          description: 'This project will be deleted',
        }),
      });
      const project = await createJson();

      // Delete it
      const { response } = await client.request(
        `/api/v1/projects/${testUsername}/${project.slug}`,
        {
          method: 'DELETE',
        }
      );

      expect(response.status).toBe(200);

      // Verify it's gone
      const { response: getResponse } = await client.request(
        `/api/v1/projects/${testUsername}/${project.slug}`
      );
      expect(getResponse.status).toBe(404);
    });

    it('should create tombstone on delete', async () => {
      // Create a project
      const { json: createJson } = await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'tombstone-test-project',
          title: 'Tombstone Test Project',
        }),
      });
      const project = await createJson();

      // Delete it
      const { response } = await client.request(
        `/api/v1/projects/${testUsername}/${project.slug}`,
        {
          method: 'DELETE',
        }
      );
      expect(response.status).toBe(200);

      // Check tombstone exists via the check endpoint
      const { response: tombstoneResponse, json: tombstoneJson } = await client.request(
        '/api/v1/projects/tombstones/check',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectKeys: [`${testUsername}/tombstone-test-project`],
          }),
        }
      );

      expect(tombstoneResponse.status).toBe(200);
      const tombstoneData = await tombstoneJson();
      expect(tombstoneData.tombstones).toHaveLength(1);
      expect(tombstoneData.tombstones[0].username).toBe(testUsername);
      expect(tombstoneData.tombstones[0].slug).toBe('tombstone-test-project');
      expect(tombstoneData.tombstones[0].deletedAt).toBeDefined();
    });
  });

  describe('POST /api/v1/projects/tombstones/check', () => {
    it('should return empty array for non-deleted projects', async () => {
      const { response, json } = await client.request('/api/v1/projects/tombstones/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKeys: [
            `${testUsername}/nonexistent-project`,
            `${testUsername}/another-nonexistent`,
          ],
        }),
      });

      expect(response.status).toBe(200);
      const data = await json();
      expect(data.tombstones).toHaveLength(0);
    });

    it('should check multiple projectKeys at once', async () => {
      // Create and delete multiple projects
      for (const slug of ['batch-tombstone-1', 'batch-tombstone-2']) {
        await client.request('/api/v1/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, title: `Batch Tombstone ${slug}` }),
        });
        await client.request(`/api/v1/projects/${testUsername}/${slug}`, {
          method: 'DELETE',
        });
      }

      // Check tombstones for all
      const { response, json } = await client.request('/api/v1/projects/tombstones/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKeys: [
            `${testUsername}/batch-tombstone-1`,
            `${testUsername}/batch-tombstone-2`,
            `${testUsername}/nonexistent`,
          ],
        }),
      });

      expect(response.status).toBe(200);
      const data = await json();
      expect(data.tombstones).toHaveLength(2);
      expect(data.tombstones.map((t: { slug: string }) => t.slug).sort()).toEqual([
        'batch-tombstone-1',
        'batch-tombstone-2',
      ]);
    });

    it('should require authentication', async () => {
      const unauthClient = new TestClient(client['baseUrl']);
      const { response } = await unauthClient.request('/api/v1/projects/tombstones/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKeys: [`${testUsername}/test`] }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Tombstone cleanup on project recreation', () => {
    it('should remove tombstone when creating project with same slug', async () => {
      // Create, delete, then recreate with same slug
      const slug = 'recreated-project';

      // Create
      await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: 'Original Project' }),
      });

      // Delete (creates tombstone)
      await client.request(`/api/v1/projects/${testUsername}/${slug}`, {
        method: 'DELETE',
      });

      // Verify tombstone exists
      const { json: beforeJson } = await client.request('/api/v1/projects/tombstones/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKeys: [`${testUsername}/${slug}`] }),
      });
      const beforeData = await beforeJson();
      expect(beforeData.tombstones).toHaveLength(1);

      // Recreate with same slug
      await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: 'Recreated Project' }),
      });

      // Verify tombstone is removed
      const { json: afterJson } = await client.request('/api/v1/projects/tombstones/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKeys: [`${testUsername}/${slug}`] }),
      });
      const afterData = await afterJson();
      expect(afterData.tombstones).toHaveLength(0);

      // Cleanup: delete the recreated project
      await client.request(`/api/v1/projects/${testUsername}/${slug}`, {
        method: 'DELETE',
      });
    });
  });
});
