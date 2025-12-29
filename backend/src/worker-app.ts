/**
 * Cloudflare Workers app configuration using D1 database
 * This file must NOT import bun:sqlite or better-sqlite3
 * Supports Durable Objects for WebSocket/Yjs collaboration
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { d1DatabaseMiddleware, type D1AppContext } from './middleware/database.d1.middleware';

// Import common route registration + Worker-specific routes
import { registerCommonRoutes } from './config/routes';
import yjsWorkerRoutes from './routes/yjs-worker.routes';

// Extend D1AppContext bindings to include env vars from wrangler.toml
type WorkerAppContext = {
  Bindings: D1AppContext['Bindings'] & {
    ALLOWED_ORIGINS?: string;
  };
  Variables: D1AppContext['Variables'];
};

const app = new OpenAPIHono<WorkerAppContext>();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches D1 database to context
app.use('*', d1DatabaseMiddleware);

// CORS configuration - reads ALLOWED_ORIGINS from wrangler.toml env bindings
// In Workers, process.env is not available at runtime, so we read from c.env
app.use('*', async (c, next) => {
  // Get allowed origins from wrangler.toml bindings, fallback to static config
  const envOrigins = c.env?.ALLOWED_ORIGINS;
  const allowedOrigins = envOrigins ? envOrigins.split(',') : config.allowedOrigins;

  // Helper to check if origin matches allowed pattern (supports *.pages.dev wildcards)
  const isOriginAllowed = (origin: string): boolean => {
    for (const allowed of allowedOrigins) {
      // Exact match
      if (allowed === origin) return true;
      // Wildcard subdomain match (e.g., "*.inkweld-frontend-staging.pages.dev")
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
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-TOKEN'],
    exposeHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600, // Cache preflight for 10 minutes
  });

  return corsMiddleware(c, next);
});

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
