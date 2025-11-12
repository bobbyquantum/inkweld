/**
 * Database middleware for Cloudflare Workers using D1
 * This file must NOT import bun:sqlite or better-sqlite3
 */
import type { MiddlewareHandler } from 'hono';
import { makeD1Database, type D1DatabaseInstance } from '../db/d1';

// Context type for D1
export type D1AppContext = {
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    db: D1DatabaseInstance;
    user?: { id: string; username: string; email: string; role: string };
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any; // Runtime-only type, avoid workers-types dependency

/**
 * Middleware that attaches D1 database to Hono context
 */
export const d1DatabaseMiddleware: MiddlewareHandler<D1AppContext> = async (c, next) => {
  if (!c.env?.DB) {
    throw new Error('D1 database binding (DB) is required in Workers environment');
  }
  const db = makeD1Database(c.env.DB);
  c.set('db', db);
  await next();
};
