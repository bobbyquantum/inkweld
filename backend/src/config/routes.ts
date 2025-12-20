/**
 * Centralized route configuration for all runtime environments
 * ONLY includes routes that are safe for ALL runtimes (Bun, Node.js, Workers)
 * Specialized routes (WebSocket/Yjs) are registered per-app
 */

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
import lintRoutes from '../routes/lint.routes';
import aiImageRoutes from '../routes/ai-image.routes';
import mcpRoutes from '../routes/mcp.routes';
import mcpKeyRoutes from '../routes/mcp-keys.routes';
import mediaRoutes from '../routes/media.routes';
import { publishedFileRoutes } from '../routes/published-file.routes';
import { shareRoutes } from '../routes/share.routes';
import adminRoutes from '../routes/admin.routes';
import { adminConfigRoutes } from '../routes/admin-config.routes';

/**
 * Register common API routes that work in all runtime environments
 * Each app can then register its own specialized routes (WebSocket, etc.)
 * @param app - Hono or OpenAPIHono app instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCommonRoutes(app: any): void {
  // Authentication routes
  app.route('/api/v1/auth', authRoutes);

  // User management
  app.route('/api/v1/users', userRoutes);

  // Admin routes (requires admin role)
  app.route('/api/v1/admin', adminRoutes);
  app.route('/api/v1/admin/config', adminConfigRoutes);

  // Project routes (projects, documents, elements, images)
  app.route('/api/v1/projects', projectRoutes);
  app.route('/api/v1/projects', documentRoutes);
  app.route('/api/v1/projects', elementRoutes);
  app.route('/api/v1/projects', imageRoutes);

  // Snapshots have their own base path to avoid conflicts
  app.route('/api/v1/snapshots', snapshotRoutes);

  // System endpoints - start with just health
  app.route('/api/v1/health', healthRoutes);
  app.route('/api/v1/config', configRoutes);
  app.route('/api/v1/csrf', csrfRoutes);

  // AI services
  app.route('/api/v1/ai/lint', lintRoutes);
  app.route('/api/v1/ai/image', aiImageRoutes);
  app.route('/api/v1/ai/mcp', mcpRoutes);

  // MCP key management (for frontend to create/manage API keys)
  app.route('/api/v1/mcp-keys', mcpKeyRoutes);

  // Media sync endpoints (list/download project media files)
  app.route('/api/v1/media', mediaRoutes);

  // Published files (exports/publishing)
  app.route('/api/v1/projects', publishedFileRoutes);

  // Public share endpoints (no auth required)
  app.route('/api/v1/share', shareRoutes);
}
