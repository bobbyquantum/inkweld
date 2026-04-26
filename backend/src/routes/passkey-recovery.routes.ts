/**
 * Passkey Recovery routes — magic-link enrolment for users who've lost
 * access to all their passkeys.
 *
 * Mounted at `/api/v1/auth/passkey-recovery` and intentionally separate
 * from `/api/v1/auth/passkeys`:
 *
 *   - These endpoints are *anonymous* (no session required) — the recovery
 *     token IS the proof of identity. The /passkeys router runs through
 *     `optionalAuth` and several handlers require a session, so layering
 *     this onto that file would muddle the auth model.
 *
 *   - These endpoints are gated on `EMAIL_RECOVERY_ENABLED && PASSKEYS_ENABLED`.
 *     The /passkeys router only checks PASSKEYS_ENABLED. Keeping a separate
 *     router lets the gates be expressed declaratively as middleware.
 *
 * Threat-model decisions (see PR #1029):
 *   - Recovery only ENROLS a new credential; it never deletes existing ones.
 *     A stolen email link must not be able to evict trusted devices.
 *   - Recovery does not issue a session. The user must complete a normal
 *     passkey login afterwards. This caps the blast radius of email
 *     interception to "attacker can register one extra device they control"
 *     rather than "attacker can read your projects".
 *   - The token is consumed only after the WebAuthn ceremony verifies, so
 *     a network glitch mid-flow doesn't burn the link.
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { configService } from '../services/config.service';
import { passkeyRecoveryService } from '../services/passkey-recovery.service';
import { rpFromContext } from './passkey.routes';
import {
  PasskeyRecoveryRequestSchema,
  PasskeyRecoveryStartRequestSchema,
  PasskeyRecoveryFinishRequestSchema,
  PasskeyRecoveryFinishResponseSchema,
  PasskeyOptionsSchema,
} from '../schemas/passkey.schemas';
import { errorResponse, MessageResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

const passkeyRecoveryRoutes = new OpenAPIHono<AppContext>();

/**
 * Gate every endpoint behind both flags. Returning 404 (rather than 403)
 * matches the password-reset routes and avoids confirming that recovery
 * even exists on this deployment when it's disabled.
 */
passkeyRecoveryRoutes.use('*', async (c, next) => {
  const db = c.get('db');
  const passkeysEnabled = await configService.getBoolean(db, 'PASSKEYS_ENABLED');
  const recoveryEnabled = await configService.getBoolean(db, 'EMAIL_RECOVERY_ENABLED');
  if (!passkeysEnabled || !recoveryEnabled) {
    return c.json({ error: 'Passkey recovery is disabled on this server' }, 404);
  }
  return next();
});

// ---------------------------------------------------------------------------
// POST /request — issue a recovery email
// ---------------------------------------------------------------------------
const requestRoute = createRoute({
  method: 'post',
  path: '/request',
  tags: ['Authentication'],
  operationId: 'requestPasskeyRecovery',
  // Anonymous endpoint — a locked-out user has no session by definition.
  // Opting out of the global bearerAuth requirement keeps the generated
  // SDK from sending an Authorization header on this call.
  security: [],
  request: {
    body: {
      content: { 'application/json': { schema: PasskeyRecoveryRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'If an account with this email exists, a passkey recovery link has been sent.',
    },
    400: errorResponse('Invalid request'),
    404: errorResponse('Passkey recovery is disabled on this server'),
  },
});

passkeyRecoveryRoutes.openapi(requestRoute, async (c) => {
  const db = c.get('db');
  const { email } = c.req.valid('json');

  // Always return the same response regardless of outcome (prevent enumeration).
  // Failure modes (unknown email, email pipeline disabled, transient SMTP error)
  // are logged server-side for operator visibility but not surfaced to the client.
  await passkeyRecoveryService.requestRecovery(db, email);

  return c.json(
    {
      message: 'If an account with this email exists, a passkey recovery link has been sent.',
    },
    200
  );
});

// ---------------------------------------------------------------------------
// POST /start — exchange a recovery token for WebAuthn registration options
// ---------------------------------------------------------------------------
const startRoute = createRoute({
  method: 'post',
  path: '/start',
  tags: ['Authentication'],
  operationId: 'startPasskeyRecovery',
  // Anonymous — the recovery token IS the proof of identity here.
  security: [],
  request: {
    body: {
      content: { 'application/json': { schema: PasskeyRecoveryStartRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PasskeyOptionsSchema } },
      description: 'WebAuthn registration options for the holder of the recovery token',
    },
    400: errorResponse('Invalid or expired recovery link'),
    404: errorResponse('Passkey recovery is disabled on this server'),
  },
});

passkeyRecoveryRoutes.openapi(startRoute, async (c) => {
  const db = c.get('db');
  const { token } = c.req.valid('json');

  const result = await passkeyRecoveryService.redeemStart(db, token, rpFromContext(c));
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  // PasskeyOptionsSchema is a passthrough record; cast through unknown to
  // satisfy the OpenAPI response type without enumerating the WebAuthn spec.
  return c.json(result.options as unknown as Record<string, unknown>, 200);
});

// ---------------------------------------------------------------------------
// POST /finish — verify the WebAuthn response, persist the new credential,
// and burn the recovery token. Does NOT issue a session.
// ---------------------------------------------------------------------------
const finishRoute = createRoute({
  method: 'post',
  path: '/finish',
  tags: ['Authentication'],
  operationId: 'finishPasskeyRecovery',
  // Anonymous — the recovery token IS the proof of identity here.
  security: [],
  request: {
    body: {
      content: { 'application/json': { schema: PasskeyRecoveryFinishRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PasskeyRecoveryFinishResponseSchema } },
      description: 'Passkey enrolled successfully — user must now log in normally',
    },
    400: errorResponse('Invalid or expired recovery link'),
    404: errorResponse('Passkey recovery is disabled on this server'),
  },
});

passkeyRecoveryRoutes.openapi(finishRoute, async (c) => {
  const db = c.get('db');
  const { token, response, name } = c.req.valid('json');

  const result = await passkeyRecoveryService.redeemFinish(
    db,
    token,
    response as unknown as RegistrationResponseJSON,
    rpFromContext(c),
    name
  );

  if (!result.success || !result.userId || !result.passkey) {
    return c.json({ error: result.error || 'Passkey registration failed' }, 400);
  }

  // We deliberately don't return a session token. The frontend prompts
  // the user to log in with the freshly-enrolled passkey, which exercises
  // the same code path as any normal login and re-confirms possession.
  const p = result.passkey;
  return c.json(
    {
      verified: true as const,
      passkey: {
        id: p.id,
        name: p.name ?? null,
        deviceType: p.deviceType ?? null,
        backedUp: !!p.backedUp,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt ?? null,
      },
    },
    200
  );
});

export default passkeyRecoveryRoutes;
