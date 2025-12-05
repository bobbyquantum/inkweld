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

  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_DIR || join(process.cwd(), 'drizzle');

  if (!existsSync(migrationsFolder)) {
    console.warn(
      `[drizzle] migrations folder not found at "${migrationsFolder}". Skipping automatic migrations.`
    );
    migrationsApplied = true;
    return;
  }

  // Check if tables already exist by querying sqlite_master
  try {
    const result = sqlite
      ?.query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();

    if (result) {
      // Tables exist - check if we need to apply any missing columns
      await applyMissingColumns();
      console.log('[drizzle] Database tables already exist, skipping migrations');
      migrationsApplied = true;
      return;
    }
  } catch {
    // If we can't check, proceed with migrations
    console.log('[drizzle] Could not check existing tables, attempting migrations');
  }

  try {
    // Drizzle's migrate function handles tracking which migrations have been applied
    // It will only run migrations that haven't been applied yet
    await migrate(database, { migrationsFolder });
    migrationsApplied = true;
    console.log('[drizzle] Migrations completed successfully');
  } catch (error) {
    // If the error is about tables already existing, it's safe to continue
    // This happens when the database is already initialized
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already exists')) {
      console.log('[drizzle] Database tables already exist, skipping migrations');
      migrationsApplied = true;
      return;
    }
    console.error('[drizzle] Failed to run migrations:', error);
    throw error;
  }
}

/**
 * Apply any missing columns to existing databases.
 * This handles incremental schema changes without full migrations.
 */
async function applyMissingColumns(): Promise<void> {
  if (!sqlite) return;

  // Check and add isAdmin column if it doesn't exist
  try {
    const columns = sqlite
      .query<{ name: string }, []>("PRAGMA table_info(users)")
      .all();
    
    const hasIsAdmin = columns.some(col => col.name === 'isAdmin');
    
    if (!hasIsAdmin) {
      console.log('[drizzle] Adding isAdmin column to users table...');
      sqlite.exec('ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0 NOT NULL');
      console.log('[drizzle] Added isAdmin column successfully');
    }
  } catch (error) {
    console.warn('[drizzle] Could not check/add isAdmin column:', error);
  }
}
