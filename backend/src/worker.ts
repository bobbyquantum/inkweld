/**
 * Cloudflare Workers entry point
 *
 * This creates a Workers-compatible version of the backend without Bun-specific features.
 * WebSocket support (Yjs) requires Durable Objects configuration in wrangler.toml.
 */

// Import just the app, not the Bun-specific export
import { app } from './index';

// Export the Hono app for Workers runtime
export default app;
