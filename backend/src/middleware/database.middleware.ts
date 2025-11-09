/**
 * Database middleware for Hono
 * Attaches the appropriate database instance to the request context
 * This enables deployment-agnostic database access across platforms
 */

import { Context, MiddlewareHandler } from 'hono';
import { drizzle as drizzleD1, DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle as drizzleBun } from 'drizzle-orm/bun-sqlite';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDatabase } from '../db';
import * as schema from '../db/schema';
import { config } from '../config/env';
import type { AppContext as BaseAppContext } from '../types/context';

// Type for the database in context
export type DatabaseInstance =
  | BetterSQLite3Database<typeof schema>
  | DrizzleD1Database<typeof schema>
  | ReturnType<typeof drizzleBun>;

// Extend Hono context to include database
export type AppContext = BaseAppContext & {
  Variables: BaseAppContext['Variables'] & {
    db: DatabaseInstance;
  };
};

/**
 * Middleware that attaches database instance to context
 * Supports multiple database backends:
 * - SQLite (better-sqlite3) for Node.js local dev
 * - Bun SQLite (built-in) for Bun runtime
 * - Cloudflare D1 for Workers deployment
 */
export const databaseMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  // Check if running in Cloudflare Workers with D1
  const isWorkers =
    typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

  if (isWorkers && config.database.type === 'd1') {
    // Use D1 from Workers environment binding
    if (!c.env?.DB) {
      throw new Error('D1 database binding not found. Configure [[d1_databases]] in wrangler.toml');
    }
    c.set('db', drizzleD1(c.env.DB, { schema }));
  } else {
    // Use the global database instance (SQLite/Bun SQLite)
    c.set('db', getDatabase() as DatabaseInstance);
  }

  await next();
};

/**
 * Helper to get database from context with type safety
 */
export function getDb(c: Context<AppContext>): DatabaseInstance {
  const db = c.get('db');
  if (!db) {
    throw new Error(
      'Database not available in context. Make sure databaseMiddleware is registered.'
    );
  }
  return db;
}
