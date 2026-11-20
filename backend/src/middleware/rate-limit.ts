/**
 * In-memory rate-limiting middleware for Hono.
 *
 * Tracks request counts per key (default: client IP) within a sliding
 * window. Returns 429 Too Many Requests when the limit is exceeded.
 *
 * On Bun and Node the counts live in a per-process Map (sliding window).
 * On Cloudflare Workers each isolate has its own memory and isolates are
 * short-lived, so a Map limits nothing there: a limiter with a `name` counts
 * in the `rate_limit_buckets` table instead (fixed window), which every
 * isolate shares. A database error lets the request through (fails open) so
 * an outage of the counter never locks everyone out of signing in.
 *
 * Limits are off when INKWELD_DISABLE_RATE_LIMIT=true or NODE_ENV=test
 * (see rateLimitsDisabled).
 */

import type { Context, MiddlewareHandler } from 'hono';
import { lt, sql } from 'drizzle-orm';
import { configuredNodeEnv } from '../config/runtime-env';
import { rateLimitBuckets } from '../db/schema/rate-limit-buckets';
import { logger } from '../services/logger.service';
import type { DatabaseInstance } from '../types/context';
import type { D1DatabaseInstance } from '../db/d1';
import { getClientIp } from '../utils/client-ip';

interface RateLimitOptions {
  /**
   * Names the limiter's counters in the shared table. Without one the
   * limiter always counts in memory, which on Workers limits nothing.
   */
  name?: string;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed within the window */
  max: number;
  /** Optional key generator (defaults to client IP) */
  keyGenerator?: (c: Context) => string;
  /** Optional message in the 429 response body */
  message?: string;
}

interface WindowEntry {
  timestamps: number[];
}

/**
 * Whether limits are off: INKWELD_DISABLE_RATE_LIMIT=true (set by the Docker
 * e2e container) or NODE_ENV=test (`bun test` and the e2e backends). NODE_ENV
 * goes through configuredNodeEnv() because bundlers replace a plain
 * `process.env.NODE_ENV` read, bracket notation included, with its build-time
 * value; other variables are read at run time either way.
 */
export function rateLimitsDisabled(): boolean {
  return process.env['INKWELD_DISABLE_RATE_LIMIT'] === 'true' || configuredNodeEnv() === 'test';
}

/** Counts events per key in a sliding window. */
export interface RateWindow {
  /** Count one event, or give the seconds to wait if it would be over the limit. */
  take(key: string): number | null;
}

export function createRateWindow(windowMs: number, max: number): RateWindow {
  const store = new Map<string, WindowEntry>();

  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  return {
    take(key) {
      const now = Date.now();

      // Lazy cleanup of expired entries roughly every 5 minutes (triggered by requests)
      if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
        lastCleanup = now;
        for (const [storedKey, entry] of store) {
          entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
          if (entry.timestamps.length === 0) store.delete(storedKey);
        }
      }

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Prune timestamps outside the window
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

      if (entry.timestamps.length >= max) {
        return Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);
      }

      entry.timestamps.push(now);
      return null;
    },
  };
}

/** Minimum time between sweeps of expired shared counters, per isolate. */
const SHARED_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastSharedCleanup = 0;

/**
 * Count one event in the shared table, or give the seconds to wait if it is
 * over the limit. Fixed window: the count resets when a new window starts.
 * The upsert counts and reads in one statement, so concurrent requests on
 * different isolates can't both see room for the last slot.
 */
export async function takeSharedRateWindow(
  db: DatabaseInstance,
  key: string,
  windowMs: number,
  max: number,
  now = Date.now()
): Promise<number | null> {
  const windowStart = now - (now % windowMs);
  const expiresAt = windowStart + windowMs;
  const [row] = await (db as D1DatabaseInstance)
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`CASE WHEN ${rateLimitBuckets.windowStart} = ${windowStart} THEN ${rateLimitBuckets.count} + 1 ELSE 1 END`,
        windowStart,
        expiresAt,
      },
    })
    .returning({ count: rateLimitBuckets.count });

  if (now - lastSharedCleanup > SHARED_CLEANUP_INTERVAL_MS) {
    lastSharedCleanup = now;
    await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now));
  }

  if (row && row.count > max) {
    return Math.max(1, Math.ceil((expiresAt - now) / 1000));
  }
  return null;
}

/** Whether this request runs on Workers, where in-memory counts are useless. */
function usesSharedStore(c: Context): boolean {
  return !!(c.env as { DB?: unknown } | undefined)?.DB;
}

/**
 * Rate-limit bucket key for a request: the client IP as resolved by
 * `getClientIp` (proxy headers only when trusted — see utils/client-ip.ts).
 * When no trustworthy address is available every such request shares one
 * bucket, which fails closed (throttles) rather than open.
 */
function defaultKey(c: Context): string {
  return getClientIp(c) ?? 'unknown';
}

/**
 * Create a rate limiter middleware.
 *
 * @example
 * // 5 requests per minute per IP
 * app.use('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 5 }));
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const {
    name,
    windowMs,
    max,
    keyGenerator,
    message = 'Too many requests, please try again later',
  } = options;

  const window = createRateWindow(windowMs, max);

  const take = async (c: Context, key: string): Promise<number | null> => {
    const db = c.get('db') as DatabaseInstance | undefined;
    if (!name || !db || !usesSharedStore(c)) return window.take(key);
    try {
      return await takeSharedRateWindow(db, `${name}:${key}`, windowMs, max);
    } catch (error) {
      logger.error('RateLimit', `Shared rate-limit counter failed for ${name}`, error);
      return null;
    }
  };

  return async (c: Context, next) => {
    const key = keyGenerator ? keyGenerator(c) : defaultKey(c);
    const retryAfter = await take(c, key);

    if (retryAfter !== null) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: message }, 429);
    }

    await next();
  };
}

/**
 * Per-account limit for endpoints that cost money or can be abused at scale
 * (AI generation, reviews, invitations): counts by the signed-in user,
 * falling back to the client IP. Mount it after `requireAuth`. A passthrough
 * when limits are off ({@link rateLimitsDisabled}).
 */
export function userRateLimit(
  name: string,
  windowMs: number,
  max: number,
  message = 'Too many requests, please try again later'
): MiddlewareHandler {
  if (rateLimitsDisabled()) return (_c, next) => next();
  return rateLimit({
    name,
    windowMs,
    max,
    keyGenerator: (c) => {
      const userId = (c.get('user') as { id?: string } | undefined)?.id;
      return userId ? `user:${userId}` : defaultKey(c);
    },
    message,
  });
}
