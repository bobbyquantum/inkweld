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
 * To disable in test environments, set INKWELD_DISABLE_RATE_LIMIT=true.
 * We use an explicit env var rather than NODE_ENV because Bun's
 * --compile --minify may constant-fold process.env.NODE_ENV at build
 * time, preventing runtime overrides in Docker e2e containers.
 */

import type { Context, MiddlewareHandler } from 'hono';
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

  const store = new Map<string, WindowEntry>();

  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  return async (c: Context, next) => {
    const now = Date.now();

    // Lazy cleanup of expired entries roughly every 5 minutes (triggered by requests)
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = now;
      for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
        if (entry.timestamps.length === 0) store.delete(key);
      }
    }

    const key = keyGenerator ? keyGenerator(c) : defaultKey(c);

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Prune timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= max) {
      const oldest = entry.timestamps[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);

      c.header('Retry-After', String(retryAfter));
      return c.json({ error: message }, 429);
    }

    entry.timestamps.push(now);
    return next();
  };
}
