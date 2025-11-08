/**
 * Common OpenAPI schemas shared across routes
 * These schemas are registered as reusable components in the OpenAPI spec
 */
import { z } from 'zod';
import 'zod-openapi/extend';

/**
 * Standard error response
 * @component ErrorResponse
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred' }),
  })
  .openapi({ ref: 'ErrorResponse' });

/**
 * Standard message response
 * @component MessageResponse
 */
export const MessageResponseSchema = z
  .object({
    message: z.string().openapi({ example: 'Operation successful' }),
  })
  .openapi({ ref: 'MessageResponse' });

/**
 * User information (without sensitive data)
 * @component User
 */
export const UserSchema = z
  .object({
    id: z.string().openapi({ example: 'user-123' }),
    username: z.string().openapi({ example: 'johndoe' }),
    name: z.string().nullable().optional().openapi({ example: 'John Doe' }),
    email: z.string().optional().openapi({ example: 'john@example.com' }),
    approved: z.boolean().optional().openapi({ example: true }),
    enabled: z.boolean().openapi({ example: true }),
  })
  .openapi({ ref: 'User' });
