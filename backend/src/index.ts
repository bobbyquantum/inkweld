import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config/env';
import { setupDatabase } from './config/database';
import { setupSession } from './middleware/session';
import { setupCSRF } from './middleware/csrf';
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

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

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

// Session middleware
app.use('*', setupSession());

// CSRF protection middleware
app.use('*', setupCSRF());

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/csrf', csrfRoutes);
app.route('/api/user', userRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/images', imageRoutes);
app.route('/api/snapshots', snapshotRoutes);
app.route('/api/health', healthRoutes);
app.route('/api/config', configRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'Inkweld API',
    version: config.version,
    status: 'running',
  });
});

// API documentation placeholder
app.get('/api', (c) => {
  return c.json({
    message: 'Inkweld API - Hono version',
    version: config.version,
    endpoints: {
      auth: '/api/auth',
      csrf: '/api/csrf',
      user: '/api/user',
      projects: '/api/projects',
      images: '/api/images',
      snapshots: '/api/snapshots',
      health: '/api/health',
      config: '/api/config',
    },
  });
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

bootstrap();

export default {
  port: config.port,
  fetch: app.fetch,
};

export { app };
