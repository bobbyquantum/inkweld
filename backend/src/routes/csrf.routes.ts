import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';

const csrfRoutes = new Hono();

// Schema definitions
const CSRFInfoResponseSchema = z.object({
  message: z.string().describe('Information about CSRF protection'),
  protection: z.string().describe('Type of CSRF protection in use'),
});

// CSRF info endpoint (for backward compatibility)
// Note: Hono's built-in CSRF middleware handles protection automatically
// via Origin and Sec-Fetch-Site headers. No token is needed.
csrfRoutes.get(
  '/token',
  describeRoute({
    description:
      'Returns information about CSRF protection. Note: This API uses automatic CSRF protection via Origin headers, so no token is required.',
    tags: ['Security'],
    responses: {
      200: {
        description: 'CSRF information retrieved successfully',
        content: {
          'application/json': {
            schema: resolver(CSRFInfoResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json(
      {
        message: 'CSRF protection is enabled via Origin and Sec-Fetch-Site header validation',
        protection: 'automatic',
      },
      200
    );
  }
);

export default csrfRoutes;
