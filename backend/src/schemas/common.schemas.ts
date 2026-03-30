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

/** Single OpenAPI error response entry — exported for one-off custom codes */
export function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: ErrorResponseSchema } },
  } as const;
}

/** Common error response sets for OpenAPI route definitions */
export const errorResponses = {
  /** 401 Unauthorized */
  unauthorized: { 401: errorResponse('Unauthorized') },
  /** 401 Not authenticated */
  notAuthenticated: { 401: errorResponse('Not authenticated') },
  /** 403 Forbidden - Admin access required */
  adminForbidden: { 403: errorResponse('Forbidden - Admin access required') },
  /** 403 Access denied */
  accessDenied: { 403: errorResponse('Access denied') },
  /** 403 Not authorized */
  notAuthorized: { 403: errorResponse('Not authorized') },
  /** 404 Not found (generic) */
  notFound: (entity: string) => ({ 404: errorResponse(`${entity} not found`) }),
  /** 400 Invalid request */
  badRequest: { 400: errorResponse('Invalid request') },

  /** 401 + 403 admin combo */
  admin: {
    401: errorResponse('Unauthorized'),
    403: errorResponse('Forbidden - Admin access required'),
  },
  /** 401 + 403 auth combo */
  auth: {
    401: errorResponse('Not authenticated'),
    403: errorResponse('Access denied'),
  },
  /** 401 + 403 + 404 admin + entity combo */
  adminEntity: (entity: string) => ({
    401: errorResponse('Unauthorized'),
    403: errorResponse('Forbidden - Admin access required'),
    404: errorResponse(`${entity} not found`),
  }),
  /** 401 + 403 + 404 auth + entity combo */
  authEntity: (entity: string) => ({
    401: errorResponse('Not authenticated'),
    403: errorResponse('Access denied'),
    404: errorResponse(`${entity} not found`),
  }),
};

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
    hasAvatar: z.boolean().optional(),
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
      hasAvatar: false,
    },
  });
