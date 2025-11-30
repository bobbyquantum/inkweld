/**
 * Database initialization for Node.js runtime using better-sqlite3
 * This file can be imported in Node-specific code paths
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: Database.Database | null = null;

export async function setupBetterSqliteDatabase(
  dbPath: string
): Promise<ReturnType<typeof drizzle>> {
  if (db) return db;

  sqlite = new Database(dbPath);
  db = drizzle(sqlite, { schema });

  return db;
}

export function getBetterSqliteDatabase(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error(
      'Better-sqlite3 database not initialized. Call setupBetterSqliteDatabase() first.'
    );
  }
  return db;
}

export type BetterSqliteDatabaseInstance = ReturnType<typeof drizzle>;
