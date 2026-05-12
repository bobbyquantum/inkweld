import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { activityEvents } from '../src/db/schema/activity-events';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

interface ActivityEventDto {
  id: string;
  eventType: string;
  createdAt: number;
  username: string | null;
  projectId: string;
  projectSlug?: string | null;
  projectTitle?: string | null;
}
interface ActivityResponse {
  events: ActivityEventDto[];
  nextBefore: number | null;
}

describe('Activity Routes', () => {
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
    await db.delete(users).where(eq(users.username, 'actrowner'));
    await db.delete(users).where(eq(users.username, 'actrcollab'));
    await db.delete(users).where(eq(users.username, 'actroutsider'));

    const hashed = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);

    const [owner] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'actrowner',
        email: 'actrowner@example.com',
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    ownerUserId = owner.id;
    ownerUsername = owner.username ?? 'actrowner';

    const [collab] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'actrcollab',
        email: 'actrcollab@example.com',
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
        username: 'actroutsider',
        email: 'actroutsider@example.com',
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    outsiderUserId = outsider.id;

    await ownerClient.login('actrowner', TEST_PASSWORDS.DEFAULT);
    await collabClient.login('actrcollab', TEST_PASSWORDS.DEFAULT);
    await outsiderClient.login('actroutsider', TEST_PASSWORDS.DEFAULT);

    const { json } = await ownerClient.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'act-routes-proj', title: 'Activity Routes' }),
    });
    const projectData = (await json()) as { id: string; slug: string };
    projectId = projectData.id;
    projectSlug = projectData.slug;

    await ownerClient.request(
      `/api/v1/collaboration/${ownerUsername}/${projectSlug}/collaborators`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'actrcollab', role: 'viewer' }),
      }
    );
    await collabClient.request(`/api/v1/collaboration/invitations/${projectId}/accept`, {
      method: 'POST',
    });
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(activityEvents).where(eq(activityEvents.projectId, projectId));
    await db.delete(projects).where(eq(projects.userId, ownerUserId));
    await db.delete(users).where(eq(users.id, ownerUserId));
    await db.delete(users).where(eq(users.id, collabUserId));
    await db.delete(users).where(eq(users.id, outsiderUserId));
    await stopTestServer();
  });

  beforeEach(async () => {
    const db = getDatabase();
    await db.delete(activityEvents).where(eq(activityEvents.projectId, projectId));
  });

  async function seedEvent(
    eventType: string,
    createdAt: number,
    userId = ownerUserId
  ): Promise<void> {
    const db = getDatabase();
    await db.insert(activityEvents).values({
      id: crypto.randomUUID(),
      projectId,
      userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventType: eventType as any,
      entityId: null,
      entityName: null,
      metadata: null,
      createdAt,
    });
  }

  // ──────────────── Auth ────────────────

  describe('Authentication', () => {
    it('rejects anonymous /me', async () => {
      const { response } = await anonClient.request('/api/v1/activity/me');
      expect(response.status).toBe(401);
    });

    it('rejects anonymous project endpoint', async () => {
      const { response } = await anonClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(401);
    });
  });

  // ──────────────── Per-project ────────────────

  describe('GET /api/v1/activity/projects/:username/:slug', () => {
    it('returns events newest-first with username enrichment', async () => {
      const now = Date.now();
      await seedEvent('document_edit', now - 2_000);
      await seedEvent('snapshot_created', now - 1_000);

      const { response, json } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(200);
      const data = (await json()) as ActivityResponse;
      expect(data.events).toHaveLength(2);
      expect(data.events[0].eventType).toBe('snapshot_created');
      expect(data.events[1].eventType).toBe('document_edit');
      expect(data.events[0].username).toBe(ownerUsername);
      expect(data.nextBefore).toBeNull();
    });

    it('allows a read-only collaborator', async () => {
      await seedEvent('document_edit', Date.now());
      const { response } = await collabClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(200);
    });

    it('forbids an outsider', async () => {
      const { response } = await outsiderClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}`
      );
      expect(response.status).toBe(403);
    });

    it('returns 404 for unknown project', async () => {
      const { response } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/missing-slug`
      );
      expect(response.status).toBe(404);
    });

    it('clamps the limit and uses default 50', async () => {
      const now = Date.now();
      for (let i = 0; i < 6; i++) await seedEvent('document_edit', now - i * 1_000);

      const { json: jsonDefault } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}`
      );
      const dataDefault = (await jsonDefault()) as ActivityResponse;
      expect(dataDefault.events).toHaveLength(6);
      expect(dataDefault.nextBefore).toBeNull();

      const { json: jsonHigh } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}?limit=999`
      );
      const dataHigh = (await jsonHigh()) as ActivityResponse;
      // limit is capped at 100, but only 6 exist
      expect(dataHigh.events).toHaveLength(6);

      const { json: jsonZero } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}?limit=0`
      );
      const dataZero = (await jsonZero()) as ActivityResponse;
      expect(dataZero.events).toHaveLength(6); // falls back to default 50
    });

    it('paginates with the before cursor and emits nextBefore when full', async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) await seedEvent('document_edit', now - i * 1_000);

      const { json: page1Json } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}?limit=2`
      );
      const page1 = (await page1Json()) as ActivityResponse;
      expect(page1.events).toHaveLength(2);
      expect(page1.nextBefore).not.toBeNull();
      expect(page1.events[0].createdAt).toBe(now);

      const { json: page2Json } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}?limit=2&before=${page1.nextBefore}`
      );
      const page2 = (await page2Json()) as ActivityResponse;
      expect(page2.events).toHaveLength(2);
      expect(page2.events[0].createdAt).toBe(now - 2_000);
    });

    it('returns empty events list for a project with no activity', async () => {
      const { json } = await ownerClient.request(
        `/api/v1/activity/projects/${ownerUsername}/${projectSlug}`
      );
      const data = (await json()) as ActivityResponse;
      expect(data.events).toEqual([]);
      expect(data.nextBefore).toBeNull();
    });
  });

  // ──────────────── Cross-project /me ────────────────

  describe('GET /api/v1/activity/me', () => {
    it('returns events from owned projects with project metadata', async () => {
      await seedEvent('document_edit', Date.now());
      const { response, json } = await ownerClient.request('/api/v1/activity/me');
      expect(response.status).toBe(200);
      const data = (await json()) as ActivityResponse;
      expect(data.events.length).toBeGreaterThan(0);
      const evt = data.events[0];
      expect(evt.projectId).toBe(projectId);
      expect(evt.projectSlug).toBe(projectSlug);
      expect(evt.projectTitle).toBe('Activity Routes');
      expect(evt.username).toBe(ownerUsername);
    });

    it('includes events from collaborated projects', async () => {
      await seedEvent('snapshot_created', Date.now());
      const { json } = await collabClient.request('/api/v1/activity/me');
      const data = (await json()) as ActivityResponse;
      const found = data.events.find((e) => e.projectId === projectId);
      expect(found).toBeDefined();
      expect(found?.eventType).toBe('snapshot_created');
    });

    it('returns empty list for a user with no projects', async () => {
      const { json } = await outsiderClient.request('/api/v1/activity/me');
      const data = (await json()) as ActivityResponse;
      expect(data.events).toEqual([]);
      expect(data.nextBefore).toBeNull();
    });

    it('paginates with limit + before', async () => {
      const now = Date.now();
      for (let i = 0; i < 4; i++) await seedEvent('document_edit', now - i * 1_000);

      const { json: page1Json } = await ownerClient.request('/api/v1/activity/me?limit=2');
      const page1 = (await page1Json()) as ActivityResponse;
      expect(page1.events).toHaveLength(2);
      expect(page1.nextBefore).not.toBeNull();

      const { json: page2Json } = await ownerClient.request(
        `/api/v1/activity/me?limit=2&before=${page1.nextBefore}`
      );
      const page2 = (await page2Json()) as ActivityResponse;
      expect(page2.events.length).toBeGreaterThan(0);
      expect(page2.events[0].createdAt).toBeLessThan(page1.nextBefore!);
    });
  });
});
