/**
 * Database initialization for Cloudflare Workers (D1 only)
 * This file must NOT import bun:sqlite or better-sqlite3
 * to avoid Wrangler bundling errors
 */
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Create a Drizzle database instance from D1 binding
 * Use this in Worker route handlers
 *
 * @param d1 - D1Database binding from env
 * @returns Drizzle database instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeD1Database(d1: any): DrizzleD1Database<typeof schema> {
  return drizzle(d1, { schema });
}

export type D1DatabaseInstance = DrizzleD1Database<typeof schema>;
