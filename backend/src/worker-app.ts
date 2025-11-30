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

const app = new OpenAPIHono<D1AppContext>();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches D1 database to context
app.use('*', d1DatabaseMiddleware);

// CORS configuration (must match bun-app.ts)
const allowedOrigins = config.allowedOrigins;
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin || allowedOrigins.includes(origin)) return origin || '*';
      return allowedOrigins[0] || '*';
    },
    credentials: true, // Allow credentials (cookies/sessions)
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-TOKEN'],
    exposeHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600, // Cache preflight for 10 minutes
  })
);

// Register common routes
registerCommonRoutes(app);

// Worker-specific: WebSocket routes using Durable Objects for Yjs collaboration
app.route('/api/v1/ws', yjsWorkerRoutes);

// Root + metadata
app.get('/', (c) =>
  c.json({ name: 'Inkweld API (Workers)', version: config.version, status: 'running' })
);

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
