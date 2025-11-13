/**
 * Cloudflare Workers app configuration using D1 database
 * This file must NOT import bun:sqlite or better-sqlite3
 * Supports Durable Objects for WebSocket/Yjs collaboration
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { generateSpecs } from 'hono-openapi';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { d1DatabaseMiddleware, type D1AppContext } from './middleware/database.d1.middleware';

// Routes (must be Worker-safe: no bun:sqlite, no LevelDB, no ws-only deps)
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import projectRoutes from './routes/project.routes';
import healthRoutes from './routes/health.routes';
import configRoutes from './routes/config.routes';
import imageRoutes from './routes/image.routes';
import snapshotRoutes from './routes/snapshot.routes';
import documentRoutes from './routes/document.routes';
import elementRoutes from './routes/element.routes';
import fileRoutes from './routes/file.routes';
import epubRoutes from './routes/epub.routes';
import lintRoutes from './routes/lint.routes';
import aiImageRoutes from './routes/ai-image.routes';
import mcpRoutes from './routes/mcp.routes';
import yjsWorkerRoutes from './routes/yjs-worker.routes';

const app = new Hono<D1AppContext>();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches D1 database to context
app.use('*', d1DatabaseMiddleware);

// CORS
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
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Routes (same paths as main backend)
app.route('/', authRoutes);
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

// WebSocket routes - uses Durable Objects for Yjs collaboration
app.route('/ws', yjsWorkerRoutes);

// Root + metadata
app.get('/', (c) =>
  c.json({ name: 'Inkweld API (Workers)', version: config.version, status: 'running' })
);

app.get('/api/openapi.json', async (c) => {
  const spec = await generateSpecs(app, {
    documentation: {
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API (Workers)',
      },
      servers: [{ url: 'https://example.com', description: 'Cloudflare Workers' }],
    },
  });
  return c.json(spec);
});

// Error & 404
app.onError(errorHandler);
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
