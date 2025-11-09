import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../config/env';

const csrfRoutes = new Hono();

// Schema definitions
const CSRFTokenResponseSchema = z.object({
  token: z.string().describe('CSRF token for form submissions'),
});

/**
 * Generate a CSRF token - works in both Bun and Workers
 */
async function generateCSRFToken(secret: string): Promise<string> {
  // Check if we're in Bun runtime
  // Use globalThis to avoid bundler issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bunRuntime = (globalThis as any).Bun;
  if (bunRuntime && bunRuntime.CSRF) {
    // Use Bun.CSRF API
    return bunRuntime.CSRF.generate(secret, {
      encoding: 'hex',
      expiresIn: 60 * 60 * 1000, // 1 hour
    });
  }

  // Fallback for Workers: generate a simple signed token
  const timestamp = Date.now();
  const expiresAt = timestamp + 60 * 60 * 1000; // 1 hour from now
  const data = `${timestamp}:${expiresAt}:${crypto.randomUUID()}`;

  // Create HMAC signature using Web Crypto API (available in Workers)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Convert data to hex (Workers-compatible)
  const dataHex = Array.from(encoder.encode(data))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${dataHex}.${signatureHex}`;
}

// CSRF token endpoint - generates a token compatible with both Bun and Workers
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
  async (c) => {
    try {
      // Get the secret from config
      const secret = config.session.secret || 'inkweld-csrf-secret';

      // Generate a token using our cross-platform function
      const token = await generateCSRFToken(secret);

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
