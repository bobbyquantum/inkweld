/**
 * Shared helpers for cross-origin-open endpoints (OAuth, MCP, discovery).
 *
 * These paths must be reachable from any origin because MCP clients (e.g.
 * Claude.ai) fetch them without a matching Origin.  All other API routes use
 * origin-restricted CORS + CSRF.
 */
import { cors } from 'hono/cors';

/** Paths that have already received permissive CORS treatment. */
export function isCrossOriginPath(path: string): boolean {
  return (
    path.startsWith('/.well-known/') ||
    path.startsWith('/oauth/') ||
    path === '/register' ||
    path.startsWith('/api/v1/ai/mcp')
  );
}

/**
 * Mount permissive CORS middleware on all OAuth / MCP / discovery routes.
 * Call this before the standard CORS and CSRF middleware so those can safely
 * skip paths already handled here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOpenOriginRoutes(app: any): void {
  app.use('/.well-known/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));
  app.use(
    '/oauth/*',
    cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] })
  );
  app.use('/register', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'] }));
  app.use(
    '/api/v1/ai/mcp',
    cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
  );
  app.use(
    '/api/v1/ai/mcp/*',
    cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
  );
}
