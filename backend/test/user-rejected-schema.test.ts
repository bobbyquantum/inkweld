import { describe, it, expect } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { users } from '../src/db/schema';
import { userService } from '../src/services/user.service';

const MIGRATIONS = join(__dirname, '../drizzle');
const MIGRATION_TAG = '0002_user_rejected_at';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

interface Journal {
  entries: { tag: string }[];
}

/** A copy of the migrations folder that stops before the rejectedAt migration. */
function migrationsBeforeRejectedAt(): string {
  const dir = mkdtempSync(join(tmpdir(), 'inkweld-migrations-'));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  const index = journal.entries.findIndex((e) => e.tag === MIGRATION_TAG);
  journal.entries = journal.entries.slice(0, index);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

describe(`migration ${MIGRATION_TAG}`, () => {
  it('adds rejectedAt to an existing database and keeps its users pending', async () => {
    const sqlite = new BunDatabase(':memory:');
    const db = drizzle(sqlite, { schema });
    const before = migrationsBeforeRejectedAt();
    try {
      migrate(db, { migrationsFolder: before });
      sqlite.run(
        `insert into users (id, username, enabled, approved) values ('old-pending', 'oldpending', 1, 0)`
      );

      migrate(db, { migrationsFolder: MIGRATIONS });

      const column = sqlite
        .query<ColumnInfo, []>('PRAGMA table_info(users)')
        .all()
        .find((c) => c.name === 'rejectedAt');
      expect(column?.type.toLowerCase()).toBe('integer');
      expect(column?.notnull).toBe(0);
      expect(column?.dflt_value).toBeNull();

      // An account that was unapproved before the upgrade is still pending.
      const pending = await userService.listPending(db);
      expect(pending.map((u) => u.id)).toContain('old-pending');
    } finally {
      rmSync(before, { recursive: true, force: true });
      sqlite.close();
    }
  });

  it('rejecting sets rejectedAt and approving clears it', async () => {
    const sqlite = new BunDatabase(':memory:');
    const db = drizzle(sqlite, { schema });
    try {
      migrate(db, { migrationsFolder: MIGRATIONS });
      await db.insert(users).values({ id: 'u1', username: 'u1', enabled: true, approved: false });

      await userService.rejectUser(db, 'u1');
      let row = (await db.select().from(users).where(eq(users.id, 'u1')))[0];
      expect(row.approved).toBe(false);
      expect(row.rejectedAt).toBeGreaterThan(0);
      expect(row.sessionsValidFrom).toBe(row.rejectedAt ?? -1);
      expect(await userService.listPending(db)).toHaveLength(0);
      expect(userService.loginRefusal(row)?.code).toBe('ACCOUNT_REJECTED');

      await userService.approveUser(db, 'u1');
      row = (await db.select().from(users).where(eq(users.id, 'u1')))[0];
      expect(row.approved).toBe(true);
      expect(row.rejectedAt).toBeNull();
      expect(userService.loginRefusal(row)).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it('reports a disabled account before its approval state', () => {
    const base = { enabled: false, approved: false, rejectedAt: 123 } as schema.User;
    expect(userService.loginRefusal(base)?.code).toBe('ACCOUNT_DISABLED');
    expect(userService.loginRefusal({ ...base, enabled: true, rejectedAt: null })?.code).toBe(
      'ACCOUNT_PENDING'
    );
  });
});
