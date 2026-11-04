/**
 * Authentication-related OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';
import { trimCharacters } from '../utils/string-utils';
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
  'privacy',
  'terms',
  'delete-account',
  'share',
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

/** Shortest username a new account may have. */
export const USERNAME_MIN_LENGTH = 3;

/**
 * Longest username a new account may have: GitHub's limit, so no GitHub
 * login is too long.
 */
export const USERNAME_MAX_LENGTH = 39;

/**
 * Characters a new username may use: ASCII letters, digits, `_` (together
 * `\w`, which without the `u` flag is exactly `[A-Za-z0-9_]`) and `-`.
 * Usernames name storage directories and keys and are part of Yjs document
 * ids (`username:slug:…`), so path separators, `:`, dots and spaces are left
 * out. The registration form checks the same rule
 * (`frontend/src/app/utils/username-rules.ts`).
 */
export const USERNAME_PATTERN = /^[\w-]+$/;

/**
 * Names the server uses beside usernames, which new accounts can't take
 * either: the storage directories and key prefixes next to the users' own
 * (`avatars`, `backgrounds`, `banners`, `branding`) and `worldbuilding`,
 * which can start a document id (`worldbuilding:username:slug:…`).
 */
export const RESERVED_STORAGE_NAMES = [
  'avatars',
  'backgrounds',
  'banners',
  'branding',
  'worldbuilding',
] as const;

/**
 * Whether a name is reserved for an app route or for the server's storage.
 * Compared ignoring case.
 */
export function isReservedUsername(username: string): boolean {
  const name = username.toLowerCase();
  return (
    (RESERVED_USERNAMES as readonly string[]).includes(name) ||
    (RESERVED_STORAGE_NAMES as readonly string[]).includes(name)
  );
}

/**
 * Whether a name fits the length and character rule for new usernames
 * (reserved names aside). Only names given to new accounts are checked:
 * accounts created before the rule keep their usernames, and sign-in and
 * lookups accept any stored name.
 */
export function fitsUsernameRule(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

/**
 * Reduce a name from an identity provider to a lower-case username stem:
 * letters, digits, `-` and `_`, at most 32 characters (room for a numeric
 * suffix), and not reserved. Returns `fallback` when fewer than
 * {@link USERNAME_MIN_LENGTH} characters remain or the stem is reserved.
 */
export function usernameBase(value: string, fallback: string): string {
  const separated = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, '-')
    .replaceAll(/-{2,}/g, '-');
  const username = trimCharacters(separated, '-_').slice(0, 32);
  if (username.length >= USERNAME_MIN_LENGTH && !isReservedUsername(username)) {
    return username;
  }
  return fallback;
}

/** Username for a new account: the rule above, and not a reserved route. */
export const NewUsernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN, {
    message: 'Usernames may only contain letters, numbers, hyphens and underscores',
  })
  .refine((val) => !isReservedUsername(val), {
    message: 'This username is reserved and cannot be used',
  });

/**
 * User registration request
 * @component RegisterRequest
 */
export const RegisterRequestSchema = z
  .object({
    username: NewUsernameSchema.openapi({
      description:
        'Username: 3 to 39 characters, using only ASCII letters, digits, hyphens and ' +
        'underscores. It must differ from every existing username in more than letter case.',
      example: 'johndoe',
    }),
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
    acceptedPolicyVersion: z
      .string()
      .max(64)
      .optional()
      .openapi({
        description:
          'The SystemFeatures.policyVersion the user agreed to. Required (and must be ' +
          'current) when SystemFeatures.requirePolicyAcceptance is true.',
        example: '3f2a9c0d1b4e5f67',
      }),
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
      oidc: z.boolean(),
    }),
  })
  .openapi('OAuthProvidersResponse');
