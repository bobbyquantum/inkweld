import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { generateCSRFToken } from '../middleware/csrf';

const csrfRoutes = new Hono();

// Schema definitions
const CSRFTokenResponseSchema = z.object({
  token: z.string().describe('CSRF token to include in state-changing requests'),
});

const ErrorResponseSchema = z.object({
  error: z.string().describe('Error message'),
});

// Get CSRF token
csrfRoutes.get(
  '/token',
  describeRoute({
    description:
      'Returns a CSRF token for the current session. Required for state-changing operations.',
    tags: ['Security'],
    responses: {
      200: {
        description: 'CSRF token retrieved successfully',
        content: {
          'application/json': {
            schema: resolver(CSRFTokenResponseSchema),
          },
        },
      },
      401: {
        description: 'No active session',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    const req = c.req.raw as any;
    const session = req.session;

    if (!session) {
      return c.json({ error: 'No session' }, 401);
    }

    // Generate and store token in session
    if (!session.csrfToken) {
      session.csrfToken = generateCSRFToken();
    }

    return c.json({ token: session.csrfToken }, 200);
  }
);

export default csrfRoutes;
