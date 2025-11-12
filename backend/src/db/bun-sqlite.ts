/**
 * Database initialization for Bun runtime using native bun:sqlite
 * This file can ONLY be imported in Bun-specific code paths
 */
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database as BunDatabase } from 'bun:sqlite';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: BunDatabase | null = null;

export async function setupBunDatabase(dbPath: string): Promise<ReturnType<typeof drizzle>> {
  if (db) return db;

  sqlite = new BunDatabase(dbPath);
  db = drizzle(sqlite, { schema });

  return db;
}

export function getBunDatabase(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error('Bun database not initialized. Call setupBunDatabase() first.');
  }
  return db;
}

export type BunDatabaseInstance = ReturnType<typeof drizzle>;
