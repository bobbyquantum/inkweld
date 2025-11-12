import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index.js';
import { users, projects } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper.js';

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
  });
});
