/**
 * Cloudflare Workers runtime entrypoint
 * Uses D1 for database operations and Durable Objects for WebSocket/Yjs
 */
import workerApp from './worker-app';
import type { D1Database, ScheduledController } from '@cloudflare/workers-types';
import { makeD1Database } from './db/d1';
import { oidcAuthService } from './services/oidc-auth.service';

// Export Durable Object classes
export { YjsProject } from './durable-objects/yjs-project.do';

// Export main app as default
export default {
  fetch: workerApp.fetch,
  async scheduled(_event: ScheduledController, env: { DB: D1Database }): Promise<void> {
    await oidcAuthService.cleanupTransactions(makeD1Database(env.DB));
  },
};
