import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { eq } from 'drizzle-orm';

import * as schema from '../db/schema';
import { projects, users } from '../db/schema';
import { config as configTable } from '../db/schema/config';
import { config as envConfig } from '../config/env';
import { quotaService, SOFT_QUOTA_FRACTION } from './quota.service';

/**
 * These exercise the real filesystem + real SQLite so the accounting is
 * end-to-end: files written to a project directory must show up in
 * `computeUsage`, and `reconcile` must persist exactly that number.
 *
 * `getProjectStorageSize` constructs a fresh FileStorageService per call (by
 * design, so it picks up `config.dataPath` at call time), so retargeting
 * `config.dataPath` in `beforeEach` is enough here.
 */

let sqlite: BunDatabase;
let db: BunSQLiteDatabase<typeof schema>;
let tempRoot = '';
const originalDataPath = envConfig.dataPath;

const USERNAME = 'quotauser';
const USER_ID = 'quota-user-id';

async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<void> {
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    name: 'Quota User',
    email: 'quota@example.com',
    enabled: true,
    approved: true,
    ...overrides,
  });
}

async function seedProject(slug: string, title = slug): Promise<string> {
  const id = `proj-${slug}`;
  const now = Date.now();
  await db.insert(projects).values({
    id,
    slug,
    title,
    userId: USER_ID,
    createdDate: now,
    updatedDate: now,
  });
  return id;
}

/** Write `bytes` of data into a project's `.yjs` (document) area. */
async function seedData(username: string, slug: string, bytes: number): Promise<number> {
  const dir = join(tempRoot, username, slug, '.yjs');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'data.level'), Buffer.alloc(bytes));
  return bytes;
}

/** Write `bytes` of a media file into a project directory. */
async function seedMedia(username: string, slug: string, bytes: number): Promise<number> {
  const dir = join(tempRoot, username, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'cover.jpg'), Buffer.alloc(bytes));
  return bytes;
}

beforeAll(() => {
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'inkweld-quota-'));
  (envConfig as unknown as { dataPath: string }).dataPath = tempRoot;
  await db.delete(configTable);
  await db.delete(projects);
  await db.delete(users);
  await seedUser();
});

afterEach(async () => {
  (envConfig as unknown as { dataPath: string }).dataPath = originalDataPath;
  await rm(tempRoot, { recursive: true, force: true });
});

describe('quotaService effective quota', () => {
  it('uses the per-user override when present', async () => {
    await seedUser({ id: 'override-user', username: 'override', syncQuotaBytes: 5_000_000 });
    const user = (await db.select().from(users).where(eq(users.id, 'override-user')))[0];

    expect(await quotaService.getEffectiveQuota(db, user)).toBe(5_000_000);
  });

  it('falls back to the instance default (100 MB) when there is no override', async () => {
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    expect(await quotaService.getEffectiveQuota(db, user)).toBe(104857600);
    expect(await quotaService.getInstanceDefaultQuota(db)).toBe(104857600);
  });

  it('honours an admin-configured instance default', async () => {
    await db
      .insert(configTable)
      .values({ key: 'SYNC_QUOTA_DEFAULT_BYTES', value: '2097152', category: 'general' })
      .onConflictDoUpdate({ target: configTable.key, set: { value: '2097152' } });

    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    expect(await quotaService.getEffectiveQuota(db, user)).toBe(2097152);
  });

  it('treats an explicit zero override as zero, not as unset', async () => {
    await seedUser({ id: 'zero-user', username: 'zerouser', syncQuotaBytes: 0 });
    const user = (await db.select().from(users).where(eq(users.id, 'zero-user')))[0];

    expect(await quotaService.getEffectiveQuota(db, user)).toBe(0);
  });
});

describe('quotaService.computeUsage', () => {
  it("sums data and media bytes across all of a user's projects", async () => {
    await seedProject('one');
    await seedProject('two');
    await seedData(USERNAME, 'one', 1000);
    await seedMedia(USERNAME, 'one', 500);
    await seedData(USERNAME, 'two', 2000);

    const { usedBytes, projects: perProject } = await quotaService.computeUsage(db, {
      id: USER_ID,
      username: USERNAME,
    });

    // one: 1000 data + 500 media; two: 2000 data. Total 3500.
    expect(usedBytes).toBe(3500);
    expect(perProject).toHaveLength(2);
    const one = perProject.find((p) => p.slug === 'one');
    expect(one?.dataBytes).toBe(1000);
    expect(one?.mediaBytes).toBe(500);
    expect(one?.totalBytes).toBe(1500);
  });

  it('returns zero for a user with no projects', async () => {
    const { usedBytes, projects: perProject } = await quotaService.computeUsage(db, {
      id: USER_ID,
      username: USERNAME,
    });

    expect(usedBytes).toBe(0);
    expect(perProject).toEqual([]);
  });

  it("does not count another user's projects", async () => {
    await db.insert(users).values({
      id: 'other-user',
      username: 'otheruser',
      email: 'other@example.com',
      enabled: true,
      approved: true,
    });
    await db.insert(projects).values({
      id: 'other-proj',
      slug: 'other',
      title: 'other',
      userId: 'other-user',
      createdDate: Date.now(),
      updatedDate: Date.now(),
    });
    await seedData('otheruser', 'other', 9999);

    const { usedBytes } = await quotaService.computeUsage(db, { id: USER_ID, username: USERNAME });
    expect(usedBytes).toBe(0);
  });
});

describe('quotaService.getUsage', () => {
  it('reports used/quota, fraction and threshold flags', async () => {
    await seedProject('one');
    await seedData(USERNAME, 'one', 500);
    await db.update(users).set({ syncQuotaBytes: 1000 }).where(eq(users.id, USER_ID));

    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    const { usage } = await quotaService.getUsage(db, user);

    expect(usage.usedBytes).toBe(500);
    expect(usage.quotaBytes).toBe(1000);
    expect(usage.fraction).toBe(0.5);
    expect(usage.overQuota).toBe(false);
    expect(usage.overSoftLimit).toBe(false);
  });

  it('flags the soft limit at 80% but not the hard limit', async () => {
    await seedProject('one');
    await seedData(USERNAME, 'one', 800);
    await db.update(users).set({ syncQuotaBytes: 1000 }).where(eq(users.id, USER_ID));

    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    const { usage } = await quotaService.getUsage(db, user);

    expect(usage.overSoftLimit).toBe(true);
    expect(usage.overQuota).toBe(false);
    expect(SOFT_QUOTA_FRACTION).toBe(0.8);
  });

  it('flags overQuota at exactly the allowance', async () => {
    await seedProject('one');
    await seedData(USERNAME, 'one', 1000);
    await db.update(users).set({ syncQuotaBytes: 1000 }).where(eq(users.id, USER_ID));

    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    const { usage } = await quotaService.getUsage(db, user);

    expect(usage.overQuota).toBe(true);
  });

  it('treats a zero allowance as immediately over quota', async () => {
    await db.update(users).set({ syncQuotaBytes: 0 }).where(eq(users.id, USER_ID));
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    const { usage } = await quotaService.getUsage(db, user);
    expect(usage.overQuota).toBe(true);
    expect(usage.overSoftLimit).toBe(true);
    expect(usage.fraction).toBe(Infinity);
  });
});

describe('quotaService.reconcile', () => {
  it('persists the authoritative usage onto the user row', async () => {
    await seedProject('one');
    await seedData(USERNAME, 'one', 4242);

    const fresh = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(fresh[0].storageUsedBytes).toBe(0);

    const used = await quotaService.reconcile(db, { id: USER_ID, username: USERNAME });
    expect(used).toBe(4242);

    const row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(4242);
  });

  it('corrects a drifted counter', async () => {
    await seedProject('one');
    await seedData(USERNAME, 'one', 100);
    // Simulate drift from a failed upload / direct edit.
    await db.update(users).set({ storageUsedBytes: 999999 }).where(eq(users.id, USER_ID));

    await quotaService.reconcile(db, { id: USER_ID, username: USERNAME });

    const row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(100);
  });
});

describe('quotaService counter adjustments', () => {
  it('adds uploads and subtracts deletions', async () => {
    await quotaService.recordUpload(db, USER_ID, 500);
    let row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(500);

    await quotaService.recordUpload(db, USER_ID, 250);
    row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(750);

    await quotaService.recordDeletion(db, USER_ID, 300);
    row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(450);
  });

  it('clamps at zero so a large deletion cannot go negative', async () => {
    await quotaService.recordUpload(db, USER_ID, 100);
    await quotaService.recordDeletion(db, USER_ID, 500);

    const row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(0);
  });

  it('treats negative upload amounts as positive (sign is normalised)', async () => {
    await quotaService.recordUpload(db, USER_ID, -400);
    const row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(400);
  });

  it('ignores non-finite deltas', async () => {
    await quotaService.adjustUsage(db, USER_ID, Number.NaN);
    await quotaService.adjustUsage(db, USER_ID, Number.POSITIVE_INFINITY);
    const row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(0);
  });

  it('accumulates concurrent increments without losing updates', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => quotaService.recordUpload(db, USER_ID, 100))
    );
    const row = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];
    expect(row.storageUsedBytes).toBe(1000);
  });
});

describe('quotaService.wouldExceedQuota', () => {
  it('is false when the upload fits', async () => {
    await db
      .update(users)
      .set({ syncQuotaBytes: 1000, storageUsedBytes: 500 })
      .where(eq(users.id, USER_ID));
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    expect(await quotaService.wouldExceedQuota(db, user, 400)).toBe(false);
  });

  it('is true when the upload would cross the allowance', async () => {
    await db
      .update(users)
      .set({ syncQuotaBytes: 1000, storageUsedBytes: 800 })
      .where(eq(users.id, USER_ID));
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    expect(await quotaService.wouldExceedQuota(db, user, 300)).toBe(true);
  });

  it('is true for any non-zero upload against a zero allowance', async () => {
    await db.update(users).set({ syncQuotaBytes: 0 }).where(eq(users.id, USER_ID));
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    expect(await quotaService.wouldExceedQuota(db, user, 1)).toBe(true);
  });

  it('does not exceed when the upload exactly fills the allowance', async () => {
    await db
      .update(users)
      .set({ syncQuotaBytes: 1000, storageUsedBytes: 500 })
      .where(eq(users.id, USER_ID));
    const user = (await db.select().from(users).where(eq(users.id, USER_ID)))[0];

    expect(await quotaService.wouldExceedQuota(db, user, 500)).toBe(false);
  });
});

describe('quotaService.toQuotaUsage', () => {
  it('clamps negative inputs', () => {
    const usage = quotaService.toQuotaUsage(-100, -5);
    expect(usage.usedBytes).toBe(0);
    expect(usage.quotaBytes).toBe(0);
    expect(usage.overQuota).toBe(true);
  });
});
