/**
 * In-memory rate-limiting middleware for Hono.
 *
 * Tracks request counts per key (default: client IP) within a sliding
 * window. Returns 429 Too Many Requests when the limit is exceeded.
 *
 * The store is a per-process Map. That is adequate for a single Bun/Node
 * process. On Cloudflare Workers each isolate has its own Map and isolates
 * are short-lived, so this middleware provides no meaningful limit there —
 * use Cloudflare's WAF rate-limiting rules (or a Rate Limiting binding) in
 * front of the auth endpoints on that runtime.
 *
 * Limits are off when INKWELD_DISABLE_RATE_LIMIT=true or NODE_ENV=test
 * (see rateLimitsDisabled).
 */

import type { Context, MiddlewareHandler } from 'hono';
import { configuredNodeEnv } from '../config/runtime-env';
import { getClientIp } from '../utils/client-ip';

interface RateLimitOptions {
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
    windowMs,
    max,
    keyGenerator,
    message = 'Too many requests, please try again later',
  } = options;

  const window = createRateWindow(windowMs, max);

  return (c: Context, next) => {
    const key = keyGenerator ? keyGenerator(c) : defaultKey(c);
    const retryAfter = window.take(key);

    if (retryAfter !== null) {
      c.header('Retry-After', String(retryAfter));
      return Promise.resolve(c.json({ error: message }, 429));
    }

    return next();
  };
}
