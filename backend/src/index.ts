import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { generateSpecs } from 'hono-openapi';
import { config } from './config/env';
import { setupDatabase } from './db';
import { errorHandler } from './middleware/error-handler';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import projectRoutes from './routes/project.routes';
import healthRoutes from './routes/health.routes';
import configRoutes from './routes/config.routes';
import imageRoutes from './routes/image.routes';
import csrfRoutes from './routes/csrf.routes';
import snapshotRoutes from './routes/snapshot.routes';
import documentRoutes from './routes/document.routes';
import elementRoutes from './routes/element.routes';
import fileRoutes from './routes/file.routes';
import epubRoutes from './routes/epub.routes';
import lintRoutes from './routes/lint.routes';
import aiImageRoutes from './routes/ai-image.routes';
import mcpRoutes from './routes/mcp.routes';
// Yjs routes imported conditionally below (requires Bun WebSocket support)

// Import database middleware
import { databaseMiddleware } from './middleware/database.middleware';

// Conditionally import Bun-specific websocket only in Bun runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let websocket: any = undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yjsRoutes: any = undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bunRuntime = (globalThis as any).Bun;
if (bunRuntime) {
  const bunModule = await import('hono/bun');
  websocket = bunModule.websocket;
  const yjsModule = await import('./routes/yjs.routes');
  yjsRoutes = yjsModule.default;
}

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches DB instance to context
app.use('*', databaseMiddleware);

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

// CSRF protection - allows same-origin and multiple configured origins
// Skip CSRF in test mode to allow test requests without proper headers
if (config.nodeEnv !== 'test') {
  app.use(
    '*',
    csrf({
      origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    })
  );
}

// Routes
app.route('/', authRoutes); // Root-level, matches old NestJS server (/login, /logout, /me)
app.route('/csrf', csrfRoutes); // Root-level, matches old NestJS server
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/projects', projectRoutes);
app.route('/api/v1/projects', documentRoutes);
app.route('/api/v1/projects', elementRoutes);
app.route('/api/v1/projects', fileRoutes);
app.route('/api/v1/projects', epubRoutes);
app.route('/api/images', imageRoutes);
app.route('/api/snapshots', snapshotRoutes);
app.route('/health', healthRoutes);
app.route('/api/config', configRoutes);
app.route('/lint', lintRoutes);
app.route('/image', aiImageRoutes);
app.route('/mcp', mcpRoutes);
// Conditionally register Yjs WebSocket routes (only in Bun runtime)
if (bunRuntime && yjsRoutes) {
  app.route('/ws', yjsRoutes);
}

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'Inkweld API',
    version: config.version,
    status: 'running',
  });
});

// Legacy OAuth providers endpoint for backward compatibility
app.get('/providers', (c) => {
  return c.json({
    providers: {
      github: config.github.enabled,
    },
  });
});

// API documentation placeholder
app.get('/api', (c) => {
  return c.json({
    message: 'Inkweld API - Hono version',
    version: config.version,
    endpoints: {
      auth: '/api/auth',
      csrf: '/csrf',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      documents: '/api/v1/projects/:username/:slug/docs',
      elements: '/api/v1/projects/:username/:slug/elements',
      files: '/api/v1/projects/:username/:slug/files',
      epub: '/api/v1/projects/:username/:slug/epub',
      images: '/api/images',
      snapshots: '/api/snapshots',
      health: '/health',
      config: '/api/config',
    },
  });
});

// OpenAPI documentation endpoint
app.get('/api/openapi.json', async (c) => {
  const spec = await generateSpecs(app, {
    documentation: {
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API',
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

// Error handler (must be last)
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Initialize database and start server
async function bootstrap() {
  try {
    await setupDatabase();
    console.log('Database initialized');

    const port = config.port;
    console.log(`Inkweld backend ready on port ${port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only run bootstrap if not in test mode AND not in Workers
// In Workers, the app is exported and database is handled per-request
const isWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
if (process.env.NODE_ENV !== 'test' && !isWorkers) {
  bootstrap();
}

export default {
  port: config.port,
  fetch: app.fetch,
  websocket, // Required for Bun WebSocket support
};

export { app };
