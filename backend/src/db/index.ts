import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleBun } from 'drizzle-orm/bun-sqlite';
import { drizzle as drizzleD1, DrizzleD1Database } from 'drizzle-orm/d1';
import Database from 'better-sqlite3';
import { Database as BunDatabase } from 'bun:sqlite';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { config } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

type DbType =
  | BetterSQLite3Database<typeof schema>
  | DrizzleD1Database<typeof schema>
  | ReturnType<typeof drizzleBun>
  | { isD1: true };

let db: DbType | null = null;
let sqlite: Database.Database | BunDatabase | null = null;

// Detect if running in Cloudflare Workers
const isWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
// Detect if running under Bun
const isBun = typeof Bun !== 'undefined';
// Only use D1 in actual Workers environment (not wrangler dev)
// This allows local dev to use SQLite with better-sqlite3 for better DX
const useD1 = isWorkers && config.database.type === 'd1';

export async function setupDatabase(testMode = false): Promise<DbType> {
  if (db) {
    return db;
  }

  // If D1 is configured AND we're in Workers, skip database initialization
  // The D1 database binding will be passed via context in route handlers
  if (useD1) {
    console.log('Using Cloudflare D1 - database binding will be accessed via context');
    // Return a dummy object - actual DB will come from c.env.DB in routes
    db = { isD1: true };
    return db;
  }

  try {
    // Ensure data directory exists (for SQLite and file storage)
    if (!testMode) {
      const dbPath = process.env.DB_PATH || './data/inkweld.db';
      const dataDir = path.dirname(dbPath);

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Ensure data path exists for file storage
      if (!fs.existsSync(config.dataPath)) {
        fs.mkdirSync(config.dataPath, { recursive: true });
      }
    }

    // Use in-memory SQLite for tests
    const dbPath = testMode ? ':memory:' : process.env.DB_PATH || './data/inkweld.db';

    // Use Bun's built-in SQLite when running under Bun (including tests)
    // This avoids native module issues with better-sqlite3
    if (isBun) {
      sqlite = new BunDatabase(dbPath);

      // Initialize Drizzle with Bun SQLite
      db = drizzleBun(sqlite, { schema });
    } else {
      // Use better-sqlite3 for Node.js
      sqlite = new Database(dbPath);

      // Enable foreign keys
      (sqlite as Database.Database).pragma('foreign_keys = ON');

      // Initialize Drizzle
      db = drizzle(sqlite as Database.Database, { schema });
    }

    // Run migrations (only in non-test mode and non-Bun environments)
    if (!testMode && !isBun) {
      console.log('Running database migrations...');
      migrate(db as BetterSQLite3Database<typeof schema>, { migrationsFolder: './drizzle' });
    } else {
      // In test mode, create tables manually from schema
      // This is a simple approach for testing
      // In production, you'd use proper migrations
      const statements = [
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE,
          name TEXT,
          email TEXT,
          password TEXT,
          githubId TEXT UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 0,
          approved INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          data TEXT,
          expiredAt INTEGER NOT NULL,
          createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL DEFAULT 1,
          slug TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_date INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_date INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )`,
        `CREATE TABLE IF NOT EXISTS document_snapshots (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          y_doc_state BLOB NOT NULL,
          state_vector BLOB,
          word_count INTEGER,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )`,
      ];

      for (const stmt of statements) {
        sqlite.exec(stmt);
      }
    }

    console.log(`Database connected: ${testMode ? 'sqlite (test)' : 'sqlite'}`);

    return db;
  } catch (error: unknown) {
    console.error('Database setup error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

export function getDatabase():
  | BetterSQLite3Database<typeof schema>
  | DrizzleD1Database<typeof schema>
  | ReturnType<typeof drizzleBun> {
  if (!db) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  if ('isD1' in db) {
    throw new Error(
      'D1 database requires context binding. Use getDbFromContext(c) in route handlers instead of getDatabase().'
    );
  }
  return db;
}

/**
 * Get database instance from Hono context.
 * Use this in route handlers to support both SQLite and D1.
 *
 * @param c Hono context
 * @returns Database instance (BetterSQLite3Database, Bun SQLite, or DrizzleD1Database)
 *
 * @example
 * ```typescript
 * app.get('/users', async (c) => {
 *   const db = getDbFromContext(c);
 *   const users = await db.select().from(usersTable);
 *   return c.json(users);
 * });
 * ```
 */
export function getDbFromContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any
):
  | BetterSQLite3Database<typeof schema>
  | DrizzleD1Database<typeof schema>
  | ReturnType<typeof drizzleBun> {
  // If D1 is configured, use the binding from context
  if (useD1) {
    if (!c.env?.DB) {
      throw new Error(
        'D1 database binding not found in context. Make sure wrangler.toml has [[d1_databases]] configured.'
      );
    }
    // Return a Drizzle D1 instance
    return drizzleD1(c.env.DB, { schema }) as DrizzleD1Database<typeof schema>;
  }

  // Otherwise use the global database instance
  if (!db || 'isD1' in db) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (sqlite) {
    if ('close' in sqlite && typeof sqlite.close === 'function') {
      sqlite.close();
    }
    sqlite = null;
    db = null;
  }
}
