import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { config } from '../config/env';
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
    // Get the secret from config
    const secret = config.databaseKey || 'inkweld-csrf-secret';

    // Generate a token using our cross-platform function
    const token = await generateCSRFToken(secret);

    // Return the token in the response body
    return c.json({ token }, 200);
  } catch (error: unknown) {
    csrfLog.error('Error generating CSRF token', error);
    return c.json(
      {
        message: 'Failed to generate CSRF token',
        error: config.nodeEnv === 'production' ? undefined : String(error),
      },
      500
    );
  }
});

export default csrfRoutes;
