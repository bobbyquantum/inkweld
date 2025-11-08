import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { config } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

let db: BetterSQLite3Database<typeof schema> | null = null;
let sqlite: Database.Database | null = null;

export async function setupDatabase(testMode = false): Promise<BetterSQLite3Database<typeof schema>> {
  if (db) {
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

    // Initialize SQLite database
    sqlite = new Database(dbPath);
    
    // Enable foreign keys
    sqlite.pragma('foreign_keys = ON');

    // Initialize Drizzle
    db = drizzle(sqlite, { schema });

    // Run migrations (only in non-test mode)
    if (!testMode) {
      console.log('Running database migrations...');
      migrate(db, { migrationsFolder: './drizzle' });
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
  } catch (error: any) {
    console.error('Database setup error:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
