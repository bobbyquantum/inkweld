import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';

const healthRoutes = new OpenAPIHono();

// Schema definitions
const HealthResponseSchema = z
  .object({
    status: z.string().openapi({ example: 'ok', description: 'Health status' }),
    timestamp: z
      .string()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Current server timestamp' }),
    uptime: z.number().openapi({ example: 123.45, description: 'Server uptime in seconds' }),
  })
  .openapi('HealthResponse');

const ReadyResponseSchema = z
  .object({
    status: z.string().openapi({ example: 'ready', description: 'Readiness status' }),
    timestamp: z
      .string()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Current server timestamp' }),
  })
  .openapi('ReadyResponse');

// Health check route
const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  operationId: 'checkHealth',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
      description: 'Server is healthy',
    },
  },
});

healthRoutes.openapi(healthRoute, (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness check route
const readyRoute = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['Health'],
  operationId: 'checkReadiness',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ReadyResponseSchema,
        },
      },
      description: 'Server is ready to accept requests',
    },
  },
});

healthRoutes.openapi(readyRoute, (c) => {
  // Check if database is connected
  // Could add more health checks here
  return c.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

export default healthRoutes;
