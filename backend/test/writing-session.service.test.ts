import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, projects } from '../src/db/schema/index';
import { writingSessions } from '../src/db/schema/writing-sessions';
import { writingSessionService } from '../src/services/writing-session.service';
import { projectService } from '../src/services/project.service';
import { startTestServer, stopTestServer } from './server-test-helper';

let db: DatabaseInstance;
const USER_ID = crypto.randomUUID();
const OTHER_USER_ID = crypto.randomUUID();
const USERNAME = 'wsuser';
const OTHER_USERNAME = 'wsother';
let PROJECT_ID: string;
let OTHER_PROJECT_ID: string;
const ELEMENT_ID = 'wsuser:proj:doc1/';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await startTestServer();
  db = getDatabase();

  await db.delete(users).where(eq(users.username, USERNAME));
  await db.delete(users).where(eq(users.username, OTHER_USERNAME));

  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: 'hashed',
    approved: true,
    enabled: true,
  });
  await db.insert(users).values({
    id: OTHER_USER_ID,
    username: OTHER_USERNAME,
    email: `${OTHER_USERNAME}@example.com`,
    password: 'hashed',
    approved: true,
    enabled: true,
  });

  const p1 = await projectService.create(db, {
    slug: 'ws-proj',
    title: 'WS Proj',
    userId: USER_ID,
  });
  PROJECT_ID = p1.id;
  const p2 = await projectService.create(db, {
    slug: 'ws-proj-2',
    title: 'WS Proj 2',
    userId: USER_ID,
  });
  OTHER_PROJECT_ID = p2.id;
});

afterAll(async () => {
  await db.delete(writingSessions).where(eq(writingSessions.projectId, PROJECT_ID));
  await db.delete(writingSessions).where(eq(writingSessions.projectId, OTHER_PROJECT_ID));
  await db.delete(projects).where(eq(projects.id, PROJECT_ID));
  await db.delete(projects).where(eq(projects.id, OTHER_PROJECT_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.delete(users).where(eq(users.id, OTHER_USER_ID));
  await stopTestServer();
});

beforeEach(async () => {
  await db.delete(writingSessions).where(eq(writingSessions.projectId, PROJECT_ID));
  await db.delete(writingSessions).where(eq(writingSessions.projectId, OTHER_PROJECT_ID));
});

describe('WritingSessionService – start', () => {
  it('inserts a row with null sessionEnd/endWordCount/wordsDelta', async () => {
    const id = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 100,
    });

    const [row] = await db.select().from(writingSessions).where(eq(writingSessions.id, id));

    expect(row).toBeDefined();
    expect(row.projectId).toBe(PROJECT_ID);
    expect(row.userId).toBe(USER_ID);
    expect(row.elementId).toBe(ELEMENT_ID);
    expect(row.startWordCount).toBe(100);
    expect(row.sessionEnd).toBeNull();
    expect(row.endWordCount).toBeNull();
    expect(row.wordsDelta).toBeNull();
    expect(row.sessionStart).toBeGreaterThan(0);
  });

  it('returns a unique id for each start call', async () => {
    const id1 = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 0,
    });
    const id2 = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 0,
    });
    expect(id1).not.toBe(id2);
  });
});

describe('WritingSessionService – finalize', () => {
  it('records positive wordsDelta and durationMs', async () => {
    const id = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 50,
    });
    // small delay so durationMs > 0
    await new Promise((r) => setTimeout(r, 10));
    const result = await writingSessionService.finalize(db, id, 75);

    expect(result).not.toBeNull();
    expect(result!.wordsDelta).toBe(25);
    expect(result!.durationMs).toBeGreaterThan(0);

    const [row] = await db.select().from(writingSessions).where(eq(writingSessions.id, id));
    expect(row.sessionEnd).not.toBeNull();
    expect(row.endWordCount).toBe(75);
    expect(row.wordsDelta).toBe(25);
  });

  it('records negative wordsDelta when content shrinks', async () => {
    const id = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 100,
    });
    const result = await writingSessionService.finalize(db, id, 60);
    expect(result!.wordsDelta).toBe(-40);
  });

  it('returns null when the session id does not exist', async () => {
    const result = await writingSessionService.finalize(db, crypto.randomUUID(), 10);
    expect(result).toBeNull();
  });

  it('returns null and does not double-finalize an already-closed session', async () => {
    const id = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 0,
    });
    const first = await writingSessionService.finalize(db, id, 10);
    expect(first).not.toBeNull();
    const second = await writingSessionService.finalize(db, id, 999);
    expect(second).toBeNull();

    const [row] = await db.select().from(writingSessions).where(eq(writingSessions.id, id));
    expect(row.endWordCount).toBe(10); // unchanged
  });
});

describe('WritingSessionService – closeStaleSessions', () => {
  it('zeros out sessions older than the cutoff and leaves recent ones alone', async () => {
    const now = Date.now();
    // Stale (started 2 days ago)
    const staleId = crypto.randomUUID();
    await db.insert(writingSessions).values({
      id: staleId,
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      sessionStart: now - 2 * DAY_MS,
      sessionEnd: null,
      startWordCount: 200,
      endWordCount: null,
      wordsDelta: null,
    });
    // Recent open session
    const recentId = await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 5,
    });

    const closed = await writingSessionService.closeStaleSessions(db);
    expect(closed).toBe(1);

    const [staleRow] = await db
      .select()
      .from(writingSessions)
      .where(eq(writingSessions.id, staleId));
    expect(staleRow.sessionEnd).toBe(staleRow.sessionStart);
    expect(staleRow.endWordCount).toBe(200);
    expect(staleRow.wordsDelta).toBe(0);

    const [recentRow] = await db
      .select()
      .from(writingSessions)
      .where(eq(writingSessions.id, recentId));
    expect(recentRow.sessionEnd).toBeNull();
  });

  it('returns 0 when no stale sessions exist', async () => {
    await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 0,
    });
    const closed = await writingSessionService.closeStaleSessions(db);
    expect(closed).toBe(0);
  });
});

describe('WritingSessionService – aggregations', () => {
  async function seedClosed(
    projectId: string,
    userId: string,
    delta: number,
    sessionEnd: number
  ): Promise<void> {
    await db.insert(writingSessions).values({
      id: crypto.randomUUID(),
      projectId,
      elementId: ELEMENT_ID,
      userId,
      sessionStart: sessionEnd - 1000,
      sessionEnd,
      startWordCount: 0,
      endWordCount: delta,
      wordsDelta: delta,
    });
  }

  it('dailyWordsForProject buckets only positive deltas by UTC day', async () => {
    const now = Date.now();
    await seedClosed(PROJECT_ID, USER_ID, 10, now);
    await seedClosed(PROJECT_ID, USER_ID, 5, now);
    await seedClosed(PROJECT_ID, USER_ID, -3, now); // negative excluded
    // Skip-open: an open session must not be counted
    await writingSessionService.start(db, {
      projectId: PROJECT_ID,
      elementId: ELEMENT_ID,
      userId: USER_ID,
      startWordCount: 0,
    });

    const days = await writingSessionService.dailyWordsForProject(db, PROJECT_ID, now - DAY_MS);
    expect(days).toHaveLength(1);
    expect(days[0].words).toBe(15);
    expect(days[0].day).toBe(new Date(now).toISOString().slice(0, 10));
  });

  it('dailyWordsForProject excludes sessions older than sinceMs', async () => {
    const now = Date.now();
    await seedClosed(PROJECT_ID, USER_ID, 100, now - 10 * DAY_MS);
    await seedClosed(PROJECT_ID, USER_ID, 7, now);

    const days = await writingSessionService.dailyWordsForProject(db, PROJECT_ID, now - DAY_MS);
    const total = days.reduce((acc, d) => acc + d.words, 0);
    expect(total).toBe(7);
  });

  it('dailyWordsForProjects returns [] for an empty project list', async () => {
    const days = await writingSessionService.dailyWordsForProjects(db, [], 0);
    expect(days).toEqual([]);
  });

  it('dailyWordsForProjects sums across projects', async () => {
    const now = Date.now();
    await seedClosed(PROJECT_ID, USER_ID, 4, now);
    await seedClosed(OTHER_PROJECT_ID, USER_ID, 6, now);

    const days = await writingSessionService.dailyWordsForProjects(
      db,
      [PROJECT_ID, OTHER_PROJECT_ID],
      now - DAY_MS
    );
    const total = days.reduce((acc, d) => acc + d.words, 0);
    expect(total).toBe(10);
  });

  it('contributorTotalsForProject groups positive deltas by user', async () => {
    const now = Date.now();
    await seedClosed(PROJECT_ID, USER_ID, 30, now);
    await seedClosed(PROJECT_ID, USER_ID, 5, now);
    await seedClosed(PROJECT_ID, OTHER_USER_ID, 12, now);
    await seedClosed(PROJECT_ID, OTHER_USER_ID, -8, now); // excluded

    const totals = await writingSessionService.contributorTotalsForProject(
      db,
      PROJECT_ID,
      now - DAY_MS
    );
    const byUser = new Map(totals.map((t) => [t.userId, t.words]));
    expect(byUser.get(USER_ID)).toBe(35);
    expect(byUser.get(OTHER_USER_ID)).toBe(12);
  });

  it('totalWordsForProject sums daily totals', async () => {
    const now = Date.now();
    await seedClosed(PROJECT_ID, USER_ID, 11, now);
    await seedClosed(PROJECT_ID, USER_ID, 22, now);

    const total = await writingSessionService.totalWordsForProject(db, PROJECT_ID, now - DAY_MS);
    expect(total).toBe(33);
  });

  it('lastActivityByProject returns the latest end (or start) per project', async () => {
    const now = Date.now();
    await seedClosed(PROJECT_ID, USER_ID, 1, now - 5_000);
    await seedClosed(PROJECT_ID, USER_ID, 1, now - 1_000);
    await seedClosed(OTHER_PROJECT_ID, USER_ID, 1, now - 3_000);

    const map = await writingSessionService.lastActivityByProject(db, [
      PROJECT_ID,
      OTHER_PROJECT_ID,
    ]);
    expect(map.get(PROJECT_ID)).toBe(now - 1_000);
    expect(map.get(OTHER_PROJECT_ID)).toBe(now - 3_000);
  });

  it('lastActivityByProject returns empty Map for empty input', async () => {
    const map = await writingSessionService.lastActivityByProject(db, []);
    expect(map.size).toBe(0);
  });

  it('recentSessionsForProject returns sessions newest-first capped by limit', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await db.insert(writingSessions).values({
        id: crypto.randomUUID(),
        projectId: PROJECT_ID,
        elementId: ELEMENT_ID,
        userId: USER_ID,
        sessionStart: now - i * 1_000,
        sessionEnd: now - i * 1_000 + 100,
        startWordCount: 0,
        endWordCount: i,
        wordsDelta: i,
      });
    }
    const recent = await writingSessionService.recentSessionsForProject(db, PROJECT_ID, 3);
    expect(recent).toHaveLength(3);
    // Newest first
    expect(recent[0].sessionStart).toBeGreaterThan(recent[1].sessionStart);
    expect(recent[1].sessionStart).toBeGreaterThan(recent[2].sessionStart);
  });
});
