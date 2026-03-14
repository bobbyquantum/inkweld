import { MiddlewareHandler } from 'hono';
import { ForbiddenError } from '../errors';
import { config } from '../config/env';

// Simple CSRF token storage (in production, use Redis or similar)
const csrfTokens = new Map<string, string>();

/**
 * Create a 32-byte cryptographically secure CSRF token encoded as a lowercase hexadecimal string.
 *
 * @returns A 64-character lowercase hexadecimal string representing 32 bytes of cryptographically secure random data.
 */
export function generateCSRFToken(): string {
  // Use Web Crypto API (works in both Bun/Node.js and Cloudflare Workers)
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a Hono middleware that enforces header-based CSRF protection for non-safe requests.
 *
 * The middleware skips checks in test mode, for safe HTTP methods (GET, HEAD, OPTIONS),
 * and for paths under `/api/auth/`. For other requests it requires an active session
 * and validates the `x-csrf-token` header against the session's `csrfToken`.
 *
 * @returns A MiddlewareHandler that validates an `x-csrf-token` header against the request session's `csrfToken`.
 * @throws {ForbiddenError} when no session is present.
 * @throws {ForbiddenError} when the `x-csrf-token` header is missing.
 * @throws {ForbiddenError} when the provided CSRF token does not match the session token.
 */
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

    const req = c.req.raw as Request & { session?: { csrfToken?: string } };
    const session = req.session;

    if (!session) {
      throw new ForbiddenError('CSRF validation failed: no session');
    }

    // Get CSRF token from header
    const token = c.req.header('x-csrf-token');

    if (!token) {
      throw new ForbiddenError('CSRF token missing');
    }

    // Verify token
    const storedToken = session.csrfToken;
    if (!storedToken || token !== storedToken) {
      throw new ForbiddenError('CSRF token invalid');
    }

    await next();
  };
}

export function getCSRFToken(sessionId: string): string {
  let token = csrfTokens.get(sessionId);
  if (!token) {
    token = generateCSRFToken();
    csrfTokens.set(sessionId, token);
  }
  return token;
}
