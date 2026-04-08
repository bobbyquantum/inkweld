import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { commentThreads } from '../src/db/schema/comment-threads';
import { commentMessages } from '../src/db/schema/comment-messages';
import { commentReadStatus } from '../src/db/schema/comment-read-status';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

describe('Comments', () => {
  let ownerClient: TestClient;
  let collabClient: TestClient;
  let anonClient: TestClient;
  let ownerUsername: string;
  let ownerUserId: string;
  let collabUserId: string;
  let projectSlug: string;
  let threadId: string;
  let _messageId: string;
  let replyMessageId: string;

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    ownerClient = new TestClient(baseUrl);
    collabClient = new TestClient(baseUrl);
    anonClient = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any leftover test data
    await db.delete(users).where(eq(users.username, 'commentowner'));
    await db.delete(users).where(eq(users.username, 'commentcollab'));

    const hashedPassword = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);

    // Create owner user
    const [owner] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'commentowner',
        email: 'commentowner@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();
    ownerUserId = owner.id;
    ownerUsername = owner.username ?? 'commentowner';

    // Create collaborator user
    const [collab] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'commentcollab',
        email: 'commentcollab@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();
    collabUserId = collab.id;

    // Login both users
    await ownerClient.login('commentowner', TEST_PASSWORDS.DEFAULT);
    await collabClient.login('commentcollab', TEST_PASSWORDS.DEFAULT);

    // Create a project
    const { json } = await ownerClient.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'comment-test-project',
        title: 'Comment Test Project',
      }),
    });
    const projectData = (await json()) as { slug: string; id: string };
    projectSlug = projectData.slug;

    // Add collaborator: invite then accept
    await ownerClient.request(
      `/api/v1/collaboration/${ownerUsername}/${projectSlug}/collaborators`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'commentcollab', role: 'editor' }),
      }
    );
    await collabClient.request(`/api/v1/collaboration/invitations/${projectData.id}/accept`, {
      method: 'POST',
    });
  });

  afterAll(async () => {
    const db = getDatabase();
    // Clean up in reverse dependency order
    await db.delete(commentReadStatus);
    await db.delete(commentMessages);
    await db.delete(commentThreads);
    await db.delete(projects).where(eq(projects.userId, ownerUserId));
    await db.delete(users).where(eq(users.id, ownerUserId));
    await db.delete(users).where(eq(users.id, collabUserId));
    await stopTestServer();
  });

  const commentsPath = () => `/api/v1/comments/${ownerUsername}/${projectSlug}`;

  // ──────────────── Authentication ────────────────

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      const { response } = await anonClient.request(commentsPath());
      expect(response.status).toBe(401);
    });
  });

  // ──────────────── Create Thread ────────────────

  describe('POST /:username/:slug/threads', () => {
    it('should create a comment thread', async () => {
      threadId = crypto.randomUUID();
      const { response, json } = await ownerClient.request(commentsPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          documentId: `${ownerUsername}:${projectSlug}:chapter-1`,
          text: 'This is a comment on the first chapter.',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await json()) as { id: string; messages: { id: string }[] };
      expect(data.id).toBe(threadId);
      expect(data.messages).toHaveLength(1);
      _messageId = data.messages[0].id;
    });

    it('should reject invalid thread body', async () => {
      const { response } = await ownerClient.request(commentsPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'not-a-uuid', documentId: '', text: '' }),
      });

      // Zod validation should reject
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should allow collaborators to create threads', async () => {
      const collabThreadId = crypto.randomUUID();
      const { response } = await collabClient.request(commentsPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: collabThreadId,
          documentId: `${ownerUsername}:${projectSlug}:chapter-2`,
          text: 'Collaborator comment.',
        }),
      });

      expect(response.status).toBe(201);
    });
  });

  // ──────────────── Get Thread ────────────────

  describe('GET /:username/:slug/threads/:threadId', () => {
    it('should get a thread with messages', async () => {
      const { response, json } = await ownerClient.request(`${commentsPath()}/threads/${threadId}`);

      expect(response.status).toBe(200);
      const data = (await json()) as {
        id: string;
        messages: { text: string }[];
        authorName: string;
      };
      expect(data.id).toBe(threadId);
      expect(data.messages[0].text).toBe('This is a comment on the first chapter.');
      expect(data.authorName).toBeTruthy();
    });

    it('should return 404 for non-existent thread', async () => {
      const fakeId = crypto.randomUUID();
      const { response } = await ownerClient.request(`${commentsPath()}/threads/${fakeId}`);

      expect(response.status).toBe(404);
    });
  });

  // ──────────────── List Threads ────────────────

  describe('GET /:username/:slug/threads', () => {
    it('should list all project thread summaries', async () => {
      const { response, json } = await ownerClient.request(commentsPath());

      expect(response.status).toBe(200);
      const threads = (await json()) as { id: string }[];
      expect(threads.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /:username/:slug/doc/:documentName', () => {
    it('should list threads filtered by document', async () => {
      const { response, json } = await ownerClient.request(`${commentsPath()}/doc/chapter-1`);

      expect(response.status).toBe(200);
      const threads = (await json()) as { id: string }[];
      expect(threads.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────── Add Message (Reply) ────────────────

  describe('POST /:username/:slug/threads/:threadId/messages', () => {
    it('should add a reply to an existing thread', async () => {
      const { response, json } = await ownerClient.request(
        `${commentsPath()}/threads/${threadId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'This is a reply.' }),
        }
      );

      expect(response.status).toBe(201);
      const data = (await json()) as { id: string; text: string };
      expect(data.text).toBe('This is a reply.');
      replyMessageId = data.id;
    });

    it('should return 404 when thread does not exist', async () => {
      const fakeId = crypto.randomUUID();
      const { response } = await ownerClient.request(
        `${commentsPath()}/threads/${fakeId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Orphan reply.' }),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  // ──────────────── Resolve / Unresolve ────────────────

  describe('PATCH /:username/:slug/threads/:threadId/resolve', () => {
    it('should resolve a thread', async () => {
      const { response, json } = await ownerClient.request(
        `${commentsPath()}/threads/${threadId}/resolve`,
        { method: 'PATCH' }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { message: string };
      expect(data.message).toBe('Thread resolved');
    });

    it('should return 404 for non-existent thread', async () => {
      const { response } = await ownerClient.request(
        `${commentsPath()}/threads/${crypto.randomUUID()}/resolve`,
        { method: 'PATCH' }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /:username/:slug/threads/:threadId/unresolve', () => {
    it('should unresolve a thread', async () => {
      const { response, json } = await ownerClient.request(
        `${commentsPath()}/threads/${threadId}/unresolve`,
        { method: 'PATCH' }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { message: string };
      expect(data.message).toBe('Thread unresolved');
    });
  });

  // ──────────────── Unread Counts ────────────────

  describe('GET /:username/:slug/unread', () => {
    it('should return unread counts', async () => {
      const { response, json } = await ownerClient.request(`${commentsPath()}/unread`);

      expect(response.status).toBe(200);
      const data = (await json()) as { documentId: string; count: number }[];
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ──────────────── Mark Seen ────────────────

  describe('POST /:username/:slug/seen', () => {
    it('should mark comments as seen for a document', async () => {
      const { response, json } = await ownerClient.request(`${commentsPath()}/seen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: `${ownerUsername}:${projectSlug}:chapter-1`,
        }),
      });

      expect(response.status).toBe(200);
      const data = (await json()) as { message: string };
      expect(data.message).toBe('Comments marked as seen');
    });
  });

  // ──────────────── Delete Message ────────────────

  describe('DELETE /:username/:slug/threads/:threadId/messages/:messageId', () => {
    it('should delete a reply message', async () => {
      const { response } = await ownerClient.request(
        `${commentsPath()}/threads/${threadId}/messages/${replyMessageId}`,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent message', async () => {
      const { response } = await ownerClient.request(
        `${commentsPath()}/threads/${threadId}/messages/${crypto.randomUUID()}`,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(404);
    });
  });

  // ──────────────── Delete Thread ────────────────

  describe('DELETE /:username/:slug/threads/:threadId', () => {
    it('should delete a thread', async () => {
      const { response } = await ownerClient.request(`${commentsPath()}/threads/${threadId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
    });

    it('should return 404 after deletion', async () => {
      const { response } = await ownerClient.request(`${commentsPath()}/threads/${threadId}`);

      expect(response.status).toBe(404);
    });
  });

  // ──────────────── Access Control ────────────────

  describe('Access control', () => {
    it('should return 404 for non-existent project', async () => {
      const { response } = await ownerClient.request(
        `/api/v1/comments/${ownerUsername}/nonexistent-project`
      );

      expect(response.status).toBe(404);
    });
  });
});
