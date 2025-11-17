/**
 * Authentication-related OpenAPI schemas
 */
import { z } from 'zod';
import 'zod-openapi/extend';
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
      .openapi({ example: 'johndoe', description: 'Username (minimum 3 characters)' }),
    password: z
      .string()
      .min(6)
      .openapi({ example: 'secret123', description: 'Password (minimum 6 characters)' }),
  })
  .extend({
    email: z.string().email().optional().openapi({
      example: 'john@example.com',
      description: 'Email address (optional)',
    }),
    name: z.string().optional().openapi({ example: 'John Doe', description: 'User display name' }),
    captchaToken: z.string().optional().openapi({
      example: '03AGdBq...',
      description: 'reCAPTCHA token (required if reCAPTCHA is enabled)',
    }),
  })
  .openapi({ ref: 'RegisterRequest' });

/**
 * User registration response
 * @component RegisterResponse
 */
export const RegisterResponseSchema = z
  .object({
    message: z.string().openapi({ example: 'Registration successful. You can now log in.' }),
    user: UserSchema,
    token: z.string().optional().openapi({
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      description: 'Authentication token (only present if auto-login is enabled)',
    }),
    requiresApproval: z.boolean().optional().openapi({
      example: false,
      description: 'Whether the user account requires admin approval before being enabled',
    }),
  })
  .openapi({ ref: 'RegisterResponse' });

/**
 * User login request
 * @component LoginRequest
 */
export const LoginRequestSchema = z
  .object({
    username: z.string().min(1).openapi({ example: 'johndoe', description: 'Username' }),
    password: z.string().min(1).openapi({ example: 'secret123', description: 'Password' }),
  })
  .openapi({ ref: 'LoginRequest' });

/**
 * User login response
 * @component LoginResponse
 */
export const LoginResponseSchema = z
  .object({
    message: z.string().optional().openapi({ example: 'Login successful' }),
    user: UserSchema,
    token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      description: 'JWT authentication token',
    }),
  })
  .openapi({ ref: 'LoginResponse' });

/**
 * OAuth providers list response
 * @component OAuthProvidersResponse
 */
export const OAuthProvidersResponseSchema = z
  .object({
    providers: z.object({
      github: z
        .boolean()
        .openapi({ example: false, description: 'Whether GitHub OAuth is enabled' }),
    }),
  })
  .openapi({ ref: 'OAuthProvidersResponse' });
