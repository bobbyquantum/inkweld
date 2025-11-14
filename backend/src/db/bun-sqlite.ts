/**
 * Database initialization for Bun runtime using native bun:sqlite
 * This file can ONLY be imported in Bun-specific code paths
 */
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: BunDatabase | null = null;
let migrationsApplied = false;

export async function setupBunDatabase(dbPath: string): Promise<ReturnType<typeof drizzle>> {
  if (db) return db;

  sqlite = new BunDatabase(dbPath);
  db = drizzle(sqlite, { schema });

  await runMigrations(db);

  return db;
}

export function getBunDatabase(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error('Bun database not initialized. Call setupBunDatabase() first.');
  }
  return db;
}

export type BunDatabaseInstance = ReturnType<typeof drizzle>;

async function runMigrations(database: ReturnType<typeof drizzle>): Promise<void> {
  if (migrationsApplied) {
    return;
  }

  const migrationsFolder =
    process.env.DRIZZLE_MIGRATIONS_DIR || join(process.cwd(), 'drizzle');

  if (!existsSync(migrationsFolder)) {
    console.warn(
      `[drizzle] migrations folder not found at "${migrationsFolder}". Skipping automatic migrations.`
    );
    migrationsApplied = true;
    return;
  }

  try {
    await migrate(database, { migrationsFolder });
    migrationsApplied = true;
  } catch (error) {
    console.error('[drizzle] Failed to run migrations:', error);
    throw error;
  }
}
