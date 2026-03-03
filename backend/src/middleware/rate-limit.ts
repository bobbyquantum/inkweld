import type { Context, MiddlewareHandler } from 'hono';

/**
 * In-memory sliding-window rate limiter.
 *
 * Each key (typically an IP address) is allowed `max` requests within
 * `windowMs` milliseconds. Old entries are lazily pruned on access.
 *
 * For single-process deployments this is sufficient. For horizontally
 * scaled deployments, swap this for a Redis-backed implementation.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed within the window */
  max: number;
  /** Key extractor — defaults to IP address */
  keyGenerator?: (c: Context) => string;
  /** Custom message returned when rate limited */
  message?: string;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Periodically prune stale entries from all stores (every 60 s).
 * This prevents unbounded memory growth from one-time visitors.
 */
const PRUNE_INTERVAL = 60_000;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function ensurePruner(): void {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
      for (const [key, entry] of store) {
        // Remove entries whose newest timestamp is older than any window we track
        if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 600_000) {
          store.delete(key);
        }
      }
    }
  }, PRUNE_INTERVAL);
  // Allow the process to exit even if the timer is running
  if (pruneTimer && typeof pruneTimer === 'object' && 'unref' in pruneTimer) {
    pruneTimer.unref();
  }
}

function getClientIp(c: Context): string {
  // Prefer standard forwarded headers (behind reverse proxy)
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
  );
}

export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  const { windowMs, max, message = 'Too many requests, please try again later' } = config;
  const keyGen = config.keyGenerator ?? getClientIp;

  // Each rateLimit() call gets its own store so different routes have independent limits
  const storeKey = `${windowMs}:${max}:${Math.random()}`;
  const store = new Map<string, RateLimitEntry>();
  stores.set(storeKey, store);
  ensurePruner();

  return async (c: Context, next) => {
    const key = keyGen(c);
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Prune timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= max) {
      // Calculate retry-after from the oldest request in the window
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      c.header('Retry-After', String(retryAfterSec));
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil((oldestInWindow + windowMs) / 1000)));

      return c.json({ error: message }, 429);
    }

    entry.timestamps.push(now);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(max - entry.timestamps.length));

    await next();
  };
}

/**
 * Pre-configured rate limiter for authentication endpoints.
 * 10 attempts per 15 minutes per IP address.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later',
});

/**
 * Pre-configured rate limiter for registration.
 * 5 registrations per hour per IP address.
 */
export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many registration attempts, please try again later',
});

/**
 * Pre-configured rate limiter for password reset requests.
 * 5 requests per 15 minutes per IP address.
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many password reset attempts, please try again later',
});
