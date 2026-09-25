import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Upgrade-path guard for 0038 (users.policyAcceptedVersion / policyAcceptedAt):
 * build a database at the pre-0038 schema, insert a user, then apply 0038.
 */

const SOURCE_MIGRATIONS = join(__dirname, '../drizzle');
const CUTOFF = '0038';

let workDir = '';

/** Copy the migrations folder, optionally leaving out everything from 0038 on. */
async function stageMigrations(dest: string, includeCutoff: boolean): Promise<void> {
  await mkdir(join(dest, 'meta'), { recursive: true });
  const journal = JSON.parse(await readFile(join(SOURCE_MIGRATIONS, 'meta/_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e: { tag: string }) => includeCutoff || e.tag < CUTOFF);
  await writeFile(join(dest, 'meta/_journal.json'), JSON.stringify(journal, null, 2));

  for (const file of await readdir(SOURCE_MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    if (!includeCutoff && file >= CUTOFF) continue;
    await copyFile(join(SOURCE_MIGRATIONS, file), join(dest, file));
  }
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'inkweld-migration-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('migration 0038 upgrade path', () => {
  it('preserves existing users and leaves them without an accepted policy', async () => {
    const dir = join(workDir, 'pre');
    await stageMigrations(dir, false);

    const sqlite = new BunDatabase(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: dir });
    sqlite
      .query(
        `INSERT INTO users (id, username, email, enabled, approved, bio)
         VALUES ('legacy-user', 'legacy', 'legacy@example.com', 1, 1, 'Existing bio')`
      )
      .run();

    const before = sqlite.query<{ name: string }, []>('PRAGMA table_info(users)').all();
    expect(before.some((c) => c.name === 'policyAcceptedVersion')).toBe(false);

    await stageMigrations(dir, true);
    migrate(drizzle(sqlite), { migrationsFolder: dir });

    const row = sqlite
      .query<
        {
          username: string;
          bio: string;
          policyAcceptedVersion: string | null;
          policyAcceptedAt: number | null;
        },
        []
      >(
        `SELECT username, bio, policyAcceptedVersion, policyAcceptedAt
         FROM users WHERE id = 'legacy-user'`
      )
      .get();

    expect(row?.username).toBe('legacy');
    expect(row?.bio).toBe('Existing bio');
    expect(row?.policyAcceptedVersion).toBeNull();
    expect(row?.policyAcceptedAt).toBeNull();

    sqlite.close();
  });
});
