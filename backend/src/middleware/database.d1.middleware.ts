/**
 * Database middleware for Cloudflare Workers using D1
 * This file must NOT import bun:sqlite or better-sqlite3
 */
import type { MiddlewareHandler } from 'hono';
import { makeD1Database, type D1DatabaseInstance } from '../db/d1';
import type { R2Bucket } from '@cloudflare/workers-types';

// Context type for D1
export type D1AppContext = {
  Bindings: {
    DB: D1Database;
    STORAGE?: R2Bucket;
  };
  Variables: {
    db: D1DatabaseInstance;
    user?: { id: string; username: string; email: string; role: string };
    storage?: R2Bucket;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any; // Runtime-only type, avoid workers-types dependency

/**
 * Middleware that attaches D1 database and R2 storage to Hono context
 */
export const d1DatabaseMiddleware: MiddlewareHandler<D1AppContext> = async (c, next) => {
  if (!c.env?.DB) {
    throw new Error('D1 database binding (DB) is required in Workers environment');
  }
  const db = makeD1Database(c.env.DB);
  c.set('db', db);

  // Attach R2 storage if available
  if (c.env?.STORAGE) {
    c.set('storage', c.env.STORAGE);
  }

  await next();
};
