/**
 * Cloudflare Workers-specific Yjs WebSocket routes
 * Uses Durable Objects for stateful document collaboration
 * One DO per PROJECT (username:slug) manages all documents + elements
 */

import { Hono } from 'hono';
import type { CloudflareAppContext } from '../types/cloudflare';
import { authService } from '../services/auth.service';
import { projectService } from '../services/project.service';

const app = new Hono<CloudflareAppContext>();

/**
 * WebSocket endpoint for Yjs collaboration (Cloudflare Workers)
 * Routes to a Durable Object instance for the project
 * The DO internally routes messages to the correct document
 */
app.get('/yjs', async (c) => {
  const documentId = c.req.query('documentId');

  if (!documentId) {
    return c.json({ error: 'Missing documentId parameter' }, 400);
  }

  // Authentication check
  const db = c.get('db');
  const user = await authService.getUserFromSession(db, c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Validate document format (username:slug:documentId or username:slug:elements)
  const parts = documentId.split(':');
  if (parts.length < 2) {
    return c.json({ error: `Invalid document ID format: ${documentId}` }, 400);
  }

  const [username, slug] = parts;
  const projectId = `${username}:${slug}`;

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Check access - owner or collaborator
  if (project.userId !== user.id) {
    // TODO: Check collaborator access when implemented
    return c.json({ error: 'Forbidden' }, 403);
  }

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
    // The request includes documentId query param so the DO knows which doc to route to
    return stub.fetch(c.req.raw);
  } catch (error) {
    console.error('Error routing to Durable Object:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
