/**
 * Cloudflare Workers entry point
 * 
 * This is a minimal adapter for Cloudflare Workers deployment.
 * TypeORM doesn't work in Workers, so for production Workers deployment,
 * you'll need to:
 * 
 * 1. Switch to Drizzle ORM with D1 bindings
 * 2. Use R2 for file storage (instead of filesystem)
 * 3. Use KV or Durable Objects for sessions
 * 4. Use Durable Objects for Yjs collaboration
 * 
 * For now, this returns a placeholder response.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*',
  credentials: true,
}));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    message: 'Inkweld Workers backend is running',
    note: 'This is a minimal Workers deployment. Full functionality requires D1, R2, and Durable Objects setup.',
  });
});

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Inkweld API (Workers)',
    version: '0.1.0',
    status: 'minimal',
    message: 'This Workers deployment needs migration from TypeORM to D1/Drizzle',
    nextSteps: [
      'Set up Cloudflare D1 database',
      'Migrate from TypeORM to Drizzle ORM',
      'Configure R2 bucket for file storage',
      'Set up Durable Objects for Yjs collaboration',
    ],
  });
});

// Catch-all for unsupported routes
app.all('*', (c) => {
  return c.json({
    error: 'Not configured for Workers deployment yet',
    message: 'This backend currently requires Bun runtime with TypeORM/SQLite',
  }, 501);
});

export default app;
