/**
 * Database initialization for Cloudflare Workers (D1 only)
 * This file must NOT import bun:sqlite or better-sqlite3
 * to avoid Wrangler bundling errors
 */
import type { D1Database } from '@cloudflare/workers-types';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Create a Drizzle database instance from D1 binding
 * Use this in Worker route handlers
 *
 * @param d1 - D1Database binding from env
 * @returns Drizzle database instance
 */
export function makeD1Database(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzle(d1, { schema });
}

export type D1DatabaseInstance = DrizzleD1Database<typeof schema>;
