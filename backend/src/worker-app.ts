/**
 * Cloudflare Workers app configuration using D1 database
 * This file must NOT import bun:sqlite or better-sqlite3
 * Supports Durable Objects for WebSocket/Yjs collaboration
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { requestLogger } from './middleware/request-logger';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { d1DatabaseMiddleware, type D1AppContext } from './middleware/database.d1.middleware';
import { configService } from './services/config.service';

// Import common route registration + Worker-specific routes
import { registerCommonRoutes } from './config/routes';
import yjsWorkerRoutes from './routes/yjs-worker.routes';

// Extend D1AppContext bindings to include env vars and secrets from wrangler.toml.
// In Cloudflare Workers, secrets set via `wrangler secret put` are only accessible
// through c.env (Hono context bindings), NOT process.env.
type WorkerAppContext = {
  Bindings: D1AppContext['Bindings'] & {
    ALLOWED_ORIGINS?: string;
    /** Session encryption key, set via `wrangler secret put SESSION_SECRET`.
     *  Used for JWT signing, CSRF token generation, and session cookies. */
    SESSION_SECRET?: string;
    /** Optional override for SESSION_SECRET for database encryption.
     *  Set via `wrangler secret put DATABASE_KEY`. Falls back to SESSION_SECRET. */
    DATABASE_KEY?: string;
  };
  Variables: D1AppContext['Variables'];
};

const app = new OpenAPIHono<WorkerAppContext>();

// Global middleware
app.use('*', requestLogger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches D1 database to context
app.use('*', d1DatabaseMiddleware);

// Patch ConfigService's encryption key from Workers secrets (c.env) on the first request.
// In Workers, process.env doesn't have secrets — they're only available via c.env.
// ConfigService uses this key for encrypting/decrypting sensitive config values in D1.
let configKeyPatched = false;
app.use('*', async (c, next) => {
  if (!configKeyPatched) {
    const secret = c.env?.DATABASE_KEY || c.env?.SESSION_SECRET;
    if (secret) {
      configService.setDatabaseKey(secret);
      configKeyPatched = true;
    }
  }
  return next();
});

// OAuth/MCP discovery endpoints need permissive CORS since MCP clients (like Claude.ai)
// need to fetch them from any origin. These endpoints are public metadata.
app.use('/.well-known/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));
// OAuth endpoints need permissive CORS for MCP clients from any origin
// Use wildcard to ensure all OAuth paths are covered
app.use(
  '/oauth/*',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] })
);
// Also allow /register alias (some MCP clients use this)
app.use('/register', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'] }));
app.use(
  '/api/v1/ai/mcp',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
);
app.use(
  '/api/v1/ai/mcp/*',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
);

// CORS configuration - reads ALLOWED_ORIGINS from wrangler.toml env bindings
// In Workers, process.env is not available at runtime, so we read from c.env
app.use('*', async (c, next) => {
  // Skip if already handled by permissive CORS above
  const path = c.req.path;
  if (
    path.startsWith('/.well-known/') ||
    path.startsWith('/oauth/') ||
    path === '/register' ||
    path.startsWith('/api/v1/ai/mcp')
  ) {
    return next();
  }

  // Get allowed origins from wrangler.toml bindings, fallback to static config
  const envOrigins = c.env?.ALLOWED_ORIGINS;
  const allowedOrigins = envOrigins ? envOrigins.split(',') : config.allowedOrigins;

  // Helper to check if origin matches allowed pattern (supports *.pages.dev wildcards)
  const isOriginAllowed = (origin: string): boolean => {
    for (const allowed of allowedOrigins) {
      // Exact match
      if (allowed === origin) return true;
      // Wildcard subdomain match (e.g., "*.inkweld-frontend-preview.pages.dev")
      if (allowed.startsWith('*.')) {
        const suffix = allowed.slice(1); // Remove the "*" but keep the dot
        if (origin.endsWith(suffix)) return true;
      }
    }
    return false;
  };

  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin || isOriginAllowed(origin)) return origin || '*';
      return allowedOrigins[0] || '*';
    },
    credentials: true, // Allow credentials (cookies/sessions)
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600, // Cache preflight for 10 minutes
  });

  return corsMiddleware(c, next);
});

// CSRF protection (origin-based, matches Node and Bun runtimes)
if (config.nodeEnv !== 'test') {
  app.use('*', async (c, next) => {
    // Skip CSRF for endpoints that need cross-origin access (OAuth, MCP)
    const path = c.req.path;
    if (
      path.startsWith('/.well-known/') ||
      path.startsWith('/oauth/') ||
      path === '/register' ||
      path.startsWith('/api/v1/ai/mcp')
    ) {
      return next();
    }

    const envOrigins = c.env?.ALLOWED_ORIGINS;
    const origins = envOrigins ? envOrigins.split(',') : config.allowedOrigins;

    return csrf({
      origin: (requestOrigin) => {
        for (const allowed of origins) {
          if (allowed === requestOrigin) return true;
          // Wildcard subdomain match (e.g., "*.inkweld.pages.dev")
          if (allowed.startsWith('*.')) {
            const suffix = allowed.slice(1); // Keep the dot
            if (requestOrigin.endsWith(suffix)) return true;
          }
        }
        return false;
      },
    })(c, next);
  });
}

// Register common routes
registerCommonRoutes(app);

// Worker-specific: WebSocket routes using Durable Objects for Yjs collaboration
app.route('/api/v1/ws', yjsWorkerRoutes);

// Root + metadata
app.get('/', (c) =>
  c.json({ name: 'Inkweld API (Workers)', version: config.version, status: 'running' })
);

// Note: securitySchemes is injected by generate-openapi.ts post-processing
app.get('/api/openapi.json', (c) => {
  return c.json(
    app.getOpenAPIDocument({
      openapi: '3.0.0',
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API (Workers)',
      },
      servers: [{ url: 'https://example.com', description: 'Cloudflare Workers' }],
    })
  );
});

// Error & 404
app.onError(errorHandler);
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
