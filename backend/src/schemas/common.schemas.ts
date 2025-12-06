/**
 * Common OpenAPI schemas shared across routes
 * These schemas are registered as reusable components in the OpenAPI spec
 */
import { z } from '@hono/zod-openapi';

/**
 * Path parameters for project routes
 */
export const ProjectPathParamsSchema = z.object({
  username: z.string().openapi({ example: 'johndoe', description: 'Username' }),
  slug: z.string().openapi({ example: 'my-novel', description: 'Project slug' }),
});

/**
 * Standard error response
 * @component ErrorResponse
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('ErrorResponse', { example: { error: 'An error occurred' } });

/**
 * Standard message response
 * @component MessageResponse
 */
export const MessageResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi('MessageResponse', { example: { message: 'Operation successful' } });

/**
 * User information (without sensitive data)
 * @component User
 */
export const UserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    name: z.string().nullable().optional(),
    email: z.string().optional(),
    approved: z.boolean().optional(),
    enabled: z.boolean(),
    isAdmin: z.boolean().optional(),
  })
  .openapi('User', {
    example: {
      id: 'user-123',
      username: 'johndoe',
      name: 'John Doe',
      email: 'john@example.com',
      approved: true,
      enabled: true,
      isAdmin: false,
    },
  });
