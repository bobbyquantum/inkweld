import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import type { AppContext } from '../types/context';

const mcpRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all mcp routes
mcpRoutes.use('*', requireAuth);

// Schema
const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('MCPError');

// MCP Server-Sent Events endpoint route
const sseRoute = createRoute({
  method: 'get',
  path: '/sse',
  tags: ['MCP'],
  operationId: 'getMCPEventStream',
  responses: {
    200: {
      content: {
        'text/event-stream': {
          schema: {
            type: 'string',
          },
        },
      },
      description: 'SSE stream of MCP events',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not authenticated',
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'MCP not implemented',
    },
  },
});

mcpRoutes.openapi(sseRoute, async (c) => {
  return c.json(
    {
      error: 'Model Context Protocol not yet implemented in Hono backend',
    },
    501
  );
});

export default mcpRoutes;
