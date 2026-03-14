import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('Admin Stats', () => {
  let adminClient: TestClient;
  let userClient: TestClient;
  let anonClient: TestClient;
  let testServer: { port: number; baseUrl: string };

  beforeAll(async () => {
    testServer = await startTestServer();
    adminClient = new TestClient(testServer.baseUrl);
    userClient = new TestClient(testServer.baseUrl);
    anonClient = new TestClient(testServer.baseUrl);

    const db = getDatabase();

    // Clean up test users
    await db.delete(users).where(eq(users.username, 'statsadmin'));
    await db.delete(users).where(eq(users.username, 'statsuser'));

    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    // Create admin user
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username: 'statsadmin',
      email: 'statsadmin@example.com',
      password: hashedPassword,
      approved: true,
      enabled: true,
      isAdmin: true,
    });

    // Create regular user
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username: 'statsuser',
      email: 'statsuser@example.com',
      password: hashedPassword,
      approved: true,
      enabled: true,
      isAdmin: false,
    });

    await adminClient.login('statsadmin', 'testpassword123');
    await userClient.login('statsuser', 'testpassword123');
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(users).where(eq(users.username, 'statsadmin'));
    await db.delete(users).where(eq(users.username, 'statsuser'));
    await stopTestServer();
  });

  describe('GET /api/v1/admin/stats', () => {
    it('should return system stats for admin users', async () => {
      const { response, json } = await adminClient.request('/api/v1/admin/stats');
      expect(response.status).toBe(200);

      const data = (await json()) as Record<string, unknown>;
      expect(typeof data.userCount).toBe('number');
      expect(typeof data.projectCount).toBe('number');
      expect(typeof data.pendingUserCount).toBe('number');
      expect(typeof data.version).toBe('string');
      expect(typeof data.uptime).toBe('number');
      expect(typeof data.runtime).toBe('string');
      expect(data.userCount as number).toBeGreaterThanOrEqual(1);
      expect(data.uptime as number).toBeGreaterThan(0);
    });

    it('should return 403 for non-admin users', async () => {
      const { response } = await userClient.request('/api/v1/admin/stats');
      expect(response.status).toBe(403);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const { response } = await anonClient.request('/api/v1/admin/stats');
      expect(response.status).toBe(401);
    });
  });
});
