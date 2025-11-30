/**
 * Database middleware for Bun runtime using native bun:sqlite
 * This file can ONLY be imported in Bun-specific code paths
 */
import type { MiddlewareHandler } from 'hono';
import { getBunDatabase, type BunDatabaseInstance } from '../db/bun-sqlite';

// Context type for Bun SQLite
export type BunSqliteAppContext = {
  Variables: {
    db: BunDatabaseInstance;
    user?: { id: string; username: string; email: string; role: string };
  };
};

/**
 * Middleware that attaches Bun SQLite database to Hono context
 */
export const bunSqliteDatabaseMiddleware: MiddlewareHandler<BunSqliteAppContext> = async (
  c,
  next
) => {
  const db = getBunDatabase();
  c.set('db', db);
  await next();
};
