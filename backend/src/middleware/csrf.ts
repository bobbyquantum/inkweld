import type { MiddlewareHandler } from 'hono';
import { randomBytes, timingSafeEqual } from 'crypto';
import { ForbiddenError } from '../errors';
import { config } from '../config/env';

const CSRF_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

interface StoredToken {
  token: string;
  createdAt: number;
}

// CSRF token storage keyed by userId
const csrfTokens = new Map<string, StoredToken>();

// Periodically evict expired tokens
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of csrfTokens) {
    if (now - entry.createdAt > CSRF_TOKEN_TTL_MS) {
      csrfTokens.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS).unref?.();

export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

export function setupCSRF(): MiddlewareHandler {
  return async (c, next) => {
    // Skip CSRF in test mode
    if (config.nodeEnv === 'test') {
      await next();
      return;
    }

    const method = c.req.method;

    // Skip CSRF check for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      await next();
      return;
    }

    // Skip CSRF check for auth endpoints (they use session)
    const path = c.req.path;
    if (path.includes('/api/auth/')) {
      await next();
      return;
    }

    const session = c.get('session') as { userId?: string } | undefined;

    if (!session?.userId) {
      throw new ForbiddenError('CSRF validation failed: no session');
    }

    // Get CSRF token from header
    const token = c.req.header('x-csrf-token');

    if (!token) {
      throw new ForbiddenError('CSRF token missing');
    }

    // Look up the stored token for this user
    const stored = csrfTokens.get(session.userId);
    if (!stored || Date.now() - stored.createdAt > CSRF_TOKEN_TTL_MS) {
      if (stored) csrfTokens.delete(session.userId);
      throw new ForbiddenError('CSRF token invalid');
    }

    // Verify token using constant-time comparison to prevent timing attacks
    const tokenBuf = Buffer.from(token);
    const storedBuf = Buffer.from(stored.token);
    if (tokenBuf.length !== storedBuf.length || !timingSafeEqual(tokenBuf, storedBuf)) {
      throw new ForbiddenError('CSRF token invalid');
    }

    await next();
  };
}

export function getCSRFToken(userId: string): string {
  const existing = csrfTokens.get(userId);
  if (existing && Date.now() - existing.createdAt <= CSRF_TOKEN_TTL_MS) {
    return existing.token;
  }
  const token = generateCSRFToken();
  csrfTokens.set(userId, { token, createdAt: Date.now() });
  return token;
}

export function removeCSRFToken(userId: string): void {
  csrfTokens.delete(userId);
}
