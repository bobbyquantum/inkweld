/**
 * Cloudflare Workers-specific Yjs WebSocket routes
 * Uses Durable Objects for stateful document collaboration
 * One DO per PROJECT (username:slug) manages all documents + elements
 *
 * WebSocket Authentication Protocol:
 * - Client connects to WebSocket (no auth required for upgrade)
 * - Client sends JWT token as first text message
 * - DO validates token and project access
 * - DO responds with "authenticated" or "access-denied:reason"
 * - Only after auth does Yjs sync begin
 */

import { Hono } from 'hono';
import type { CloudflareAppContext } from '../types/cloudflare';

const app = new Hono<CloudflareAppContext>();

/**
 * WebSocket endpoint for Yjs collaboration (Cloudflare Workers)
 * Routes to a Durable Object instance for the project
 * The DO handles authentication over the WebSocket connection
 */
app.get('/yjs', async (c) => {
  const documentId = c.req.query('documentId');

  if (!documentId) {
    return c.json({ error: 'Missing documentId parameter' }, 400);
  }

  // Validate document format (username:slug:documentId or username:slug:elements)
  const parts = documentId.split(':');
  if (parts.length < 2) {
    return c.json({ error: `Invalid document ID format: ${documentId}` }, 400);
  }

  const [username, slug] = parts;
  const projectId = `${username}:${slug}`;

  try {
    // Get Durable Object namespace binding
    const namespace = c.env.YJS_PROJECTS;
    if (!namespace) {
      console.error('YJS_PROJECTS binding not found');
      return c.json({ error: 'WebSocket service unavailable' }, 503);
    }

    // Get or create Durable Object instance for this PROJECT
    // Using idFromName ensures the same project always gets the same instance
    // This means ALL documents in the project share one DO = massive cost savings!
    const id = namespace.idFromName(projectId);
    const stub = namespace.get(id);

    console.log(`Routing WebSocket to project DO: ${projectId} for document: ${documentId}`);

    // Forward the request to the Durable Object
    // The DO will handle authentication over the WebSocket connection
    return stub.fetch(c.req.raw);
  } catch (error) {
    console.error('Error routing to Durable Object:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
