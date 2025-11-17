/**
 * Bun-specific app configuration using native bun:sqlite
 * This file imports Bun-only modules and should only be used in Bun runtime
 */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { generateSpecs } from 'hono-openapi';
import { websocket } from 'hono/bun';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import {
  bunSqliteDatabaseMiddleware,
  type BunSqliteAppContext,
} from './middleware/database.bun-sqlite.middleware';
import { setupBunDatabase } from './db/bun-sqlite';

// Import common route registration + specialized routes
import { registerCommonRoutes } from './config/routes';
import yjsRoutes from './routes/yjs.routes';

const app = new Hono<BunSqliteAppContext>();
const frontendDistPath = process.env.FRONTEND_DIST;
const spaEnabled = Boolean(frontendDistPath && existsSync(join(frontendDistPath, 'index.html')));
const SPA_BYPASS_PREFIXES = ['/api', '/health', '/lint', '/image', '/mcp', '/ws'];

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches Bun SQLite DB instance to context
app.use('*', bunSqliteDatabaseMiddleware);

// CORS configuration
const allowedOrigins = config.allowedOrigins;
app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true, // Enable credentials for session-based auth
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-TOKEN'],
    exposeHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600, // Cache preflight for 10 minutes
  })
);

// Register common routes
registerCommonRoutes(app);

// Bun-specific: WebSocket routes for Yjs collaboration
app.route('/api/v1/ws', yjsRoutes);

// Root route only when SPA assets are not bundled
if (!spaEnabled) {
  app.get('/', (c) => {
    return c.json({
      name: 'Inkweld API (Bun)',
      version: config.version,
      status: 'running',
    });
  });
}

// API documentation
app.get('/api', (c) => {
  return c.json({
    message: 'Inkweld API - Hono version (Bun)',
    version: config.version,
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      documents: '/api/v1/projects/:username/:slug/docs',
      elements: '/api/v1/projects/:username/:slug/elements',
      files: '/api/v1/projects/:username/:slug/files',
      epub: '/api/v1/projects/:username/:slug/epub',
      images: '/api/v1/images',
      snapshots: '/api/v1/snapshots',
      health: '/api/v1/health',
      config: '/api/v1/config',
      csrf: '/api/v1/csrf',
      lint: '/api/v1/lint',
      aiImage: '/api/v1/image',
      mcp: '/api/v1/mcp',
      websocket: '/api/v1/ws',
    },
  });
});

// OpenAPI documentation
app.get('/api/openapi.json', async (c) => {
  const spec = await generateSpecs(app, {
    documentation: {
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API (Bun)',
      },
      servers: [
        {
          url: 'http://localhost:8333',
          description: 'Local development server',
        },
      ],
    },
  });
  return c.json(spec);
});

if (spaEnabled && frontendDistPath) {
  const spaHandler = createSpaHandler(frontendDistPath, SPA_BYPASS_PREFIXES);
  app.get('*', spaHandler);
}

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
    await setupBunDatabase(dbPath);
    console.log('Bun SQLite database initialized');

    const port = config.port;
    console.log(`Inkweld backend (Bun) ready on port ${port}`);
  } catch (error) {
    console.error('Failed to start Bun server:', error);
    process.exit(1);
  }
}

// Only run bootstrap if not in test mode
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

export default {
  port: config.port,
  fetch: app.fetch,
  websocket, // Required for Bun WebSocket support
};

export { app };

function createSpaHandler(root: string, bypassPrefixes: string[]): MiddlewareHandler {
  const indexFilePath = join(root, 'index.html');
  return async (c, next) => {
    if (c.req.method !== 'GET') {
      return next();
    }

    const pathname = c.req.path;
    if (shouldBypassSpa(pathname, bypassPrefixes)) {
      return next();
    }

    const assetResponse = await serveSpaAsset(root, pathname);
    if (assetResponse) {
      return assetResponse;
    }

    const indexFile = Bun.file(indexFilePath);
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return next();
  };
}

async function serveSpaAsset(root: string, pathname: string): Promise<Response | null> {
  const relativePath = sanitizeSpaPath(pathname);
  const filePath = join(root, relativePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  const headers = new Headers();
  headers.set('Content-Type', file.type || 'application/octet-stream');
  headers.set(
    'Cache-Control',
    relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  );

  return new Response(file, { headers });
}

function sanitizeSpaPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return 'index.html';
  }

  const safeSegments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (safeSegments.length === 0) {
    return 'index.html';
  }

  return safeSegments.join('/');
}

function shouldBypassSpa(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Function to create and initialize the app for testing
export async function createBunApp() {
  const dbPath =
    process.env.DB_DATABASE === ':memory:'
      ? ':memory:'
      : process.env.DB_PATH || './data/inkweld.db';
  await setupBunDatabase(dbPath);
  return app;
}
