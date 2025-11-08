import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../config/env.js';

const configRoutes = new Hono();

// Schema definition
const ConfigResponseSchema = z.object({
  userApprovalRequired: z.boolean().describe('Whether admin approval is required for new users'),
  githubEnabled: z.boolean().describe('Whether GitHub OAuth is enabled'),
});

// Get app configuration
configRoutes.get(
  '/',
  describeRoute({
    description: 'Get public application configuration',
    tags: ['Configuration'],
    responses: {
      200: {
        description: 'Application configuration',
        content: {
          'application/json': {
            schema: resolver(ConfigResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      userApprovalRequired: config.userApprovalRequired,
      githubEnabled: config.github.enabled,
    });
  }
);

export default configRoutes;
