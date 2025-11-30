/**
 * Database middleware for Node.js runtime using better-sqlite3
 * This file can be imported in Node-specific code paths
 */
import type { MiddlewareHandler } from 'hono';
import { getBetterSqliteDatabase, type BetterSqliteDatabaseInstance } from '../db/better-sqlite';

// Context type for better-sqlite3
export type BetterSqliteAppContext = {
  Variables: {
    db: BetterSqliteDatabaseInstance;
    user?: { id: string; username: string; email: string; role: string };
  };
};

/**
 * Middleware that attaches better-sqlite3 database to Hono context
 */
export const betterSqliteDatabaseMiddleware: MiddlewareHandler<BetterSqliteAppContext> = async (
  c,
  next
) => {
  const db = getBetterSqliteDatabase();
  c.set('db', db);
  await next();
};
