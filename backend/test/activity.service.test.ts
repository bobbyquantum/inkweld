import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, projects } from '../src/db/schema/index';
import { activityEvents } from '../src/db/schema/activity-events';
import { activityService } from '../src/services/activity.service';
import { projectService } from '../src/services/project.service';
import { startTestServer, stopTestServer } from './server-test-helper';

let db: DatabaseInstance;
const USER_ID = crypto.randomUUID();
const USERNAME = 'actuser';
let PROJECT_A: string;
let PROJECT_B: string;

beforeAll(async () => {
  await startTestServer();
  db = getDatabase();
  await db.delete(users).where(eq(users.username, USERNAME));
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: 'hashed',
    approved: true,
    enabled: true,
  });
  const p1 = await projectService.create(db, {
    slug: 'act-a',
    title: 'Act A',
    userId: USER_ID,
  });
  PROJECT_A = p1.id;
  const p2 = await projectService.create(db, {
    slug: 'act-b',
    title: 'Act B',
    userId: USER_ID,
  });
  PROJECT_B = p2.id;
});

afterAll(async () => {
  await db.delete(activityEvents).where(eq(activityEvents.projectId, PROJECT_A));
  await db.delete(activityEvents).where(eq(activityEvents.projectId, PROJECT_B));
  await db.delete(projects).where(eq(projects.id, PROJECT_A));
  await db.delete(projects).where(eq(projects.id, PROJECT_B));
  await db.delete(users).where(eq(users.id, USER_ID));
  await stopTestServer();
});

beforeEach(async () => {
  await db.delete(activityEvents).where(eq(activityEvents.projectId, PROJECT_A));
  await db.delete(activityEvents).where(eq(activityEvents.projectId, PROJECT_B));
});

describe('ActivityService – record', () => {
  it('persists an event with all fields populated', async () => {
    await activityService.record(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      eventType: 'snapshot_created',
      entityId: 'el-1',
      entityName: 'Chapter 1',
      metadata: { foo: 'bar' },
    });

    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.projectId, PROJECT_A));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('snapshot_created');
    expect(rows[0].entityId).toBe('el-1');
    expect(rows[0].entityName).toBe('Chapter 1');
    expect(rows[0].metadata).toEqual({ foo: 'bar' });
    expect(rows[0].createdAt).toBeGreaterThan(0);
  });

  it('persists an event with optional fields omitted (defaults to null)', async () => {
    await activityService.record(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      eventType: 'document_edit',
    });
    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.projectId, PROJECT_A));
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBeNull();
    expect(rows[0].entityName).toBeNull();
    expect(rows[0].metadata).toBeNull();
  });

  it('does not throw when given an invalid project id (best-effort logging)', async () => {
    // Should swallow the FK violation and not throw.
    await activityService.record(db, {
      projectId: crypto.randomUUID(), // does not exist
      userId: USER_ID,
      eventType: 'document_edit',
    });
    // No assertion — the contract is "must not throw".
  });
});

describe('ActivityService – listForProject', () => {
  async function seed(projectId: string, eventType: string, createdAt: number): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(activityEvents).values({
      id,
      projectId,
      userId: USER_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventType: eventType as any,
      entityId: null,
      entityName: null,
      metadata: null,
      createdAt,
    });
    return id;
  }

  it('returns events newest-first', async () => {
    const now = Date.now();
    await seed(PROJECT_A, 'document_edit', now - 3_000);
    await seed(PROJECT_A, 'snapshot_created', now - 1_000);
    await seed(PROJECT_A, 'comment_thread_created', now - 2_000);

    const events = await activityService.listForProject(db, PROJECT_A);
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe('snapshot_created');
    expect(events[1].eventType).toBe('comment_thread_created');
    expect(events[2].eventType).toBe('document_edit');
  });

  it('respects the limit', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await seed(PROJECT_A, 'document_edit', now - i * 1_000);
    }
    const events = await activityService.listForProject(db, PROJECT_A, 2);
    expect(events).toHaveLength(2);
  });

  it('paginates with the beforeTs cursor', async () => {
    const now = Date.now();
    const tsList = [now, now - 1_000, now - 2_000, now - 3_000, now - 4_000];
    for (const ts of tsList) await seed(PROJECT_A, 'document_edit', ts);

    const page1 = await activityService.listForProject(db, PROJECT_A, 2);
    expect(page1).toHaveLength(2);
    expect(page1[0].createdAt).toBe(now);
    expect(page1[1].createdAt).toBe(now - 1_000);

    const page2 = await activityService.listForProject(
      db,
      PROJECT_A,
      2,
      page1[page1.length - 1].createdAt
    );
    expect(page2).toHaveLength(2);
    expect(page2[0].createdAt).toBe(now - 2_000);
    expect(page2[1].createdAt).toBe(now - 3_000);
  });

  it('does not return events from other projects', async () => {
    const now = Date.now();
    await seed(PROJECT_A, 'document_edit', now);
    await seed(PROJECT_B, 'document_edit', now);

    const events = await activityService.listForProject(db, PROJECT_A);
    expect(events).toHaveLength(1);
    expect(events[0].projectId).toBe(PROJECT_A);
  });

  it('returns [] when project has no events', async () => {
    const events = await activityService.listForProject(db, PROJECT_A);
    expect(events).toEqual([]);
  });
});

describe('ActivityService – listForProjects', () => {
  async function seed(projectId: string, createdAt: number): Promise<void> {
    await db.insert(activityEvents).values({
      id: crypto.randomUUID(),
      projectId,
      userId: USER_ID,
      eventType: 'document_edit',
      entityId: null,
      entityName: null,
      metadata: null,
      createdAt,
    });
  }

  it('returns [] for empty project list', async () => {
    const events = await activityService.listForProjects(db, []);
    expect(events).toEqual([]);
  });

  it('merges events from multiple projects newest-first', async () => {
    const now = Date.now();
    await seed(PROJECT_A, now - 2_000);
    await seed(PROJECT_B, now - 1_000);
    await seed(PROJECT_A, now - 3_000);

    const events = await activityService.listForProjects(db, [PROJECT_A, PROJECT_B]);
    expect(events).toHaveLength(3);
    expect(events[0].projectId).toBe(PROJECT_B);
    expect(events[0].createdAt).toBe(now - 1_000);
    expect(events[2].createdAt).toBe(now - 3_000);
  });

  it('respects the limit and beforeTs cursor across projects', async () => {
    const now = Date.now();
    for (let i = 0; i < 4; i++) await seed(PROJECT_A, now - i * 1_000);
    for (let i = 0; i < 4; i++) await seed(PROJECT_B, now - (i * 1_000 + 500));

    const page1 = await activityService.listForProjects(db, [PROJECT_A, PROJECT_B], 3);
    expect(page1).toHaveLength(3);
    expect(page1[0].createdAt).toBe(now);

    const page2 = await activityService.listForProjects(
      db,
      [PROJECT_A, PROJECT_B],
      3,
      page1[page1.length - 1].createdAt
    );
    expect(page2[0].createdAt).toBeLessThan(page1[page1.length - 1].createdAt);
  });
});

describe('ActivityService – recordOrCoalesceEdit', () => {
  it('inserts a new event when no recent matching event exists', async () => {
    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-coalesce-1',
      entityName: 'Chapter One',
      wordsDelta: 42,
      endWordCount: 142,
      durationMs: 30_000,
    });

    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.projectId, PROJECT_A));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('document_edit');
    expect(rows[0].entityId).toBe('el-coalesce-1');
    expect(rows[0].entityName).toBe('Chapter One');
    expect(rows[0].metadata).toEqual({
      wordsDelta: 42,
      endWordCount: 142,
      durationMs: 30_000,
    });
  });

  it('coalesces a second edit within the window into the existing row', async () => {
    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-coalesce-2',
      entityName: 'Chapter Two',
      wordsDelta: 100,
      endWordCount: 500,
      durationMs: 60_000,
    });
    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-coalesce-2',
      entityName: 'Chapter Two', // same name
      wordsDelta: 25,
      endWordCount: 525,
      durationMs: 15_000,
    });

    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.projectId, PROJECT_A));
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({
      wordsDelta: 125,
      endWordCount: 525,
      durationMs: 75_000,
      coalesced: true,
    });
  });

  it('refreshes entityName on coalesce when the document was renamed', async () => {
    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-rename',
      entityName: 'Old Title',
      wordsDelta: 10,
      endWordCount: 10,
      durationMs: 1_000,
    });
    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-rename',
      entityName: 'New Title',
      wordsDelta: 5,
      endWordCount: 15,
      durationMs: 500,
    });

    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.projectId, PROJECT_A));
    expect(rows).toHaveLength(1);
    expect(rows[0].entityName).toBe('New Title');
  });

  it('inserts a new event when the previous one is outside the window', async () => {
    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-window',
      entityName: 'Old Edit',
      wordsDelta: 30,
      endWordCount: 30,
      durationMs: 5_000,
    });
    // Backdate the existing row so it falls outside a tiny coalesce window.
    await db
      .update(activityEvents)
      .set({ createdAt: Date.now() - 60_000 })
      .where(eq(activityEvents.projectId, PROJECT_A));

    await activityService.recordOrCoalesceEdit(db, {
      projectId: PROJECT_A,
      userId: USER_ID,
      entityId: 'el-window',
      entityName: 'Old Edit',
      wordsDelta: 7,
      endWordCount: 37,
      durationMs: 2_000,
      windowMs: 1_000, // 1 second — older row is stale
    });

    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.projectId, PROJECT_A));
    expect(rows).toHaveLength(2);
  });

  it('does not coalesce edits by different users on the same element', async () => {
    const OTHER_USER_ID = crypto.randomUUID();
    await db.insert(users).values({
      id: OTHER_USER_ID,
      username: 'other-actuser',
      email: 'other-actuser@example.com',
      password: 'hashed',
      approved: true,
      enabled: true,
    });
    try {
      await activityService.recordOrCoalesceEdit(db, {
        projectId: PROJECT_A,
        userId: USER_ID,
        entityId: 'el-multiuser',
        entityName: 'Shared Doc',
        wordsDelta: 10,
        endWordCount: 10,
        durationMs: 1_000,
      });
      await activityService.recordOrCoalesceEdit(db, {
        projectId: PROJECT_A,
        userId: OTHER_USER_ID,
        entityId: 'el-multiuser',
        entityName: 'Shared Doc',
        wordsDelta: 20,
        endWordCount: 30,
        durationMs: 2_000,
      });

      const rows = await db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.projectId, PROJECT_A));
      expect(rows).toHaveLength(2);
    } finally {
      await db.delete(users).where(eq(users.id, OTHER_USER_ID));
    }
  });

  it('does not throw on invalid project id (best-effort)', async () => {
    await activityService.recordOrCoalesceEdit(db, {
      projectId: crypto.randomUUID(),
      userId: USER_ID,
      entityId: 'el-bad',
      entityName: null,
      wordsDelta: 1,
      endWordCount: 1,
      durationMs: 1,
    });
  });
});
