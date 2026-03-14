import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../middleware/auth';
import { eq, and } from 'drizzle-orm';
import { users, projects } from '../db/schema';
import { config } from '../config/env';
import type { AppContext } from '../types/context';
import { ErrorResponseSchema } from '../schemas/common.schemas';

const adminStatsRoutes = new OpenAPIHono<AppContext>();
adminStatsRoutes.use('*', requireAdmin);

const SystemStatsSchema = z
  .object({
    userCount: z.number().openapi({ example: 42, description: 'Total registered users' }),
    projectCount: z.number().openapi({ example: 100, description: 'Total projects' }),
    pendingUserCount: z.number().openapi({ example: 3, description: 'Users awaiting approval' }),
    version: z.string().openapi({ example: '0.1.0', description: 'Server version' }),
    uptime: z.number().openapi({ example: 86400, description: 'Server uptime in seconds' }),
    runtime: z.string().openapi({ example: 'bun', description: 'Runtime environment' }),
  })
  .openapi('SystemStats');

const systemStatsRoute = createRoute({
  method: 'get',
  path: '/stats',
  tags: ['Admin'],
  summary: 'Get system statistics',
  description: 'Returns aggregate system health statistics (admin only)',
  operationId: 'adminGetSystemStats',
  responses: {
    200: {
      description: 'System statistics',
      content: {
        'application/json': {
          schema: SystemStatsSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminStatsRoutes.openapi(systemStatsRoute, async (c) => {
  const db = c.get('db');

  const [userCount, projectCount, pendingCount] = await Promise.all([
    db.$count(users),
    db.$count(projects),
    db.$count(users, and(eq(users.approved, false), eq(users.enabled, true))),
  ]);

  return c.json(
    {
      userCount,
      projectCount,
      pendingUserCount: pendingCount,
      version: config.version,
      uptime: process.uptime(),
      runtime: typeof Bun !== 'undefined' ? 'bun' : 'node',
    },
    200
  );
});

export { adminStatsRoutes };
