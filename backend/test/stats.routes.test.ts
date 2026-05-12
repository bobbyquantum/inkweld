import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { writingSessions } from '../src/db/schema/writing-sessions';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

describe('Stats Routes', () => {
  let ownerClient: TestClient;
  let collabClient: TestClient;
  let outsiderClient: TestClient;
  let anonClient: TestClient;
  let ownerUsername: string;
  let ownerUserId: string;
  let collabUserId: string;
  let outsiderUserId: string;
  let projectId: string;
  let projectSlug: string;

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    await enablePasswordLoginForTests();
    ownerClient = new TestClient(baseUrl);
    collabClient = new TestClient(baseUrl);
    outsiderClient = new TestClient(baseUrl);
    anonClient = new TestClient(baseUrl);

    const db = getDatabase();
    await db.delete(users).where(eq(users.username, 'statsowner'));
    await db.delete(users).where(eq(users.username, 'statscollab'));
    await db.delete(users).where(eq(users.username, 'statsoutsider'));

    const hashed = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);

    const [owner] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'statsowner',
        email: 'statsowner@example.com',
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    ownerUserId = owner.id;
    ownerUsername = owner.username ?? 'statsowner';

    const [collab] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'statscollab',
        email: 'statscollab@example.com',
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    collabUserId = collab.id;

    const [outsider] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'statsoutsider',
        email: 'statsoutsider@example.com',
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    outsiderUserId = outsider.id;

    await ownerClient.login('statsowner', TEST_PASSWORDS.DEFAULT);
    await collabClient.login('statscollab', TEST_PASSWORDS.DEFAULT);
    await outsiderClient.login('statsoutsider', TEST_PASSWORDS.DEFAULT);

    const { json } = await ownerClient.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'stats-proj', title: 'Stats Proj' }),
    });
    const projectData = (await json()) as { id: string; slug: string };
    projectId = projectData.id;
    projectSlug = projectData.slug;

    // Add collaborator: invite + accept
    await ownerClient.request(
      `/api/v1/collaboration/${ownerUsername}/${projectSlug}/collaborators`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'statscollab', role: 'viewer' }),
      }
    );
    await collabClient.request(`/api/v1/collaboration/invitations/${projectId}/accept`, {
      method: 'POST',
    });
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(writingSessions).where(eq(writingSessions.projectId, projectId));
    await db.delete(projects).where(eq(projects.userId, ownerUserId));
    await db.delete(users).where(eq(users.id, ownerUserId));
    await db.delete(users).where(eq(users.id, collabUserId));
    await db.delete(users).where(eq(users.id, outsiderUserId));
    await stopTestServer();
  });

  beforeEach(async () => {
    const db = getDatabase();
    await db.delete(writingSessions).where(eq(writingSessions.projectId, projectId));
  });

  async function seedSession(
    userId: string,
    delta: number,
    sessionEnd = Date.now()
  ): Promise<void> {
    const db = getDatabase();
    await db.insert(writingSessions).values({
      id: crypto.randomUUID(),
      projectId,
      elementId: 'el-1',
      userId,
      sessionStart: sessionEnd - 1_000,
      sessionEnd,
      startWordCount: 0,
      endWordCount: delta,
      wordsDelta: delta,
    });
  }

  // ──────────────── Auth ────────────────

  describe('Authentication', () => {
    it('rejects anonymous requests to /me', async () => {
      const { response } = await anonClient.request('/api/v1/stats/me');
      expect(response.status).toBe(401);
    });

    it('rejects anonymous requests to /projects/:user/:slug', async () => {
      const { response } = await anonClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(401);
    });
  });

  // ──────────────── Per-project ────────────────

  describe('GET /api/v1/stats/projects/:username/:slug', () => {
    it('returns aggregated stats for the project owner', async () => {
      await seedSession(ownerUserId, 12);
      await seedSession(ownerUserId, 8);

      const { response, json } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(200);
      const data = (await json()) as {
        projectId: string;
        windowDays: number;
        totalWords: number;
        daily: Array<{ day: string; words: number }>;
        contributors: Array<{ userId: string; username: string | null; words: number }>;
      };
      expect(data.projectId).toBe(projectId);
      expect(data.windowDays).toBe(30);
      expect(data.totalWords).toBe(20);
      expect(data.daily.length).toBeGreaterThan(0);
      const owner = data.contributors.find((c) => c.userId === ownerUserId);
      expect(owner?.words).toBe(20);
      expect(owner?.username).toBe(ownerUsername);
    });

    it('allows a collaborator with read access', async () => {
      const { response } = await collabClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(200);
    });

    it('forbids an outsider', async () => {
      const { response } = await outsiderClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown project', async () => {
      const { response } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/no-such-project`
      );
      expect(response.status).toBe(404);
    });

    it('clamps ?days= to a sane range', async () => {
      const { json: jsonHigh } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}?days=99999`
      );
      const dataHigh = (await jsonHigh()) as { windowDays: number };
      expect(dataHigh.windowDays).toBe(365);

      const { json: jsonZero } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}?days=0`
      );
      const dataZero = (await jsonZero()) as { windowDays: number };
      expect(dataZero.windowDays).toBe(30);

      const { json: jsonNeg } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}?days=-5`
      );
      const dataNeg = (await jsonNeg()) as { windowDays: number };
      expect(dataNeg.windowDays).toBe(30);

      const { json: jsonValid } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}?days=7`
      );
      const dataValid = (await jsonValid()) as { windowDays: number };
      expect(dataValid.windowDays).toBe(7);
    });

    it('returns zero totals for a project with no sessions', async () => {
      const { json } = await ownerClient.request(
        `/api/v1/stats/projects/${ownerUsername}/${projectSlug}`
      );
      const data = (await json()) as {
        totalWords: number;
        daily: unknown[];
        contributors: unknown[];
      };
      expect(data.totalWords).toBe(0);
      expect(data.daily).toEqual([]);
      expect(data.contributors).toEqual([]);
    });
  });

  // ──────────────── Cross-project /me ────────────────

  describe('GET /api/v1/stats/me', () => {
    it('returns cross-project totals for the authenticated user', async () => {
      await seedSession(ownerUserId, 15);

      const { response, json } = await ownerClient.request('/api/v1/stats/me');
      expect(response.status).toBe(200);
      const data = (await json()) as {
        windowDays: number;
        projectCount: number;
        totalWords: number;
        daily: Array<{ day: string; words: number }>;
      };
      expect(data.windowDays).toBe(30);
      expect(data.projectCount).toBeGreaterThanOrEqual(1);
      expect(data.totalWords).toBeGreaterThanOrEqual(15);
    });

    it('clamps the days param', async () => {
      const { json } = await ownerClient.request('/api/v1/stats/me?days=10000');
      const data = (await json()) as { windowDays: number };
      expect(data.windowDays).toBe(365);
    });

    it('returns zero totals for a user with no projects', async () => {
      const { json } = await outsiderClient.request('/api/v1/stats/me');
      const data = (await json()) as { projectCount: number; totalWords: number };
      expect(data.projectCount).toBe(0);
      expect(data.totalWords).toBe(0);
    });

    it('includes activity from collaborated projects', async () => {
      await seedSession(ownerUserId, 9);
      const { json } = await collabClient.request('/api/v1/stats/me');
      const data = (await json()) as { projectCount: number; totalWords: number };
      expect(data.projectCount).toBeGreaterThanOrEqual(1);
      expect(data.totalWords).toBeGreaterThanOrEqual(9);
    });
  });
});
