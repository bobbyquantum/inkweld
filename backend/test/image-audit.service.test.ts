/**
 * Image Audit Service Tests
 *
 * Service-level integration tests for imageAuditService covering create,
 * list (filters + pagination), getById and getStats. Mirrors the pattern in
 * activity.service.test.ts: a real in-memory database via startTestServer().
 *
 * Each describe block uses its own dedicated user(s) so seeded rows don't
 * leak across blocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users } from '../src/db/schema/index';
import { imageModelProfiles } from '../src/db/schema/image-model-profiles';
import { imageGenerationAudits } from '../src/db/schema/image-generation-audits';
import { imageAuditService } from '../src/services/image-audit.service';
import { startTestServer, stopTestServer } from './server-test-helper';

let db: DatabaseInstance;

// Dedicated users per block to keep seeded rows isolated.
const USER_ID = crypto.randomUUID();
const LIST_USER_ID = crypto.randomUUID();
const LIST_OTHER_USER_ID = crypto.randomUUID();
const STATS_USER_ID = crypto.randomUUID();
const STATS_OTHER_USER_ID = crypto.randomUUID();

const usernames: Record<string, string> = {
  [USER_ID]: 'imgauduser',
  [LIST_USER_ID]: 'imgaudlist',
  [LIST_OTHER_USER_ID]: 'imgaudlistoth',
  [STATS_USER_ID]: 'imgaudstats',
  [STATS_OTHER_USER_ID]: 'imgaudstatsoth',
};
const allUserIds = Object.keys(usernames);

// Real imageModelProfiles rows so the profileId FK is satisfied.
const PROFILE_A_ID = crypto.randomUUID();
const PROFILE_B_ID = crypto.randomUUID();
const STATS_A_ID = crypto.randomUUID();
const STATS_B_ID = crypto.randomUUID();
const profileIds = [PROFILE_A_ID, PROFILE_B_ID, STATS_A_ID, STATS_B_ID];

const createdAuditIds: string[] = [];

beforeAll(async () => {
  await startTestServer();
  db = getDatabase();

  // Clean up any pre-existing rows with colliding usernames.
  for (const uname of Object.values(usernames)) {
    await db.delete(users).where(eq(users.username, uname));
  }

  for (const id of allUserIds) {
    await db.insert(users).values({
      id,
      username: usernames[id],
      email: `${usernames[id]}@example.com`,
      password: 'hashed',
      approved: true,
      enabled: true,
    });
  }

  const mkProfile = (id: string, name: string) => ({
    id,
    name,
    provider: 'openai',
    modelId: 'dall-e-3',
  });
  await db.insert(imageModelProfiles).values(mkProfile(PROFILE_A_ID, 'ImgAudit Profile A'));
  await db.insert(imageModelProfiles).values(mkProfile(PROFILE_B_ID, 'ImgAudit Profile B'));
  await db.insert(imageModelProfiles).values(mkProfile(STATS_A_ID, 'ImgAudit Stats A'));
  await db.insert(imageModelProfiles).values(mkProfile(STATS_B_ID, 'ImgAudit Stats B'));
});

afterAll(async () => {
  for (const id of createdAuditIds) {
    await db.delete(imageGenerationAudits).where(eq(imageGenerationAudits.id, id));
  }
  for (const id of profileIds) {
    await db.delete(imageModelProfiles).where(eq(imageModelProfiles.id, id));
  }
  for (const id of allUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await stopTestServer();
});

/**
 * Insert an audit row directly with an explicit createdAt so ordering/date
 * filters are deterministic. The schema column is `mode: 'timestamp'` so
 * Drizzle converts the Date to seconds for storage.
 */
async function seed(audit: {
  userId: string;
  profileName: string;
  prompt: string;
  creditCost: number;
  status: 'success' | 'moderated';
  createdAt: Date;
  profileId?: string;
  message?: string;
  referenceImageUrls?: string[];
  outputImageUrls?: string[];
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(imageGenerationAudits).values({
    id,
    userId: audit.userId,
    profileId: audit.profileId ?? null,
    profileName: audit.profileName,
    prompt: audit.prompt,
    referenceImageUrls: audit.referenceImageUrls ?? null,
    outputImageUrls: audit.outputImageUrls ?? null,
    creditCost: audit.creditCost,
    status: audit.status,
    message: audit.message ?? null,
    createdAt: audit.createdAt,
  });
  createdAuditIds.push(id);
  return id;
}

describe('ImageAuditService – create', () => {
  it('persists a record with all fields populated and returns it', async () => {
    const audit = await imageAuditService.create(db, {
      userId: USER_ID,
      profileId: PROFILE_A_ID,
      profileName: 'DALL·E 3',
      prompt: 'a dragon over a castle',
      referenceImageUrls: ['media://ref1'],
      outputImageUrls: ['media://out1', 'media://out2'],
      creditCost: 5,
      status: 'success',
      message: 'ok',
    });
    createdAuditIds.push(audit.id);

    expect(audit.id).toBeTruthy();
    expect(audit.userId).toBe(USER_ID);
    expect(audit.profileName).toBe('DALL·E 3');
    expect(audit.prompt).toBe('a dragon over a castle');
    expect(audit.referenceImageUrls).toEqual(['media://ref1']);
    expect(audit.outputImageUrls).toEqual(['media://out1', 'media://out2']);
    expect(audit.creditCost).toBe(5);
    expect(audit.status).toBe('success');
    expect(audit.message).toBe('ok');
    expect(audit.createdAt).toBeInstanceOf(Date);
  });

  it('defaults optional fields to null when omitted', async () => {
    const audit = await imageAuditService.create(db, {
      userId: USER_ID,
      profileId: PROFILE_A_ID,
      profileName: 'DALL·E 3',
      prompt: 'moderated prompt',
      creditCost: 2,
      status: 'moderated',
    });
    createdAuditIds.push(audit.id);

    expect(audit.referenceImageUrls).toBeNull();
    expect(audit.outputImageUrls).toBeNull();
    expect(audit.message).toBeNull();
  });
});

describe('ImageAuditService – list', () => {
  const baseTime = new Date('2025-01-01T00:00:00Z');

  beforeAll(async () => {
    // Offsets are whole seconds (the column stores second-precision timestamps)
    // spaced 10s apart so date-window boundaries can sit cleanly between rows.
    await seed({
      userId: LIST_USER_ID,
      profileId: PROFILE_A_ID,
      profileName: 'Profile A',
      prompt: 'dragon sketch',
      creditCost: 1,
      status: 'success',
      createdAt: new Date(baseTime.getTime()),
    });
    await seed({
      userId: LIST_USER_ID,
      profileId: PROFILE_A_ID,
      profileName: 'Profile A',
      prompt: 'dragon colour',
      creditCost: 3,
      status: 'success',
      createdAt: new Date(baseTime.getTime() + 10_000),
    });
    await seed({
      userId: LIST_USER_ID,
      profileId: PROFILE_B_ID,
      profileName: 'Profile B',
      prompt: 'castle at dawn',
      creditCost: 10,
      status: 'moderated',
      message: 'blocked',
      createdAt: new Date(baseTime.getTime() + 20_000),
    });
    await seed({
      userId: LIST_OTHER_USER_ID,
      profileId: PROFILE_A_ID,
      profileName: 'Profile A',
      prompt: 'other user dragon',
      creditCost: 7,
      status: 'success',
      createdAt: new Date(baseTime.getTime() + 30_000),
    });
  });

  it('returns results newest-first with the username joined', async () => {
    const result = await imageAuditService.list(db, { userId: LIST_USER_ID });

    expect(result.audits).toHaveLength(3);
    // newest-first: +3_000 before +2_000 before +1_000
    expect(result.audits[0].prompt).toBe('castle at dawn');
    expect(result.audits[1].prompt).toBe('dragon colour');
    expect(result.audits[2].prompt).toBe('dragon sketch');
    expect(result.audits.every((a) => a.username === usernames[LIST_USER_ID])).toBe(true);
  });

  it('paginates and computes total/totalPages via $count (not by loading rows)', async () => {
    const page1 = await imageAuditService.list(db, { userId: LIST_USER_ID, limit: 2, page: 1 });
    expect(page1.audits).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);

    const page2 = await imageAuditService.list(db, { userId: LIST_USER_ID, limit: 2, page: 2 });
    expect(page2.audits).toHaveLength(1);
    expect(page2.total).toBe(3);
    expect(page2.totalPages).toBe(2);
  });

  it('filters by status', async () => {
    const moderated = await imageAuditService.list(db, {
      userId: LIST_USER_ID,
      status: 'moderated',
    });
    expect(moderated.audits).toHaveLength(1);
    expect(moderated.audits[0].prompt).toBe('castle at dawn');
    expect(moderated.total).toBe(1);

    const success = await imageAuditService.list(db, { userId: LIST_USER_ID, status: 'success' });
    expect(success.audits).toHaveLength(2);
    expect(success.total).toBe(2);
  });

  it('filters by profileId', async () => {
    const result = await imageAuditService.list(db, {
      userId: LIST_USER_ID,
      profileId: PROFILE_B_ID,
    });
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0].prompt).toBe('castle at dawn');
    expect(result.total).toBe(1);
  });

  it('filters by search term in prompt (case-insensitive)', async () => {
    const result = await imageAuditService.list(db, { userId: LIST_USER_ID, search: 'DRAGON' });
    expect(result.audits).toHaveLength(2);
    expect(result.audits.every((a) => a.prompt.includes('dragon'))).toBe(true);
    expect(result.total).toBe(2);
  });

  it('filters by date range', async () => {
    // Window +5s..+25s includes the +10s and +20s rows (excludes +0s).
    const start = new Date(baseTime.getTime() + 5_000);
    const end = new Date(baseTime.getTime() + 25_000);
    const result = await imageAuditService.list(db, {
      userId: LIST_USER_ID,
      startDate: start,
      endDate: end,
    });
    expect(result.audits).toHaveLength(2);
    expect(result.audits.map((a) => a.prompt).sort()).toEqual(['castle at dawn', 'dragon colour']);
    expect(result.total).toBe(2);
  });

  it('clamps the limit to 100', async () => {
    const result = await imageAuditService.list(db, { userId: LIST_USER_ID, limit: 9999 });
    expect(result.limit).toBe(100);
  });

  it('returns an empty page with totalPages 0 when nothing matches', async () => {
    const result = await imageAuditService.list(db, { userId: crypto.randomUUID() });
    expect(result.audits).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});

describe('ImageAuditService – getById', () => {
  it('returns a record with the username joined', async () => {
    const id = await seed({
      userId: USER_ID,
      profileId: PROFILE_A_ID,
      profileName: 'Profile A',
      prompt: 'single fetch',
      creditCost: 4,
      status: 'success',
      createdAt: new Date(),
    });

    const audit = await imageAuditService.getById(db, id);
    expect(audit).not.toBeNull();
    expect(audit!.id).toBe(id);
    expect(audit!.username).toBe(usernames[USER_ID]);
    expect(audit!.prompt).toBe('single fetch');
  });

  it('returns null when the audit does not exist', async () => {
    const audit = await imageAuditService.getById(db, crypto.randomUUID());
    expect(audit).toBeNull();
  });
});

describe('ImageAuditService – getStats', () => {
  const statsBase = new Date('2025-02-01T00:00:00Z');

  beforeAll(async () => {
    await seed({
      userId: STATS_USER_ID,
      profileId: STATS_A_ID,
      profileName: 'Stats Profile A',
      prompt: 'p1',
      creditCost: 5,
      status: 'success',
      createdAt: new Date(statsBase.getTime()),
    });
    await seed({
      userId: STATS_USER_ID,
      profileId: STATS_A_ID,
      profileName: 'Stats Profile A',
      prompt: 'p2',
      creditCost: 5,
      status: 'success',
      createdAt: new Date(statsBase.getTime() + 10_000),
    });
    await seed({
      userId: STATS_OTHER_USER_ID,
      profileId: STATS_B_ID,
      profileName: 'Stats Profile B',
      prompt: 'p3',
      creditCost: 20,
      status: 'moderated',
      createdAt: new Date(statsBase.getTime() + 20_000),
    });
  });

  // Window that contains exactly the three stats rows seeded above (+0s..+20s).
  const windowStart = new Date(statsBase.getTime());
  const windowEnd = new Date(statsBase.getTime() + 60_000);

  it('aggregates totals, success/moderated counts and credits', async () => {
    const stats = await imageAuditService.getStats(db, {
      startDate: windowStart,
      endDate: windowEnd,
    });

    expect(stats.totalRequests).toBe(3);
    expect(stats.totalCredits).toBe(30);
    expect(stats.successCount).toBe(2);
    expect(stats.moderatedCount).toBe(1);
  });

  it('aggregates byProfile sorted by credits descending', async () => {
    const stats = await imageAuditService.getStats(db, {
      startDate: windowStart,
      endDate: windowEnd,
    });

    const profileNames = stats.byProfile.map((p) => p.profileName);
    expect(profileNames).toContain('Stats Profile A');
    expect(profileNames).toContain('Stats Profile B');

    // Profile B has 20 credits, Profile A has 10 -> B first.
    expect(stats.byProfile[0].profileName).toBe('Stats Profile B');
    expect(stats.byProfile[0].count).toBe(1);
    expect(stats.byProfile[0].credits).toBe(20);
    expect(stats.byProfile[1].profileName).toBe('Stats Profile A');
    expect(stats.byProfile[1].count).toBe(2);
    expect(stats.byProfile[1].credits).toBe(10);
  });

  it('aggregates byUser sorted by credits descending', async () => {
    const stats = await imageAuditService.getStats(db, {
      startDate: windowStart,
      endDate: windowEnd,
    });

    // Other user has 20 credits, primary user has 10 -> other first.
    expect(stats.byUser[0].userId).toBe(STATS_OTHER_USER_ID);
    expect(stats.byUser[0].username).toBe(usernames[STATS_OTHER_USER_ID]);
    expect(stats.byUser[0].credits).toBe(20);
    expect(stats.byUser[1].userId).toBe(STATS_USER_ID);
    expect(stats.byUser[1].username).toBe(usernames[STATS_USER_ID]);
    expect(stats.byUser[1].credits).toBe(10);
  });

  it('respects the date filter (excludes rows outside the window)', async () => {
    // Window +5s..+15s only includes the +10s row.
    const stats = await imageAuditService.getStats(db, {
      startDate: new Date(statsBase.getTime() + 5_000),
      endDate: new Date(statsBase.getTime() + 15_000),
    });
    expect(stats.totalRequests).toBe(1);
    expect(stats.totalCredits).toBe(5);
    expect(stats.successCount).toBe(1);
  });
});
