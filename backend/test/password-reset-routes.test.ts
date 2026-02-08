import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('Password Reset Routes', () => {
  let client: TestClient;
  let adminClient: TestClient;
  const testEmail = 'pwreset-routes@example.com';
  const testUsername = 'pwresetuser';

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    client = new TestClient(baseUrl);
    adminClient = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, testUsername));
    await db.delete(users).where(eq(users.username, 'pwresetadmin'));

    // Create a test user
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username: testUsername,
      email: testEmail,
      password: hashedPassword,
      approved: true,
      enabled: true,
    });

    // Create admin user
    const adminHashedPassword = await bcrypt.hash('adminpass123', 10);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username: 'pwresetadmin',
      email: 'pwresetadmin@example.com',
      password: adminHashedPassword,
      approved: true,
      enabled: true,
      isAdmin: true,
    });

    // Login as admin for admin routes
    await adminClient.login('pwresetadmin', 'adminpass123');
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(users).where(eq(users.username, testUsername));
    await db.delete(users).where(eq(users.username, 'pwresetadmin'));
    await stopTestServer();
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should accept a valid email and return success', async () => {
      const { response, json } = await client.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { message: string };
      expect(data).toHaveProperty('message');
    });

    it('should return the same response for non-existent email (anti-enumeration)', async () => {
      const { response, json } = await client.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { message: string };
      expect(data).toHaveProperty('message');
    });

    it('should reject request without email', async () => {
      const { response } = await client.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // OpenAPI validation should reject it
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('should reject an invalid token', async () => {
      const { response, json } = await client.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalidtoken123',
          newPassword: 'newpassword123',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await json()) as { error: string };
      expect(data).toHaveProperty('error');
    });

    it('should reject request without token', async () => {
      const { response } = await client.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'newpassword123' }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject request without newPassword', async () => {
      const { response } = await client.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'sometoken' }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v1/config/features', () => {
    it('should include emailEnabled in features response', async () => {
      const { response, json } = await client.request('/api/v1/config/features');

      expect(response.status).toBe(200);
      const data = (await json()) as { emailEnabled: boolean };
      expect(data).toHaveProperty('emailEnabled');
      expect(typeof data.emailEnabled).toBe('boolean');
    });
  });

  describe('POST /api/v1/admin/email/test', () => {
    it('should reject unauthenticated requests', async () => {
      const unauthClient = new TestClient(
        // We need the base URL — extract from admin client
        (adminClient as unknown as { baseUrl: string }).baseUrl
      );

      const { response } = await unauthClient.request('/api/v1/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBeGreaterThanOrEqual(401);
    });
  });
});
