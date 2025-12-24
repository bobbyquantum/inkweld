import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';
import { userService } from '../src/services/user.service';

describe('User Service', () => {
  const db = getDatabase();

  beforeEach(async () => {
    // Clean up test users before each test
    await db.delete(users).where(eq(users.username, 'serviceuser'));
    await db.delete(users).where(eq(users.username, 'githubuser'));
    await db.delete(users).where(eq(users.username, 'passworduser'));
    await db.delete(users).where(eq(users.username, 'zuser'));
    await db.delete(users).where(eq(users.username, 'auser'));
    await db.delete(users).where(eq(users.email, 'service@example.com'));
    await db.delete(users).where(eq(users.email, 'github@example.com'));
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      const found = await userService.findById(db, userId);
      expect(found).toBeDefined();
      expect(found?.username).toBe('serviceuser');
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await userService.findById(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      const found = await userService.findByUsername(db, 'serviceuser');
      expect(found).toBeDefined();
      expect(found?.email).toBe('service@example.com');
    });

    it('should return undefined for non-existent username', async () => {
      const found = await userService.findByUsername(db, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      const found = await userService.findByEmail(db, 'service@example.com');
      expect(found).toBeDefined();
      expect(found?.username).toBe('serviceuser');
    });

    it('should return undefined for non-existent email', async () => {
      const found = await userService.findByEmail(db, 'nonexistent@example.com');
      expect(found).toBeUndefined();
    });
  });

  describe('findByGithubId', () => {
    it('should find user by GitHub ID', async () => {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'githubuser',
        email: 'github@example.com',
        githubId: 'gh123456',
        approved: true,
        enabled: true,
      });

      const found = await userService.findByGithubId(db, 'gh123456');
      expect(found).toBeDefined();
      expect(found?.username).toBe('githubuser');
    });

    it('should return undefined for non-existent GitHub ID', async () => {
      const found = await userService.findByGithubId(db, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'mypassword123',
        name: 'Service User',
      });

      expect(user).toBeDefined();
      expect(user.username).toBe('serviceuser');
      expect(user.email).toBe('service@example.com');
      expect(user.name).toBe('Service User');
      expect(user.enabled).toBe(true);
      // Password should be hashed, not plain text
      expect(user.password).not.toBe('mypassword123');
      expect(user.password?.startsWith('$2')).toBe(true); // bcrypt hash prefix
    });

    it('should create user without name', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'mypassword123',
      });

      expect(user.name).toBeNull();
    });
  });

  describe('createOrUpdateGithubUser', () => {
    it('should create a new GitHub user', async () => {
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh789',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
      });

      expect(user).toBeDefined();
      expect(user.githubId).toBe('gh789');
      expect(user.username).toBe('githubuser');
      expect(user.approved).toBe(false); // GitHub users need approval
    });

    it('should update existing GitHub user', async () => {
      // First create a GitHub user
      await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh789',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
      });

      // Then update with new info
      const updated = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh789',
        username: 'updatedgithub',
        email: 'updated@example.com',
        name: 'Updated Name',
      });

      expect(updated.username).toBe('updatedgithub');
      expect(updated.email).toBe('updated@example.com');
      expect(updated.name).toBe('Updated Name');
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const user = await userService.create(db, {
        username: 'passworduser',
        email: 'password@example.com',
        password: 'correctpassword',
      });

      const isValid = await userService.validatePassword(user, 'correctpassword');
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const user = await userService.create(db, {
        username: 'passworduser',
        email: 'password@example.com',
        password: 'correctpassword',
      });

      const isValid = await userService.validatePassword(user, 'wrongpassword');
      expect(isValid).toBe(false);
    });

    it('should return false for user without password', async () => {
      // Create a GitHub user (no password)
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh999',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'No Password User',
      });

      const isValid = await userService.validatePassword(user, 'anypassword');
      expect(isValid).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      const user = await userService.create(db, {
        username: 'passworduser',
        email: 'password@example.com',
        password: 'oldpassword',
      });

      await userService.updatePassword(db, user.id, 'newpassword');

      const updated = await userService.findById(db, user.id);
      expect(updated).toBeDefined();
      if (!updated) throw new Error('User not found after update');

      // Old password should no longer work
      const oldValid = await userService.validatePassword(updated, 'oldpassword');
      expect(oldValid).toBe(false);

      // New password should work
      const newValid = await userService.validatePassword(updated, 'newpassword');
      expect(newValid).toBe(true);
    });
  });

  describe('approveUser', () => {
    it('should approve a user', async () => {
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh111',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'Unapproved User',
      });

      expect(user.approved).toBe(false);

      await userService.approveUser(db, user.id);

      const updated = await userService.findById(db, user.id);
      expect(updated?.approved).toBe(true);
    });
  });

  describe('setUserEnabled', () => {
    it('should disable a user', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'password123',
      });

      expect(user.enabled).toBe(true);

      await userService.setUserEnabled(db, user.id, false);

      const updated = await userService.findById(db, user.id);
      expect(updated?.enabled).toBe(false);
    });

    it('should enable a disabled user', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'password123',
      });

      await userService.setUserEnabled(db, user.id, false);
      await userService.setUserEnabled(db, user.id, true);

      const updated = await userService.findById(db, user.id);
      expect(updated?.enabled).toBe(true);
    });
  });

  describe('listAll', () => {
    it('should list all users ordered by username', async () => {
      // Create multiple users
      await db.insert(users).values([
        {
          id: crypto.randomUUID(),
          username: 'zuser',
          email: 'z@example.com',
          approved: true,
          enabled: true,
        },
        {
          id: crypto.randomUUID(),
          username: 'auser',
          email: 'a@example.com',
          approved: true,
          enabled: true,
        },
      ]);

      const result = await userService.listAll(db);
      expect(result.users.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);

      // Find our test users in the result
      const zIndex = result.users.findIndex((u) => u.username === 'zuser');
      const aIndex = result.users.findIndex((u) => u.username === 'auser');

      // 'auser' should come before 'zuser'
      expect(aIndex).toBeLessThan(zIndex);
    });
  });

  describe('canLogin', () => {
    it('should return true for enabled and approved user', () => {
      const user = {
        id: 'test',
        username: 'test',
        email: 'test@example.com',
        enabled: true,
        approved: true,
        password: null,
        githubId: null,
        name: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(userService.canLogin(user)).toBe(true);
    });

    it('should return false for disabled user', () => {
      const user = {
        id: 'test',
        username: 'test',
        email: 'test@example.com',
        enabled: false,
        approved: true,
        password: null,
        githubId: null,
        name: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(userService.canLogin(user)).toBe(false);
    });

    it('should return false for unapproved user', () => {
      const user = {
        id: 'test',
        username: 'test',
        email: 'test@example.com',
        enabled: true,
        approved: false,
        password: null,
        githubId: null,
        name: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(userService.canLogin(user)).toBe(false);
    });
  });
});

describe('User Routes', () => {
  let client: TestClient;
  let testServer: { port: number; baseUrl: string };
  const db = getDatabase();

  beforeAll(async () => {
    testServer = await startTestServer();
    client = new TestClient(testServer.baseUrl);

    // Clean up and create test users
    await db.delete(users).where(eq(users.username, 'routeuser'));
    await db.delete(users).where(eq(users.username, 'searchuser1'));
    await db.delete(users).where(eq(users.username, 'searchuser2'));
    await db.delete(users).where(eq(users.username, 'testadmin'));

    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    await db.insert(users).values([
      {
        id: crypto.randomUUID(),
        username: 'routeuser',
        email: 'route@example.com',
        password: hashedPassword,
        name: 'Route User',
        approved: true,
        enabled: true,
      },
      {
        id: crypto.randomUUID(),
        username: 'testadmin',
        email: 'testadmin@example.com',
        password: hashedPassword,
        name: 'Test Admin',
        approved: true,
        enabled: true,
        isAdmin: true,
      },
    ]);
  });

  afterAll(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.username, 'routeuser'));
    await db.delete(users).where(eq(users.username, 'testadmin'));
    await stopTestServer();
  });

  describe('GET /api/v1/users', () => {
    it('should return paginated list of users', async () => {
      const { response, json } = await client.request('/api/v1/users');

      expect(response.status).toBe(200);
      const data = (await json()) as {
        users: Array<{ id: string; username: string }>;
        total: number;
        hasMore: boolean;
      };
      expect(data.users).toBeDefined();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(typeof data.hasMore).toBe('boolean');
    });

    it('should support pagination with limit and offset', async () => {
      const { response, json } = await client.request('/api/v1/users?limit=5&offset=0');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ id: string }>; hasMore: boolean };
      expect(data.users.length).toBeLessThanOrEqual(5);
      expect(typeof data.hasMore).toBe('boolean');
    });

    it('should support search parameter', async () => {
      const { response, json } = await client.request('/api/v1/users?search=admin');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }> };
      // Should find admin user since we seeded it
      expect(data.users.some((u) => u.username.includes('admin'))).toBe(true);
    });
  });

  describe('GET /api/v1/users/search', () => {
    beforeAll(async () => {
      await db.insert(users).values([
        {
          id: crypto.randomUUID(),
          username: 'searchuser1',
          email: 'search1@example.com',
          name: 'First User',
          approved: true,
          enabled: true,
        },
        {
          id: crypto.randomUUID(),
          username: 'searchuser2',
          email: 'search2@example.com',
          name: 'Second User',
          approved: true,
          enabled: true,
        },
      ]);
    });

    it('should search users by username', async () => {
      const { response, json } = await client.request('/api/v1/users/search?term=searchuser');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }> };
      expect(data.users.length).toBeGreaterThanOrEqual(2);
    });

    it('should search users by email', async () => {
      const { response, json } = await client.request('/api/v1/users/search?term=search1@');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }> };
      expect(data.users.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty results for non-matching search', async () => {
      const { response, json } = await client.request('/api/v1/users/search?term=nonexistent12345');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }>; total: number };
      expect(data.users.length).toBe(0);
      expect(data.total).toBe(0);
    });
  });

  describe('GET /api/v1/users/check-username', () => {
    it('should return available for non-existing username', async () => {
      const { response, json } = await client.request(
        '/api/v1/users/check-username?username=availableuser123'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { available: boolean; suggestions: string[] };
      expect(data.available).toBe(true);
      expect(data.suggestions).toEqual([]);
    });

    it('should return unavailable for existing username', async () => {
      const { response, json } = await client.request(
        '/api/v1/users/check-username?username=routeuser'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { available: boolean; suggestions: string[] };
      expect(data.available).toBe(false);
      expect(data.suggestions.length).toBeGreaterThan(0);
    });

    it('should reject username shorter than 3 characters', async () => {
      const { response } = await client.request('/api/v1/users/check-username?username=ab');

      expect(response.status).toBe(400);
    });
  });
});
