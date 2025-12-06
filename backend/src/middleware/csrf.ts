import { MiddlewareHandler } from 'hono';
import { ForbiddenError } from '../errors';
import { config } from '../config/env.js';

// Simple CSRF token storage (in production, use Redis or similar)
const csrfTokens = new Map<string, string>();

export function generateCSRFToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
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
