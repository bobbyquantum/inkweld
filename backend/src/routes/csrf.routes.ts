import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { getCSRFToken } from '../middleware/csrf';
import { logger } from '../services/logger.service';

const csrfLog = logger.child('CSRF');
const csrfRoutes = new OpenAPIHono();

// Schema definitions
const CSRFTokenResponseSchema = z
  .object({
    token: z
      .string()
      .openapi({ example: 'abc123...', description: 'CSRF token for form submissions' }),
  })
  .openapi('CSRFTokenResponse');

const CSRFErrorResponseSchema = z
  .object({
    message: z
      .string()
      .openapi({ example: 'Failed to generate token', description: 'Error message' }),
    error: z.string().optional().openapi({ description: 'Error details' }),
  })
  .openapi('CSRFErrorResponse');

// CSRF token endpoint route
const tokenRoute = createRoute({
  method: 'get',
  path: '/token',
  tags: ['Security'],
  operationId: 'getCSRFToken',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CSRFTokenResponseSchema,
        },
      },
      description: 'CSRF token generated successfully',
    },
    500: {
      content: {
        'application/json': {
          schema: CSRFErrorResponseSchema,
        },
      },
      description: 'Failed to generate CSRF token',
    },
  },
});

csrfRoutes.openapi(tokenRoute, async (c) => {
  try {
    const session = c.get('session') as { userId?: string } | undefined;
    if (!session?.userId) {
      return c.json({ message: 'Authentication required' }, 500);
    }

    // Generate and store a token for this user
    const token = getCSRFToken(session.userId);

    return c.json({ token }, 200);
  } catch (error: unknown) {
    csrfLog.error('Error generating CSRF token', error);
    return c.json(
      {
        message: 'Failed to generate CSRF token',
      },
      500
    );
  }
});

export default csrfRoutes;
