import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../config/env';

const csrfRoutes = new Hono();

// Schema definitions
const CSRFTokenResponseSchema = z.object({
  token: z.string().describe('CSRF token for form submissions'),
});

// CSRF token endpoint - generates a token using Bun.CSRF
csrfRoutes.get(
  '/token',
  describeRoute({
    description: 'Get a CSRF token for form submissions',
    tags: ['Security'],
    responses: {
      200: {
        description: 'CSRF token generated successfully',
        content: {
          'application/json': {
            schema: resolver(CSRFTokenResponseSchema),
          },
        },
      },
      500: {
        description: 'Failed to generate CSRF token',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                message: z.string().describe('Error message'),
                error: z.string().optional().describe('Error details'),
              })
            ),
          },
        },
      },
    },
  }),
  (c) => {
    try {
      // Get the secret from config
      const secret = config.session.secret || 'inkweld-csrf-secret';

      // Generate a token using Bun.CSRF - default expiry is 1 hour
      const token = Bun.CSRF.generate(secret, {
        encoding: 'hex',
        expiresIn: 60 * 60 * 1000, // 1 hour in milliseconds
      });

      // Return the token in the response body
      return c.json({ token });
    } catch (error: unknown) {
      console.error('Error generating CSRF token:', error);
      return c.json(
        {
          message: 'Failed to generate CSRF token',
          error: config.nodeEnv === 'production' ? undefined : String(error),
        },
        500
      );
    }
  }
);

export default csrfRoutes;
