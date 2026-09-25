import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Guard rails for the migration that adds users.syncQuotaBytes /
 * storageUsedBytes (0037). A migration test on a *fresh* schema only proves the
 * CREATE path; the upgrade path (an existing populated database) is the one
 * that runs in production, so this builds a database at the pre-0037 schema,
 * inserts a user, then applies 0037 on top.
 */

const SOURCE_MIGRATIONS = join(__dirname, '../drizzle');

let workDir = '';

/**
 * Copy the migrations folder, optionally stopping the journal before 0037.
 * Everything from 0037 on is left out, not just 0037: drizzle skips a
 * migration older than the newest one already applied, so staging a later
 * migration first would silently drop 0037 from the upgrade.
 */
async function stageMigrations(dest: string, include0037: boolean): Promise<void> {
  await mkdir(join(dest, 'meta'), { recursive: true });
  const journal = JSON.parse(await readFile(join(SOURCE_MIGRATIONS, 'meta/_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e: { tag: string }) => include0037 || e.tag < '0037');
  await writeFile(join(dest, 'meta/_journal.json'), JSON.stringify(journal, null, 2));

  for (const file of await readdir(SOURCE_MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    if (!include0037 && file >= '0037') continue;
    await copyFile(join(SOURCE_MIGRATIONS, file), join(dest, file));
  }
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'inkweld-migration-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('migration 0037 upgrade path', () => {
  it('preserves existing users and backfills the new columns', async () => {
    const preDir = join(workDir, 'pre');
    await stageMigrations(preDir, false);

    const sqlite = new BunDatabase(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: preDir });

    // A user that existed before this migration, with values in older columns.
    sqlite
      .query(
        `INSERT INTO users (id, username, email, enabled, approved, bio, preferences)
         VALUES ('legacy-user', 'legacy', 'legacy@example.com', 1, 1, 'Existing bio', '{"theme":"dark"}')`
      )
      .run();

    // Sanity: the new columns must NOT exist yet, otherwise this test is vacuous.
    const before = sqlite.query<{ name: string }, []>('PRAGMA table_info(users)').all();
    expect(before.some((c) => c.name === 'syncQuotaBytes')).toBe(false);

    // Apply the full migration set (including 0037) to the populated database.
    await stageMigrations(preDir, true);
    migrate(drizzle(sqlite), { migrationsFolder: preDir });

    const row = sqlite
      .query<
        {
          username: string;
          bio: string;
          preferences: string;
          syncQuotaBytes: number | null;
          storageUsedBytes: number;
        },
        []
      >(
        `SELECT username, bio, preferences, syncQuotaBytes, storageUsedBytes
         FROM users WHERE id = 'legacy-user'`
      )
      .get() as {
      username: string;
      bio: string;
      preferences: string;
      syncQuotaBytes: number | null;
      storageUsedBytes: number;
    };

    // Existing data untouched; new columns backfilled with the documented defaults.
    expect(row.username).toBe('legacy');
    expect(row.bio).toBe('Existing bio');
    expect(row.preferences).toBe('{"theme":"dark"}');
    expect(row.syncQuotaBytes).toBeNull(); // NULL = use instance default
    expect(row.storageUsedBytes).toBe(0);

    sqlite.close();
  });
});
