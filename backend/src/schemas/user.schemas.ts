/**
 * User management OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';
import { UserSchema } from './common.schemas';

// Re-export UserSchema for convenience
export { UserSchema };

/**
 * User registration request (duplicate of auth but may have different fields)
 * @component UserRegisterRequest
 */
export const UserRegisterRequestSchema = z
  .object({
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
  })
  .openapi('UserRegisterRequest');

/**
 * User search response
 * @component UsersSearchResponse
 */
export const UsersSearchResponseSchema = z
  .object({
    users: z.array(UserSchema),
    total: z.number(),
  })
  .openapi('UsersSearchResponse');

/**
 * Paginated users response
 * @component PaginatedUsersResponse
 */
export const PaginatedUsersResponseSchema = z
  .object({
    users: z.array(UserSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  })
  .openapi('PaginatedUsersResponse');

/**
 * Username availability response
 * @component UsernameAvailabilityResponse
 */
export const UsernameAvailabilityResponseSchema = z
  .object({
    available: z.boolean(),
  })
  .openapi('UsernameAvailabilityResponse');
