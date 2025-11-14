/**
 * Centralized route configuration for all runtime environments
 * ONLY includes routes that are safe for ALL runtimes (Bun, Node.js, Workers)
 * Specialized routes (WebSocket/Yjs) are registered per-app
 */
import type { Hono } from 'hono';

// Import COMMON routes that work across all runtimes
import authRoutes from '../routes/auth.routes';
import userRoutes from '../routes/user.routes';
import projectRoutes from '../routes/project.routes';
import healthRoutes from '../routes/health.routes';
import configRoutes from '../routes/config.routes';
import csrfRoutes from '../routes/csrf.routes';
import imageRoutes from '../routes/image.routes';
import snapshotRoutes from '../routes/snapshot.routes';
import documentRoutes from '../routes/document.routes';
import elementRoutes from '../routes/element.routes';
import fileRoutes from '../routes/file.routes';
import epubRoutes from '../routes/epub.routes';
import lintRoutes from '../routes/lint.routes';
import aiImageRoutes from '../routes/ai-image.routes';
import mcpRoutes from '../routes/mcp.routes';

/**
 * Register common API routes that work in all runtime environments
 * Each app can then register its own specialized routes (WebSocket, etc.)
 * @param app - Hono app instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCommonRoutes(app: Hono<any>): void {
  // Authentication routes
  app.route('/api/v1/auth', authRoutes);

  // User management
  app.route('/api/v1/users', userRoutes);

  // Project routes (projects, documents, elements, files, epub, snapshots, images)
  app.route('/api/v1/projects', projectRoutes);
  app.route('/api/v1/projects', documentRoutes);
  app.route('/api/v1/projects', elementRoutes);
  app.route('/api/v1/projects', fileRoutes);
  app.route('/api/v1/projects', epubRoutes);
  app.route('/api/v1/projects', snapshotRoutes);
  app.route('/api/v1/projects', imageRoutes);

  // System endpoints
  app.route('/api/v1/health', healthRoutes);
  app.route('/api/v1/config', configRoutes);
  app.route('/api/v1/csrf', csrfRoutes);

  // AI services
  app.route('/api/v1/ai/lint', lintRoutes);
  app.route('/api/v1/ai/image', aiImageRoutes);
  app.route('/api/v1/ai/mcp', mcpRoutes);
}
