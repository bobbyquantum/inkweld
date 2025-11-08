/**
 * User management OpenAPI schemas
 */
import { z } from 'zod';
import 'zod-openapi/extend';
import { UserSchema } from './common.schemas';

// Re-export UserSchema for convenience
export { UserSchema };

/**
 * User registration request (duplicate of auth but may have different fields)
 * @component UserRegisterRequest
 */
export const UserRegisterRequestSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .openapi({ example: 'johndoe', description: 'Username (minimum 3 characters)' }),
    email: z
      .string()
      .email()
      .openapi({ example: 'john@example.com', description: 'Email address' }),
    password: z
      .string()
      .min(6)
      .openapi({ example: 'secret123', description: 'Password (minimum 6 characters)' }),
  })
  .openapi({ ref: 'UserRegisterRequest' });

/**
 * User search response
 * @component UsersSearchResponse
 */
export const UsersSearchResponseSchema = z
  .object({
    users: z.array(UserSchema),
    total: z.number().openapi({ example: 10 }),
  })
  .openapi({ ref: 'UsersSearchResponse' });

/**
 * Paginated users response
 * @component PaginatedUsersResponse
 */
export const PaginatedUsersResponseSchema = z
  .object({
    users: z.array(UserSchema),
    total: z.number().openapi({ example: 100 }),
    page: z.number().openapi({ example: 1 }),
    pageSize: z.number().openapi({ example: 10 }),
    totalPages: z.number().openapi({ example: 10 }),
  })
  .openapi({ ref: 'PaginatedUsersResponse' });

/**
 * Username availability response
 * @component UsernameAvailabilityResponse
 */
export const UsernameAvailabilityResponseSchema = z
  .object({
    available: z.boolean().openapi({ example: true }),
  })
  .openapi({ ref: 'UsernameAvailabilityResponse' });
