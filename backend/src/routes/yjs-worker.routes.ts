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
import type { Context } from 'hono';
import { logger } from '../services/logger.service';
import type { CloudflareAppContext, DurableObjectStub } from '../types/cloudflare';

const yjsWorkerLog = logger.child('YjsWorker');
const app = new Hono<CloudflareAppContext>();

/** Result of resolving a project's Durable Object stub from a documentId. */
type ProjectStubResult =
  { ok: true; stub: DurableObjectStub; projectId: string } | { ok: false; error: Response };

/**
 * Validate a `documentId` (`username:slug:...`) and resolve the Durable Object
 * stub for the project that owns it. Shared by the WebSocket upgrade route and
 * the HTTP diagnostics proxy so the validation + namespace lookup lives in one
 * place. Returns an error Response to short-circuit when the input is invalid
 * or the binding is missing.
 */
function resolveProjectStub(
  c: Context<CloudflareAppContext>,
  documentId: string | undefined
): ProjectStubResult {
  if (!documentId) {
    return { ok: false, error: c.json({ error: 'Missing documentId parameter' }, 400) };
  }

  // Validate document format (username:slug:documentId or username:slug:elements)
  const parts = documentId.split(':');
  if (parts.length < 2) {
    return {
      ok: false,
      error: c.json({ error: `Invalid document ID format: ${documentId}` }, 400),
    };
  }

  const namespace = c.env.YJS_PROJECTS;
  if (!namespace) {
    yjsWorkerLog.error('YJS_PROJECTS binding not found');
    return { ok: false, error: c.json({ error: 'WebSocket service unavailable' }, 503) };
  }

  // One Durable Object per PROJECT (username:slug). idFromName ensures the same
  // project always maps to the same instance, so ALL documents in a project
  // share one DO = massive cost savings.
  const projectId = `${parts[0]}:${parts[1]}`;
  const stub = namespace.get(namespace.idFromName(projectId));
  return { ok: true, stub, projectId };
}

/**
 * WebSocket endpoint for Yjs collaboration (Cloudflare Workers)
 * Routes to a Durable Object instance for the project
 * The DO handles authentication over the WebSocket connection
 */
app.get('/yjs', async (c) => {
  const documentId = c.req.query('documentId');

  try {
    const result = resolveProjectStub(c, documentId);
    if (!result.ok) return result.error;

    yjsWorkerLog.debug(
      `Routing WebSocket to project DO: ${result.projectId} for document: ${documentId}`
    );

    // Forward the request to the Durable Object
    // The DO will handle authentication over the WebSocket connection
    return await result.stub.fetch(c.req.raw);
  } catch (error) {
    yjsWorkerLog.error('Error routing to Durable Object', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * HTTP API proxy to the Durable Object.
 *
 * The DO exposes /api/stats, /api/elements, /api/document etc. but these are
 * only reachable via internal stub.fetch() calls (MCP tools). This route
 * forwards external HTTP requests to the DO so they can be hit with curl /
 * browser for diagnostics. Auth is handled by the DO itself (Bearer token).
 *
 * Usage:
 *   GET /api/v1/ws/yjs/do/stats?documentId=user:slug:elements
 *   GET /api/v1/ws/yjs/do/elements?documentId=user:slug:elements
 *   GET /api/v1/ws/yjs/do/document?documentId=user:slug:docId
 */
app.get('/yjs/do/:endpoint', async (c) => {
  const endpoint = c.req.param('endpoint');
  const documentId = c.req.query('documentId');

  try {
    const result = resolveProjectStub(c, documentId);
    if (!result.ok) return result.error;

    // Rewrite the path so the DO's handleHttpApi sees /api/<endpoint>
    const url = new URL(c.req.url);
    url.pathname = `/api/${endpoint}`;
    const req = new Request(url.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
    });

    return await result.stub.fetch(req);
  } catch (error) {
    yjsWorkerLog.error('Error routing HTTP to Durable Object', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
