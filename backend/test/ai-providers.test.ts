/**
 * AI Providers API Tests
 *
 * Tests for the AI provider management endpoints.
 * Covers API key management, endpoint configuration, and enabled state.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { config as configTable } from '../src/db/schema/config';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('AI Providers Routes', () => {
  let adminClient: TestClient;
  let userClient: TestClient;
  let unauthClient: TestClient;
  let testAdminId: string;
  let testUserId: string;

  // Store original config values for cleanup
  const originalConfigs: Map<string, string | null> = new Map();

  beforeAll(async () => {
    // Start test server
    const { baseUrl } = await startTestServer();
    adminClient = new TestClient(baseUrl);
    userClient = new TestClient(baseUrl);
    unauthClient = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'aiprovideradmin'));
    await db.delete(users).where(eq(users.username, 'aiprovideruser'));

    // Create admin user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    const [adminUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'aiprovideradmin',
        email: 'aiprovideradmin@example.com',
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
        username: 'aiprovideruser',
        email: 'aiprovideruser@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
        isAdmin: false,
      })
      .returning();

    testUserId = regularUser.id;

    // Login admin
    const adminLoggedIn = await adminClient.login('aiprovideradmin', 'testpassword123');
    expect(adminLoggedIn).toBe(true);

    // Login regular user
    const userLoggedIn = await userClient.login('aiprovideruser', 'testpassword123');
    expect(userLoggedIn).toBe(true);
  });

  afterAll(async () => {
    const db = getDatabase();

    // Restore original config values
    for (const [key, value] of originalConfigs) {
      if (value === null) {
        await db.delete(configTable).where(eq(configTable.key, key));
      } else {
        await db.update(configTable).set({ value }).where(eq(configTable.key, key));
      }
    }

    // Clean up test users
    await db.delete(users).where(eq(users.id, testAdminId));
    await db.delete(users).where(eq(users.id, testUserId));

    // Stop test server
    await stopTestServer();
  });

  // Helper to save and later restore config values
  async function saveOriginalConfig(key: string): Promise<void> {
    if (originalConfigs.has(key)) return;

    const db = getDatabase();
    const existing = await db.select().from(configTable).where(eq(configTable.key, key)).limit(1);
    originalConfigs.set(key, existing.length > 0 ? existing[0].value : null);
  }

  // ============================================
  // Get Provider Status
  // ============================================

  describe('GET /api/v1/ai/providers/status', () => {
    it('should get provider status for authenticated user', async () => {
      const { response, json } = await userClient.request('/api/v1/ai/providers/status');

      expect(response.status).toBe(200);
      const data = (await json()) as {
        providers: Array<{
          id: string;
          name: string;
          hasApiKey: boolean;
          supportsImages: boolean;
          supportsText: boolean;
        }>;
      };
      expect(data).toHaveProperty('providers');
      expect(Array.isArray(data.providers)).toBe(true);

      // Check that expected providers are present
      const providerIds = data.providers.map((p) => p.id);
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('openrouter');
      expect(providerIds).toContain('anthropic');
      expect(providerIds).toContain('falai');
      expect(providerIds).toContain('stable-diffusion');

      // Check structure
      const openai = data.providers.find((p) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai).toHaveProperty('name');
      expect(openai).toHaveProperty('hasApiKey');
      expect(openai).toHaveProperty('supportsImages');
      expect(openai).toHaveProperty('supportsText');
    });

    it('should reject unauthenticated requests', async () => {
      const { response } = await unauthClient.request('/api/v1/ai/providers/status');
      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // Set Provider API Key
  // ============================================

  describe('PUT /api/v1/ai/providers/:providerId/key', () => {
    it('should set API key for a provider', async () => {
      await saveOriginalConfig('AI_OPENAI_API_KEY');

      const { response, json } = await adminClient.request('/api/v1/ai/providers/openai/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-openai-key-12345' }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { success: boolean };
      expect(data).toHaveProperty('success', true);

      // Verify the key was set by checking status
      const { response: statusResponse, json: statusJson } = await adminClient.request(
        '/api/v1/ai/providers/status'
      );
      expect(statusResponse.status).toBe(200);
      const statusData = (await statusJson()) as {
        providers: Array<{ id: string; hasApiKey: boolean }>;
      };
      const openai = statusData.providers.find((p) => p.id === 'openai');
      expect(openai?.hasApiKey).toBe(true);
    });

    it('should reject invalid provider', async () => {
      const { response, json } = await adminClient.request(
        '/api/v1/ai/providers/invalid-provider/key',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: 'test-key' }),
        }
      );

      expect(response.status).toBe(400);
      const data = (await json()) as { error: string };
      expect(data).toHaveProperty('error');
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/ai/providers/openai/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-key' }),
      });

      expect(response.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const { response } = await unauthClient.request('/api/v1/ai/providers/openai/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-key' }),
      });

      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // Delete Provider API Key
  // ============================================

  describe('DELETE /api/v1/ai/providers/:providerId/key', () => {
    it('should delete API key for a provider', async () => {
      await saveOriginalConfig('AI_FALAI_API_KEY');

      // First set a key
      await adminClient.request('/api/v1/ai/providers/falai/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-falai-key' }),
      });

      // Verify it's set
      let statusResponse = await adminClient.request('/api/v1/ai/providers/status');
      let statusData = (await statusResponse.json()) as {
        providers: Array<{ id: string; hasApiKey: boolean }>;
      };
      let falai = statusData.providers.find((p) => p.id === 'falai');
      expect(falai?.hasApiKey).toBe(true);

      // Now delete it
      const { response, json } = await adminClient.request('/api/v1/ai/providers/falai/key', {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { success: boolean };
      expect(data).toHaveProperty('success', true);

      // Verify it's deleted
      statusResponse = await adminClient.request('/api/v1/ai/providers/status');
      statusData = (await statusResponse.json()) as {
        providers: Array<{ id: string; hasApiKey: boolean }>;
      };
      falai = statusData.providers.find((p) => p.id === 'falai');
      expect(falai?.hasApiKey).toBe(false);
    });

    it('should reject invalid provider', async () => {
      const { response } = await adminClient.request('/api/v1/ai/providers/invalid-provider/key', {
        method: 'DELETE',
      });

      expect(response.status).toBe(400);
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/ai/providers/openai/key', {
        method: 'DELETE',
      });

      expect(response.status).toBe(403);
    });
  });

  // ============================================
  // Set Provider Endpoint
  // ============================================

  describe('PUT /api/v1/ai/providers/:providerId/endpoint', () => {
    it('should set endpoint for Stable Diffusion', async () => {
      await saveOriginalConfig('AI_SD_ENDPOINT');

      const { response, json } = await adminClient.request(
        '/api/v1/ai/providers/stable-diffusion/endpoint',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'http://localhost:7860' }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { success: boolean };
      expect(data).toHaveProperty('success', true);

      // Verify the endpoint was set
      const { response: statusResponse, json: statusJson } = await adminClient.request(
        '/api/v1/ai/providers/status'
      );
      expect(statusResponse.status).toBe(200);
      const statusData = (await statusJson()) as {
        providers: Array<{ id: string; hasEndpoint?: boolean }>;
      };
      const sd = statusData.providers.find((p) => p.id === 'stable-diffusion');
      expect(sd?.hasEndpoint).toBe(true);
    });

    it('should set endpoint for OpenAI-compatible API', async () => {
      await saveOriginalConfig('AI_OPENAI_ENDPOINT');

      const { response, json } = await adminClient.request('/api/v1/ai/providers/openai/endpoint', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://api.custom-openai.com/v1' }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { success: boolean };
      expect(data).toHaveProperty('success', true);
    });

    it('should reject providers without endpoint support', async () => {
      const { response, json } = await adminClient.request(
        '/api/v1/ai/providers/anthropic/endpoint',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'http://custom-endpoint.com' }),
        }
      );

      expect(response.status).toBe(400);
      const data = (await json()) as { error: string };
      expect(data.error).toContain('does not support custom endpoints');
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request(
        '/api/v1/ai/providers/stable-diffusion/endpoint',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'http://localhost:7860' }),
        }
      );

      expect(response.status).toBe(403);
    });
  });

  // ============================================
  // Set Provider Image Enabled State
  // ============================================

  describe('PUT /api/v1/ai/providers/:providerId/image-enabled', () => {
    it('should enable image generation for a provider', async () => {
      await saveOriginalConfig('AI_IMAGE_OPENAI_ENABLED');

      const { response, json } = await adminClient.request(
        '/api/v1/ai/providers/openai/image-enabled',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { success: boolean };
      expect(data).toHaveProperty('success', true);

      // Verify the state was set
      const { response: statusResponse, json: statusJson } = await adminClient.request(
        '/api/v1/ai/providers/status'
      );
      expect(statusResponse.status).toBe(200);
      const statusData = (await statusJson()) as {
        providers: Array<{ id: string; imageEnabled?: boolean; imageEnabledExplicit?: boolean }>;
      };
      const openai = statusData.providers.find((p) => p.id === 'openai');
      expect(openai?.imageEnabled).toBe(true);
      expect(openai?.imageEnabledExplicit).toBe(true);
    });

    it('should disable image generation for a provider', async () => {
      await saveOriginalConfig('AI_IMAGE_FALAI_ENABLED');

      const { response, json } = await adminClient.request(
        '/api/v1/ai/providers/falai/image-enabled',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { success: boolean };
      expect(data).toHaveProperty('success', true);
    });

    it('should reject providers without image support', async () => {
      const { response, json } = await adminClient.request(
        '/api/v1/ai/providers/anthropic/image-enabled',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        }
      );

      expect(response.status).toBe(400);
      const data = (await json()) as { error: string };
      expect(data.error).toContain('does not support image generation');
    });

    it('should reject non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/ai/providers/openai/image-enabled', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });

      expect(response.status).toBe(403);
    });
  });
});
