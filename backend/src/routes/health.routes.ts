import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';

const healthRoutes = new Hono();

// Schema definitions
const HealthResponseSchema = z.object({
  status: z.string().describe('Health status'),
  timestamp: z.string().describe('Current server timestamp'),
  uptime: z.number().describe('Server uptime in seconds'),
});

const ReadyResponseSchema = z.object({
  status: z.string().describe('Readiness status'),
  timestamp: z.string().describe('Current server timestamp'),
});

// Health check route
healthRoutes.get(
  '/',
  describeRoute({
    description: 'Returns the health status of the API server',
    tags: ['Health'],
    responses: {
      200: {
        description: 'Server is healthy',
        content: {
          'application/json': {
            schema: resolver(HealthResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }
);

// Readiness check route
healthRoutes.get(
  '/ready',
  describeRoute({
    description: 'Returns the readiness status of the API server',
    tags: ['Health'],
    responses: {
      200: {
        description: 'Server is ready to accept requests',
        content: {
          'application/json': {
            schema: resolver(ReadyResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    // Check if database is connected
    // Could add more health checks here
    return c.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  }
);

export default healthRoutes;
