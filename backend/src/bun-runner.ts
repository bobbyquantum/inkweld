/**
 * Bun runtime entrypoint
 * Uses native bun:sqlite for database operations
 */
import bunApp, { app } from './bun-app';
import { setupBunDatabase } from './db/bun-sqlite';
import { config } from './config/env';

// Initialize database before starting server
const dbPath =
  process.env.DB_DATABASE === ':memory:' ? ':memory:' : process.env.DB_PATH || './data/inkweld.db';

console.log('[bun-runner] Initializing database:', dbPath);

try {
  await setupBunDatabase(dbPath);
  console.log('[bun-runner] Database initialized successfully');
} catch (error) {
  console.error('[bun-runner] Failed to initialize database:', error);
  process.exit(1);
}

console.log(`[bun-runner] Server starting on port ${config.port}`);

export default bunApp;
