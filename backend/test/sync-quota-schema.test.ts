import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { users } from '../src/db/schema';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

beforeAll(() => {
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(__dirname, '../drizzle') });
});

afterAll(() => {
  sqlite.close();
});

describe('migration 0037 - user sync quota columns', () => {
  it('adds syncQuotaBytes as a nullable integer without a default', () => {
    const columns = sqlite.query<ColumnInfo, []>('PRAGMA table_info(users)').all();
    const quota = columns.find((c) => c.name === 'syncQuotaBytes');

    expect(quota).toBeDefined();
    expect(quota?.type.toLowerCase()).toBe('integer');
    expect(quota?.notnull).toBe(0);
    expect(quota?.dflt_value).toBeNull();
  });

  it('adds storageUsedBytes as a NOT NULL integer defaulting to 0', () => {
    const columns = sqlite.query<ColumnInfo, []>('PRAGMA table_info(users)').all();
    const used = columns.find((c) => c.name === 'storageUsedBytes');

    expect(used).toBeDefined();
    expect(used?.type.toLowerCase()).toBe('integer');
    expect(used?.notnull).toBe(1);
    expect(used?.dflt_value).toBe('0');
  });

  it('defaults a freshly inserted user to no override and zero usage', async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, username: 'quotadefault', enabled: true, approved: true });

    const row = (await db.select().from(users).where(eq(users.id, id)))[0];
    // NULL override = "use the instance default".
    expect(row.syncQuotaBytes).toBeNull();
    expect(row.storageUsedBytes).toBe(0);
  });

  it('round-trips an explicit override, including zero', async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      username: 'quotaoverride',
      enabled: true,
      approved: true,
      syncQuotaBytes: 5_242_880,
      storageUsedBytes: 1234,
    });

    const row = (await db.select().from(users).where(eq(users.id, id)))[0];
    expect(row.syncQuotaBytes).toBe(5_242_880);
    expect(row.storageUsedBytes).toBe(1234);

    // A zero override is distinct from NULL and must persist as 0.
    await db.update(users).set({ syncQuotaBytes: 0 }).where(eq(users.id, id));
    const zeroed = (await db.select().from(users).where(eq(users.id, id)))[0];
    expect(zeroed.syncQuotaBytes).toBe(0);
  });
});
