import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { existsSync } from 'node:fs';
import * as bcrypt from 'bcryptjs';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { fileStorageService } from '../src/services/file-storage.service';
import { yjsService } from '../src/services/yjs.service';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

const USERNAMES = ['deleteme', 'soleadmin', 'otheradmin', 'deleteradmin'];

describe('DELETE /api/v1/users/me', () => {
  const db = getDatabase();
  let baseUrl: string;

  async function createUser(
    username: string,
    extra: Partial<typeof users.$inferInsert> = {}
  ): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username,
        email: `${username}@example.com`,
        password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
        approved: true,
        enabled: true,
        ...extra,
      })
      .returning();
    return user.id;
  }

  async function signIn(username: string): Promise<TestClient> {
    const client = new TestClient(baseUrl);
    expect(await client.login(username, TEST_PASSWORDS.DEFAULT)).toBe(true);
    return client;
  }

  function deleteAccount(client: TestClient, confirmUsername: string) {
    return client.request('/api/v1/users/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmUsername }),
    });
  }

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
  });

  beforeEach(async () => {
    await db.delete(users).where(inArray(users.username, USERNAMES));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.username, USERNAMES));
    await stopTestServer();
  });

  it('requires authentication', async () => {
    const { response } = await deleteAccount(new TestClient(baseUrl), 'deleteme');
    expect(response.status).toBe(401);
  });

  it('refuses when the typed username does not match', async () => {
    const userId = await createUser('deleteme');
    const client = await signIn('deleteme');

    const { response } = await deleteAccount(client, 'someoneelse');

    expect(response.status).toBe(400);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
  });

  it('deletes the account, its projects and their stored content', async () => {
    const userId = await createUser('deleteme');
    const client = await signIn('deleteme');

    const slug = 'doomed-project';
    const created = await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title: 'Doomed' }),
    });
    expect(created.response.status).toBe(201);
    await fileStorageService.saveProjectFile('deleteme', slug, 'note.txt', 'hello');
    const docId = `deleteme:${slug}:elements`;
    const shared = await yjsService.getDocument(docId);
    shared.doc.getArray('elements').insert(0, [{ id: 'e1', name: 'Chapter 1' }]);
    const projectPath = fileStorageService.getProjectPath('deleteme', slug);
    expect(existsSync(projectPath)).toBe(true);

    // Case and surrounding whitespace in the confirmation are forgiven.
    const { response } = await deleteAccount(client, '  DeleteMe ');
    expect(response.status).toBe(200);

    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await db.select().from(projects).where(eq(projects.userId, userId))).toHaveLength(0);
    expect(existsSync(projectPath)).toBe(false);
    const internals = yjsService as unknown as { docs: Map<string, unknown> };
    expect(internals.docs.has(docId)).toBe(false);

    // The old session no longer works.
    const me = await client.request('/api/v1/users/me', { method: 'DELETE' });
    expect(me.response.status).toBe(401);
  });

  it('stops the only administrator from deleting their account', async () => {
    const adminId = await createUser('soleadmin', { isAdmin: true });
    // Other admins left over from other suites would let this through.
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isAdmin, true));
    const demoted = otherAdmins.map((u) => u.id).filter((id) => id !== adminId);
    if (demoted.length > 0) {
      await db.update(users).set({ isAdmin: false }).where(inArray(users.id, demoted));
    }

    try {
      const client = await signIn('soleadmin');
      const { response } = await deleteAccount(client, 'soleadmin');
      expect(response.status).toBe(409);
      expect(await db.select().from(users).where(eq(users.id, adminId))).toHaveLength(1);

      // With a second administrator it goes through.
      await createUser('otheradmin', { isAdmin: true });
      const retry = await deleteAccount(client, 'soleadmin');
      expect(retry.response.status).toBe(200);
    } finally {
      if (demoted.length > 0) {
        await db.update(users).set({ isAdmin: true }).where(inArray(users.id, demoted));
      }
    }
  });

  it("admin deletion removes the user's projects and stored content too", async () => {
    const userId = await createUser('deleteme');
    await createUser('deleteradmin', { isAdmin: true });
    const owner = await signIn('deleteme');
    const admin = await signIn('deleteradmin');

    const slug = 'admin-doomed';
    const created = await owner.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title: 'Doomed by admin' }),
    });
    expect(created.response.status).toBe(201);
    await fileStorageService.saveProjectFile('deleteme', slug, 'note.txt', 'hello');
    const docId = `deleteme:${slug}:elements`;
    const shared = await yjsService.getDocument(docId);
    shared.doc.getArray('elements').insert(0, [{ id: 'e1', name: 'Chapter 1' }]);
    const projectPath = fileStorageService.getProjectPath('deleteme', slug);
    expect(existsSync(projectPath)).toBe(true);

    const { response } = await admin.request(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);

    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await db.select().from(projects).where(eq(projects.userId, userId))).toHaveLength(0);
    expect(existsSync(projectPath)).toBe(false);
    const internals = yjsService as unknown as { docs: Map<string, unknown> };
    expect(internals.docs.has(docId)).toBe(false);
  });
});
