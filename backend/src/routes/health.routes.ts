import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { config } from '../config/env';
import { PROTOCOL_VERSION, MIN_CLIENT_VERSION } from '../config/protocol';

const healthRoutes = new OpenAPIHono();

// Schema definitions
const HealthResponseSchema = z
  .object({
    status: z.string().openapi({ example: 'ok', description: 'Health status' }),
    timestamp: z
      .string()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Current server timestamp' }),
    uptime: z.number().openapi({ example: 123.45, description: 'Server uptime in seconds' }),
    version: z.string().openapi({ example: '0.1.0', description: 'Server version' }),
    protocolVersion: z.number().openapi({
      example: 1,
      description: 'API protocol version for client compatibility checking',
    }),
    minClientVersion: z.string().openapi({
      example: '0.1.0',
      description: 'Minimum client version required to connect to this server',
    }),
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
    version: config.version,
    protocolVersion: PROTOCOL_VERSION,
    minClientVersion: MIN_CLIENT_VERSION,
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
