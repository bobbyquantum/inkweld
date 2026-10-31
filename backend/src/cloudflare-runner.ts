/**
 * Cloudflare Workers runtime entrypoint
 * Uses D1 for database operations and Durable Objects for WebSocket/Yjs
 */
import { registerCanvasRenderAssets } from './services/canvas-render/assets';
import { workerCanvasRenderAssets } from './services/canvas-render/assets.worker';
import workerApp from './worker-app';

registerCanvasRenderAssets(workerCanvasRenderAssets);

// Export Durable Object classes
export { YjsProject } from './durable-objects/yjs-project.do';

// Export main app as default
export default workerApp;
