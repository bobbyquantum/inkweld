import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index.js';
import { users } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper.js';

describe('Authentication', () => {
  let testUserId: string;
  let client: TestClient;
  let testServer: { port: number; baseUrl: string };

  beforeAll(async () => {
    // Start test server
    testServer = await startTestServer();
    client = new TestClient(testServer.baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'testuser'));
    await db.delete(users).where(eq(users.username, 'newuser'));
    await db.delete(users).where(eq(users.username, 'invalidemailuser'));
    await db.delete(users).where(eq(users.username, 'weakpassuser'));
    await db.delete(users).where(eq(users.username, 'meuser'));

    // Create a test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    const [testUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    testUserId = testUser.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('POST /login', () => {
    it('should login with valid credentials', async () => {
      const { response, json } = await client.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpassword123',
        }),
      });

      expect(response.status).toBe(200);
      const data = await json();
      expect(data.user).toHaveProperty('username', 'testuser');

      // Cookie automatically saved by TestClient
    });

    it('should reject invalid password', async () => {
      const { response } = await client.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'wrongpassword',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const { response } = await client.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nonexistent',
          password: 'password123',
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/users/me', () => {
    it('should return current user when authenticated', async () => {
      // First login - cookie persists automatically with TestClient
      await client.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpassword123',
        }),
      });

      // Then get current user
      const { response, json } = await client.request('/api/v1/users/me');

      expect(response.status).toBe(200);
      const data = await json();
      expect(data).toHaveProperty('username', 'testuser');
    });

    it('should return 401 when not authenticated', async () => {
      // Create a new client without login
      const unauthClient = new TestClient(testServer.baseUrl);
      const { response } = await unauthClient.request('/api/v1/users/me');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /logout', () => {
    it('should logout successfully', async () => {
      // First login - cookie persists automatically
      await client.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpassword123',
        }),
      });

      // Then logout
      const { response } = await client.request('/logout', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
    });
  });
});
