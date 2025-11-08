import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDataSource } from '../src/config/database.js';
import { User } from '../src/entities/user.entity.js';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper.js';

describe('Authentication', () => {
  let testUser: User;
  let client: TestClient;
  let testServer: { port: number; baseUrl: string };

  beforeAll(async () => {
    // Start test server
    testServer = await startTestServer();
    client = new TestClient(testServer.baseUrl);

    // Clean up any existing test user
    const userRepo = getDataSource().getRepository(User);
    await userRepo.delete({ username: 'testuser' });
    await userRepo.delete({ username: 'newuser' });
    await userRepo.delete({ username: 'invalidemailuser' });
    await userRepo.delete({ username: 'weakpassuser' });
    await userRepo.delete({ username: 'meuser' });

    // Create a test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    testUser = userRepo.create({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword,
      approved: true,
      enabled: true,
    });
    await userRepo.save(testUser);
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

  describe('GET /me', () => {
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
      const { response, json } = await client.request('/me');

      expect(response.status).toBe(200);
      const data = await json();
      expect(data).toHaveProperty('username', 'testuser');
    });

    it('should return 401 when not authenticated', async () => {
      // Create a new client without login
      const unauthClient = new TestClient(testServer.baseUrl);
      const { response } = await unauthClient.request('/me');
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
