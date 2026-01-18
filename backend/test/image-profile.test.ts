/**
 * Image Profile API Tests
 *
 * Tests for the image model profile management endpoints.
 * Covers both admin routes (CRUD) and user routes (list enabled profiles).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { imageModelProfiles } from '../src/db/schema/image-model-profiles';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('Image Profile Routes', () => {
  let adminClient: TestClient;
  let userClient: TestClient;
  let unauthClient: TestClient;
  let testAdminId: string;
  let testUserId: string;
  const createdProfileIds: string[] = [];

  beforeAll(async () => {
    // Start test server
    const { baseUrl } = await startTestServer();
    adminClient = new TestClient(baseUrl);
    userClient = new TestClient(baseUrl);
    unauthClient = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'imgprofileadmin'));
    await db.delete(users).where(eq(users.username, 'imgprofileuser'));

    // Create admin user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    const [adminUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'imgprofileadmin',
        email: 'imgprofileadmin@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
        isAdmin: true,
      })
      .returning();

    testAdminId = adminUser.id;

    // Create regular user
    const [regularUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'imgprofileuser',
        email: 'imgprofileuser@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
        isAdmin: false,
      })
      .returning();

    testUserId = regularUser.id;

    // Login admin
    const adminLoggedIn = await adminClient.login('imgprofileadmin', 'testpassword123');
    expect(adminLoggedIn).toBe(true);

    // Login regular user
    const userLoggedIn = await userClient.login('imgprofileuser', 'testpassword123');
    expect(userLoggedIn).toBe(true);
  });

  afterAll(async () => {
    const db = getDatabase();

    // Clean up created profiles
    for (const profileId of createdProfileIds) {
      await db.delete(imageModelProfiles).where(eq(imageModelProfiles.id, profileId));
    }

    // Clean up test users
    await db.delete(users).where(eq(users.id, testAdminId));
    await db.delete(users).where(eq(users.id, testUserId));

    // Stop test server
    await stopTestServer();
  });

  // ============================================
  // Admin Routes - List Providers
  // ============================================

  describe('GET /api/v1/admin/image-profiles/providers', () => {
    it('should list available providers for admin', async () => {
      const { response, json } = await adminClient.request(
        '/api/v1/admin/image-profiles/providers'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as Array<{ id: string; name: string }>;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // Check that expected providers are present
      const providerIds = data.map((p) => p.id);
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('openrouter');
      expect(providerIds).toContain('falai');
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/admin/image-profiles/providers');
      expect(response.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const { response } = await unauthClient.request('/api/v1/admin/image-profiles/providers');
      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // Admin Routes - CRUD Operations
  // ============================================

  describe('POST /api/v1/admin/image-profiles', () => {
    it('should create a new profile', async () => {
      const { response, json } = await adminClient.request('/api/v1/admin/image-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Profile 1',
          description: 'A test profile for unit testing',
          provider: 'openai',
          modelId: 'dall-e-3',
          enabled: true,
          supportsImageInput: false,
          supportsCustomResolutions: false,
          supportedSizes: ['1024x1024', '1792x1024'],
          defaultSize: '1024x1024',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await json()) as { id: string; name: string; provider: string };
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name', 'Test Profile 1');
      expect(data).toHaveProperty('provider', 'openai');
      createdProfileIds.push(data.id);
    });

    it('should reject duplicate profile names', async () => {
      // First create a profile
      const { response: firstResponse, json: firstJson } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Duplicate Test Profile',
            provider: 'openai',
            modelId: 'dall-e-3',
          }),
        }
      );

      expect(firstResponse.status).toBe(201);
      const firstData = (await firstJson()) as { id: string };
      createdProfileIds.push(firstData.id);

      // Try to create another with same name
      const { response: secondResponse } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Duplicate Test Profile',
            provider: 'openrouter',
            modelId: 'flux-pro',
          }),
        }
      );

      expect(secondResponse.status).toBe(409);
    });

    it('should reject invalid provider', async () => {
      const { response } = await adminClient.request('/api/v1/admin/image-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Provider Profile',
          provider: 'invalid-provider',
          modelId: 'some-model',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/admin/image-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Profile',
          provider: 'openai',
          modelId: 'dall-e-3',
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/image-profiles', () => {
    it('should list all profiles for admin', async () => {
      const { response, json } = await adminClient.request('/api/v1/admin/image-profiles');

      expect(response.status).toBe(200);
      const data = (await json()) as Array<{ id: string; name: string }>;
      expect(Array.isArray(data)).toBe(true);
      // Should include at least the profiles we created
      expect(data.length).toBeGreaterThanOrEqual(createdProfileIds.length);
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/admin/image-profiles');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/image-profiles/:profileId', () => {
    it('should get a specific profile', async () => {
      // First create a profile
      const { response: createResponse, json: createJson } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Get Test Profile',
            description: 'Profile for get test',
            provider: 'falai',
            modelId: 'fal-ai/flux-pro',
          }),
        }
      );

      expect(createResponse.status).toBe(201);
      const created = (await createJson()) as { id: string };
      createdProfileIds.push(created.id);

      // Then get it
      const { response, json } = await adminClient.request(
        `/api/v1/admin/image-profiles/${created.id}`
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { id: string; name: string; modelConfig: unknown };
      expect(data).toHaveProperty('id', created.id);
      expect(data).toHaveProperty('name', 'Get Test Profile');
      expect(data).toHaveProperty('modelConfig'); // Admin route includes config
    });

    it('should return 404 for non-existent profile', async () => {
      const { response } = await adminClient.request(
        '/api/v1/admin/image-profiles/non-existent-id'
      );
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/image-profiles/:profileId', () => {
    it('should update a profile', async () => {
      // First create a profile
      const { response: createResponse, json: createJson } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Update Test Profile',
            provider: 'openai',
            modelId: 'dall-e-3',
            enabled: true,
          }),
        }
      );

      expect(createResponse.status).toBe(201);
      const created = (await createJson()) as { id: string };
      createdProfileIds.push(created.id);

      // Then update it
      const { response, json } = await adminClient.request(
        `/api/v1/admin/image-profiles/${created.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Updated Profile Name',
            enabled: false,
            description: 'Updated description',
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { name: string; enabled: boolean; description: string };
      expect(data).toHaveProperty('name', 'Updated Profile Name');
      expect(data).toHaveProperty('enabled', false);
      expect(data).toHaveProperty('description', 'Updated description');
    });

    it('should return 404 for non-existent profile', async () => {
      const { response } = await adminClient.request(
        '/api/v1/admin/image-profiles/non-existent-id',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Name' }),
        }
      );
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/image-profiles/:profileId', () => {
    it('should delete a profile', async () => {
      // First create a profile
      const { response: createResponse, json: createJson } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Delete Test Profile',
            provider: 'openai',
            modelId: 'dall-e-3',
          }),
        }
      );

      expect(createResponse.status).toBe(201);
      const created = (await createJson()) as { id: string };

      // Then delete it
      const { response } = await adminClient.request(`/api/v1/admin/image-profiles/${created.id}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);

      // Verify it's gone
      const { response: getResponse } = await adminClient.request(
        `/api/v1/admin/image-profiles/${created.id}`
      );
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent profile', async () => {
      const { response } = await adminClient.request(
        '/api/v1/admin/image-profiles/non-existent-id',
        {
          method: 'DELETE',
        }
      );
      expect(response.status).toBe(404);
    });
  });

  // ============================================
  // User Routes - List Enabled Profiles
  // ============================================

  describe('GET /api/v1/ai/image-profiles', () => {
    it('should list only enabled profiles for regular users', async () => {
      const uniqueSuffix = Date.now();
      // Create an enabled profile
      const { response: enabledResponse, json: enabledJson } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `User Visible Profile ${uniqueSuffix}`,
            provider: 'openai',
            modelId: 'dall-e-3',
            enabled: true,
          }),
        }
      );

      expect(enabledResponse.status).toBe(201);
      const enabledData = (await enabledJson()) as { id: string };
      const enabledProfileId = enabledData.id;
      createdProfileIds.push(enabledProfileId);

      // Create a disabled profile
      const { response: disabledResponse, json: disabledJson } = await adminClient.request(
        '/api/v1/admin/image-profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `User Hidden Profile ${uniqueSuffix}`,
            provider: 'openai',
            modelId: 'dall-e-2',
            enabled: false,
          }),
        }
      );

      expect(disabledResponse.status).toBe(201);
      const disabledData = (await disabledJson()) as { id: string };
      const disabledProfileId = disabledData.id;
      createdProfileIds.push(disabledProfileId);

      // Now test the listing
      const { response, json } = await userClient.request('/api/v1/ai/image-profiles');

      expect(response.status).toBe(200);
      const data = (await json()) as Array<{ id: string; name: string; enabled: boolean }>;
      expect(Array.isArray(data)).toBe(true);

      // Find our test profiles
      const enabledProfile = data.find((p) => p.id === enabledProfileId);
      const disabledProfile = data.find((p) => p.id === disabledProfileId);

      expect(enabledProfile).toBeDefined();
      expect(disabledProfile).toBeUndefined(); // Should not see disabled profiles
    });

    it('should not include modelConfig in user response', async () => {
      const { response, json } = await userClient.request('/api/v1/ai/image-profiles');

      expect(response.status).toBe(200);
      const data = (await json()) as Array<{ modelConfig?: unknown }>;

      // User responses should not include modelConfig
      for (const profile of data) {
        expect(profile).not.toHaveProperty('modelConfig');
      }
    });

    it('should reject unauthenticated requests', async () => {
      const { response } = await unauthClient.request('/api/v1/ai/image-profiles');
      expect(response.status).toBe(401);
    });
  });
});
