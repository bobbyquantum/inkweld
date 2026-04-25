/**
 * Passkey (WebAuthn) related OpenAPI schemas.
 *
 * The actual `PublicKeyCredentialCreationOptionsJSON` /
 * `PublicKeyCredentialRequestOptionsJSON` shapes from `@simplewebauthn/server`
 * are deeply nested and unstable across spec revisions, so we expose them as
 * a passthrough JSON object rather than enumerating every field.
 */
import { z } from '@hono/zod-openapi';
import { UserSchema } from './common.schemas';

/**
 * Opaque WebAuthn options object passed straight to the browser.
 * @component PasskeyOptions
 */
export const PasskeyOptionsSchema = z
  .record(z.string(), z.unknown())
  .openapi('PasskeyOptions', { description: 'Opaque WebAuthn options JSON' });

/**
 * Opaque WebAuthn credential response from the browser.
 * @component PasskeyResponse
 */
export const PasskeyResponseSchema = z
  .record(z.string(), z.unknown())
  .openapi('PasskeyResponse', { description: 'Opaque WebAuthn credential JSON' });

/**
 * Body for finishing passkey registration.
 * @component PasskeyRegisterFinishRequest
 */
export const PasskeyRegisterFinishRequestSchema = z
  .object({
    response: PasskeyResponseSchema,
    name: z
      .string()
      .max(100)
      .optional()
      .openapi({ description: 'Optional user-supplied passkey label' }),
  })
  .openapi('PasskeyRegisterFinishRequest');

/**
 * Body for finishing passkey authentication.
 * @component PasskeyLoginFinishRequest
 */
export const PasskeyLoginFinishRequestSchema = z
  .object({
    response: PasskeyResponseSchema,
  })
  .openapi('PasskeyLoginFinishRequest');

/**
 * A single passkey as exposed to the user.
 * @component Passkey
 */
export const PasskeySchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    deviceType: z.string().nullable().optional(),
    backedUp: z.boolean(),
    createdAt: z.number(),
    lastUsedAt: z.number().nullable().optional(),
  })
  .openapi('Passkey');

/**
 * @component PasskeyListResponse
 */
export const PasskeyListResponseSchema = z
  .object({
    passkeys: z.array(PasskeySchema),
  })
  .openapi('PasskeyListResponse');

/**
 * @component PasskeyRegisterFinishResponse
 */
export const PasskeyRegisterFinishResponseSchema = z
  .object({
    verified: z.boolean(),
    passkey: PasskeySchema.optional(),
  })
  .openapi('PasskeyRegisterFinishResponse');

/**
 * @component PasskeyLoginFinishResponse
 */
export const PasskeyLoginFinishResponseSchema = z
  .object({
    user: UserSchema,
    token: z.string(),
  })
  .openapi('PasskeyLoginFinishResponse');

/**
 * @component PasskeyRenameRequest
 */
export const PasskeyRenameRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
  })
  .openapi('PasskeyRenameRequest');
