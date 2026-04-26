/**
 * Authentication-related OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';
import { UserSchema } from './common.schemas';

/**
 * Reserved paths that cannot be used as usernames (to prevent URL conflicts)
 */
export const RESERVED_USERNAMES = [
  'admin',
  'setup',
  'reset',
  'create-project',
  'welcome',
  'register',
  'approval-pending',
  'unavailable',
  'forgot-password',
  'reset-password',
  'recover-passkey',
  'about',
  'settings',
  'messages',
  'oauth',
  'api',
  'assets',
  'static',
  '_next',
  'health',
  'ws',
] as const;

/**
 * User registration request
 * @component RegisterRequest
 */
export const RegisterRequestSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .refine(
        (val) =>
          !RESERVED_USERNAMES.includes(val.toLowerCase() as (typeof RESERVED_USERNAMES)[number]),
        { message: 'This username is reserved and cannot be used' }
      )
      .openapi({ description: 'Username (minimum 3 characters)', example: 'johndoe' }),
    password: z
      .string()
      .min(6)
      .optional()
      .openapi({
        description:
          'Password (minimum 6 characters). Optional: required only when ' +
          'PASSWORD_LOGIN_ENABLED is true on the server. Passwordless registrations ' +
          'must immediately enrol a passkey via the WebAuthn registration flow.',
        example: 'password123',
      }),
    email: z
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
    enrolmentToken: z
      .string()
      .optional()
      .openapi({
        description:
          'Short-lived (15 min) WebAuthn-enrolment-only JWT. Issued only when ' +
          'requiresApproval=true AND password login is disabled, so the user can ' +
          'attach a passkey to their pending account before being parked at ' +
          '/approval-pending. Cannot be used for any other authenticated endpoint.',
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
