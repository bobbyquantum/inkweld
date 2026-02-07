/**
 * MCP Streamable HTTP Transport Routes
 *
 * Implements the MCP Streamable HTTP transport (protocol version 2025-06-18):
 * - POST: Handle JSON-RPC requests, respond with application/json
 * - GET: Return 405 Method Not Allowed (no persistent SSE on Cloudflare Workers)
 * - DELETE: Terminate session (optional, returns 405 if not supported)
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { AppContext } from '../types/context';
import { mcpAuth, handleMcpRequest } from '../mcp';

const mcpRoutes = new OpenAPIHono<AppContext>();

// Schema for OpenAPI docs
const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('MCPError');

const JsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]).optional(), // Optional for notifications
    method: z.string(),
    params: z.record(z.string(), z.any()).optional(),
  })
  .openapi('JsonRpcRequest');

const JsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    result: z.any().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.any().optional(),
      })
      .optional(),
  })
  .openapi('JsonRpcResponse');

// ============================================
// MCP Streamable HTTP POST Endpoint
// ============================================

const mcpJsonRpcRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpJsonRpc',
  description:
    'MCP Streamable HTTP endpoint. Send JSON-RPC messages via POST. Authenticate with Bearer token or X-API-Key header.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: JsonRpcRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: JsonRpcResponseSchema,
        },
      },
      description: 'JSON-RPC response',
    },
    202: {
      description: 'Accepted (for notifications and responses)',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Invalid or missing authorization',
    },
  },
});

// ============================================
// MCP Streamable HTTP GET Endpoint (SSE - Not Supported)
// ============================================

const mcpSseRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpSse',
  description:
    'MCP SSE endpoint for server-initiated messages. Opens a stream that stays alive for server-to-client events.',
  responses: {
    200: {
      description: 'SSE stream opened successfully',
    },
  },
});

// ============================================
// MCP Streamable HTTP DELETE Endpoint (Session Termination)
// ============================================

const mcpDeleteRoute = createRoute({
  method: 'delete',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpDeleteSession',
  description: 'Terminate an MCP session. Returns 204 on success.',
  responses: {
    204: {
      description: 'Session terminated successfully',
    },
  },
});

// GET - SSE endpoint for server-initiated messages
// NOTE: Must be registered BEFORE auth middleware to handle independently
// MCP Inspector requires this to be open before sending further requests
mcpRoutes.openapi(mcpSseRoute, async (c) => {
  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Create a readable stream that stays open
  // On Cloudflare Workers, this will eventually timeout (30s) but that's OK
  // The client just needs to know SSE is "supported"
  const stream = new ReadableStream({
    start(controller) {
      // Send an initial comment to establish the connection
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));

      // Keep-alive ping every 15 seconds
      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      // Store interval for cleanup (Cloudflare will handle timeout)
    },
    cancel() {
      // SSE connection closed
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

// DELETE - Session termination (returns 204 No Content)
// NOTE: Must be registered BEFORE auth middleware to handle independently
// Since sessions are stateless (JWT tokens), we just acknowledge the termination
mcpRoutes.openapi(mcpDeleteRoute, (c) => {
  // No action needed - JWT sessions are stateless
  // Client can discard the token on their end
  return c.body(null, 204);
});

// Apply MCP auth middleware only to POST requests
mcpRoutes.use('/', async (c, next) => {
  // Only apply auth to POST requests
  if (c.req.method === 'POST') {
    return mcpAuth(c, next);
  }
  return next();
});

// POST - Main JSON-RPC handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Handler types are complex with OpenAPI
mcpRoutes.openapi(mcpJsonRpcRoute, handleMcpRequest as any);

export default mcpRoutes;
