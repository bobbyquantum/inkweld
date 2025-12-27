/**
 * Node.js-specific app configuration using better-sqlite3
 * This file imports Node-compatible modules and should only be used in Node.js runtime
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import {
  betterSqliteDatabaseMiddleware,
  type BetterSqliteAppContext,
} from './middleware/database.better-sqlite.middleware';
import { setupBetterSqliteDatabase } from './db/better-sqlite';

// Import common route registration (no WebSocket/Yjs routes - Node doesn't support those easily)
import { registerCommonRoutes } from './config/routes';

const app = new OpenAPIHono<BetterSqliteAppContext>();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches better-sqlite3 DB instance to context
app.use('*', betterSqliteDatabaseMiddleware);

// CORS configuration
const allowedOrigins = config.allowedOrigins;
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return origin || '*';
      }
      return allowedOrigins[0] || '*';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  })
);

// CSRF protection
if (config.nodeEnv !== 'test') {
  app.use(
    '*',
    csrf({
      origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    })
  );
}

// Register common routes (no WebSocket routes for Node.js)
registerCommonRoutes(app);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'Inkweld API (Node.js)',
    version: config.version,
    status: 'running',
  });
});

// Legacy OAuth providers endpoint
app.get('/providers', (c) => {
  return c.json({
    providers: {
      github: config.github.enabled,
    },
  });
});

// API documentation
app.get('/api', (c) => {
  return c.json({
    message: 'Inkweld API - Hono version (Node.js)',
    version: config.version,
    endpoints: {
      auth: '/api/auth',
      csrf: '/csrf',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      documents: '/api/v1/projects/:username/:slug/docs',
      elements: '/api/v1/projects/:username/:slug/elements',
      epub: '/api/v1/projects/:username/:slug/epub',
      images: '/api/images',
      snapshots: '/api/snapshots',
      health: '/health',
      config: '/api/config',
    },
  });
});

// OpenAPI documentation
// Note: securitySchemes is injected by generate-openapi.ts post-processing
app.get('/api/openapi.json', (c) => {
  return c.json(
    app.getOpenAPIDocument({
      openapi: '3.0.0',
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API (Node.js)',
      },
      servers: [
        {
          url: 'http://localhost:8333',
          description: 'Local development server',
        },
      ],
    })
  );
});

// Error handler (must be last)
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Initialize database and start server
async function bootstrap() {
  try {
    const dbPath = process.env.DB_PATH || './data/inkweld.db';
    await setupBetterSqliteDatabase(dbPath);
    console.log('Better-sqlite3 database initialized');

    const port = config.port;
    console.log(`Inkweld backend (Node.js) ready on port ${port}`);
  } catch (error) {
    console.error('Failed to start Node.js server:', error);
    process.exit(1);
  }
}

// Only run bootstrap if not in test mode
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

export default app;
export { app };
