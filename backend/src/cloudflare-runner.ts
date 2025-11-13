/**
 * Cloudflare Workers runtime entrypoint
 * Uses D1 for database operations and Durable Objects for WebSocket/Yjs
 */
import workerApp from './worker-app';

// Export Durable Object classes
export { YjsProject } from './durable-objects/yjs-project.do';

// Export main app as default
export default workerApp;
