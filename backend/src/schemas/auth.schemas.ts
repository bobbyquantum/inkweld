/**
 * Authentication-related OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';
import { UserSchema } from './common.schemas';

/**
 * User registration request
 * @component RegisterRequest
 */
export const RegisterRequestSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .openapi({ description: 'Username (minimum 3 characters)', example: 'johndoe' }),
    password: z
      .string()
      .min(6)
      .openapi({ description: 'Password (minimum 6 characters)', example: 'password123' }),
    email: z
      .string()
      .email()
      .optional()
      .openapi({ description: 'Email address (optional)', example: 'john@example.com' }),
    name: z
      .string()
      .optional()
      .openapi({ description: 'Display name (optional)', example: 'John Doe' }),
  })
  .openapi('RegisterRequest');

/**
 * User registration response
 * @component RegisterResponse
 */
export const RegisterResponseSchema = z
  .object({
    message: z
      .string()
      .openapi({ description: 'Registration status message', example: 'Registration successful' }),
    user: UserSchema,
    token: z.string().optional().openapi({
      description: 'JWT authentication token (if auto-login enabled)',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    }),
    requiresApproval: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether account requires admin approval', example: false }),
  })
  .openapi('RegisterResponse');

/**
 * User login request
 * @component LoginRequest
 */
export const LoginRequestSchema = z
  .object({
    username: z.string().min(1).openapi({ description: 'Username', example: 'johndoe' }),
    password: z.string().min(1).openapi({ description: 'Password', example: 'password123' }),
  })
  .openapi('LoginRequest');

/**
 * User login response
 * @component LoginResponse
 */
export const LoginResponseSchema = z
  .object({
    message: z
      .string()
      .optional()
      .openapi({ description: 'Login status message', example: 'Login successful' }),
    user: UserSchema,
    token: z.string().openapi({
      description: 'JWT authentication token',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    }),
  })
  .openapi('LoginResponse');

/**
 * OAuth providers list response
 * @component OAuthProvidersResponse
 */
export const OAuthProvidersResponseSchema = z
  .object({
    providers: z.object({
      github: z.boolean(),
    }),
  })
  .openapi('OAuthProvidersResponse');
