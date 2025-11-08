import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const mcpRoutes = new Hono();

// Schema
const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// MCP Server-Sent Events endpoint
mcpRoutes.get(
  '/sse',
  describeRoute({
    description: 'Model Context Protocol Server-Sent Events stream',
    tags: ['MCP'],
    responses: {
      200: {
        description: 'SSE stream of MCP events',
        content: {
          'text/event-stream': {
            schema: {
              type: 'string',
            },
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      501: {
        description: 'MCP not implemented',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    return c.json(
      {
        error: 'Model Context Protocol not yet implemented in Hono backend',
      },
      501
    );
  }
);

export default mcpRoutes;
