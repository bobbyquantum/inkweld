import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context, Hono } from 'hono';
import { optionalAuth } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { passkeyService } from '../services/passkey.service';
import { configService } from '../services/config.service';
import { rpFromContext } from '../utils/webauthn-utils';
import {
  PasskeyOptionsSchema,
  PasskeyRegisterFinishRequestSchema,
  PasskeyRegisterFinishResponseSchema,
  PasskeyLoginFinishRequestSchema,
  PasskeyLoginFinishResponseSchema,
  PasskeyListResponseSchema,
  PasskeyRenameRequestSchema,
} from '../schemas/passkey.schemas';
import { errorResponse, MessageResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';
import type { UserPasskey } from '../db/schema';
import type { User } from '../db/schema/users';

const passkeyRoutes = new OpenAPIHono<AppContext>();

// Guard: reject all requests when passkeys are disabled system-wide.
passkeyRoutes.use('*', async (c, next) => {
  const db = c.get('db');
  const enabled = await configService.getBoolean(db, 'PASSKEYS_ENABLED');
  if (!enabled) {
    return c.json({ error: 'Passkey authentication is disabled' }, 403);
  }
  return next();
});

// Populate c.get('user') for any request that carries a valid session.
// Login routes are anonymous, so we use optionalAuth (not requireAuth) here —
// individual handlers enforce authentication via inline `if (!user)` guards.
passkeyRoutes.use('*', optionalAuth);

// ─────────────────────────────────────────────────────────────────────────────
// RP config — derived per-request so it works across runtimes (Workers vs Bun).
// rpFromContext is imported from utils/webauthn-utils and re-exported for
// any callers that previously imported it from this module.
// ─────────────────────────────────────────────────────────────────────────────
export { rpFromContext } from '../utils/webauthn-utils';

function passkeyToDto(p: UserPasskey) {
  return {
    id: p.id,
    name: p.name ?? null,
    deviceType: p.deviceType ?? null,
    backedUp: !!p.backedUp,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt ?? null,
  };
}

/**
 * Resolve the user for the two registration endpoints.
 *
 * Accepts EITHER:
 *   - a full-scope session (the normal case: an approved user adding another
 *     passkey from account settings), already attached to context by
 *     optionalAuth, OR
 *   - an enrolment-scoped session (a freshly-registered, not-yet-approved
 *     user attaching their first credential — see authService.createEnrolmentSession).
 *
 * optionalAuth deliberately skips enrolment-scoped tokens so it never grants
 * them broader visibility, so we re-resolve here when c.get('user') is empty.
 *
 * Returns null on auth failure; callers translate that to a 401.
 */
async function resolveRegistrationUser(c: Context): Promise<User | null> {
  const db = c.get('db');
  const ctxUser = c.get('user');
  if (ctxUser) {
    return (await userService.findById(db, ctxUser.id)) ?? null;
  }
  const sessionResult = await authService.getSession(c);
  if (sessionResult?.scope !== 'enrol') {
    return null;
  }
  // Enrolment scope is the only path through which an unapproved/disabled
  // user reaches a register handler. The token itself is the proof — we
  // do NOT additionally check canLogin here, because by definition this
  // user has not yet been approved.
  return (await userService.findById(db, sessionResult.userId)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

const registerStartRoute = createRoute({
  method: 'post',
  path: '/register/start',
  tags: ['Passkeys'],
  operationId: 'startPasskeyRegistration',
  responses: {
    200: {
      content: { 'application/json': { schema: PasskeyOptionsSchema } },
      description: 'WebAuthn registration options',
    },
    401: errorResponse('Not authenticated'),
  },
});

passkeyRoutes.openapi(registerStartRoute, async (c) => {
  const db = c.get('db');
  const user = await resolveRegistrationUser(c);
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const options = await passkeyService.startRegistration(db, user, rpFromContext(c));
  return c.json(options as unknown as Record<string, unknown>, 200);
});

const registerFinishRoute = createRoute({
  method: 'post',
  path: '/register/finish',
  tags: ['Passkeys'],
  operationId: 'finishPasskeyRegistration',
  request: {
    body: {
      content: {
        'application/json': { schema: PasskeyRegisterFinishRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: PasskeyRegisterFinishResponseSchema },
      },
      description: 'Registration verified',
    },
    400: errorResponse('Verification failed'),
    401: errorResponse('Not authenticated'),
  },
});

passkeyRoutes.openapi(registerFinishRoute, async (c) => {
  const db = c.get('db');
  const user = await resolveRegistrationUser(c);
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const { response, name } = c.req.valid('json');
  const result = await passkeyService.finishRegistration(
    db,
    user,
    response as unknown as import('@simplewebauthn/server').VerifyRegistrationResponseOpts['response'],
    rpFromContext(c),
    name
  );
  if (!result.verified || !result.passkey) {
    return c.json({ error: result.error || 'Verification failed' }, 400);
  }
  return c.json({ verified: true, passkey: passkeyToDto(result.passkey) }, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Authentication (anonymous — usernameless / discoverable credential flow)
// ─────────────────────────────────────────────────────────────────────────────

const loginStartRoute = createRoute({
  method: 'post',
  path: '/login/start',
  tags: ['Passkeys'],
  operationId: 'startPasskeyLogin',
  // Anonymous endpoint — opt out of the global bearerAuth requirement so the
  // generated SDK doesn't add an Authorization header on this call.
  security: [],
  responses: {
    200: {
      content: { 'application/json': { schema: PasskeyOptionsSchema } },
      description: 'WebAuthn authentication options',
    },
  },
});

passkeyRoutes.openapi(loginStartRoute, async (c) => {
  const db = c.get('db');
  const options = await passkeyService.startAuthentication(db, rpFromContext(c));
  return c.json(options as unknown as Record<string, unknown>, 200);
});

const loginFinishRoute = createRoute({
  method: 'post',
  path: '/login/finish',
  tags: ['Passkeys'],
  operationId: 'finishPasskeyLogin',
  // Anonymous endpoint — opt out of the global bearerAuth requirement.
  security: [],
  request: {
    body: {
      content: {
        'application/json': { schema: PasskeyLoginFinishRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: PasskeyLoginFinishResponseSchema },
      },
      description: 'Login successful',
    },
    401: errorResponse('Authentication failed'),
    403: errorResponse('Account disabled or pending approval'),
  },
});

passkeyRoutes.openapi(loginFinishRoute, async (c) => {
  const db = c.get('db');
  const { response } = c.req.valid('json');
  const result = await passkeyService.finishAuthentication(
    db,
    response as unknown as import('@simplewebauthn/server').VerifyAuthenticationResponseOpts['response'],
    rpFromContext(c)
  );

  if (!result.verified || !result.userId) {
    return c.json({ error: result.error || 'Authentication failed' }, 401);
  }

  const user = await userService.findById(db, result.userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }
  if (!user.enabled) return c.json({ error: 'Account is disabled' }, 403);
  if (!user.approved) return c.json({ error: 'Account pending approval' }, 403);

  const token = await authService.createSession(c, user);

  return c.json(
    {
      user: {
        id: user.id,
        username: user.username || '',
        name: user.name,
        email: user.email || undefined,
        approved: user.approved,
        enabled: user.enabled,
        isAdmin: user.isAdmin,
        hasAvatar: user.hasAvatar,
      },
      token,
    },
    200
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Management (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Passkeys'],
  operationId: 'listPasskeys',
  responses: {
    200: {
      content: { 'application/json': { schema: PasskeyListResponseSchema } },
      description: 'List of passkeys for the current user',
    },
    401: errorResponse('Not authenticated'),
  },
});

passkeyRoutes.openapi(listRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const list = await passkeyService.listForUser(db, user.id);
  return c.json({ passkeys: list.map(passkeyToDto) }, 200);
});

// Wrangler/workerd plain handlers for parametrised DELETE and PATCH routes.
// OpenAPIHono sub-router path matching breaks for `/:id` paths in workerd,
// so these are registered directly on the parent app via passkeyManagementHandlers().
// The openapi() declarations below still provide schema documentation.

/**
 * Register passkey management routes (DELETE/PATCH /:id) directly on the
 * parent Hono app so that workerd's router can resolve the parametrised paths.
 * The sub-router (passkeyRoutes) doesn't propagate /:id paths in Wrangler.
 */
export function passkeyManagementHandlers(app: Hono<AppContext>): void {
  const handler = (method: 'delete' | 'patch') => async (c: Context<AppContext>) => {
    const db = c.get('db');

    // Passkeys-enabled guard (mirrors the sub-router middleware)
    const enabled = await configService.getBoolean(db, 'PASSKEYS_ENABLED');
    if (!enabled) return c.json({ error: 'Passkey authentication is disabled' }, 403);

    // Resolve the current user (same logic as optionalAuth)
    const sessionUser = await authService.getUserFromSession(db, c);
    if (sessionUser && userService.canLogin(sessionUser)) c.set('user', sessionUser);
    const user = c.get('user');
    if (!user) return c.json({ error: 'Not authenticated' }, 401);

    const id = c.req.param('id') as string;

    if (method === 'delete') {
      const ok = await passkeyService.deleteForUser(db, user.id, id);
      if (!ok) return c.json({ error: 'Passkey not found' }, 404);
      return c.json({ message: 'Passkey deleted' }, 200);
    }

    // PATCH — validate the request body against the same Zod schema the
    // sub-router's openapi route uses, so workerd traffic gets identical
    // validation guarantees to Bun traffic.
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = PasskeyRenameRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }
    const ok = await passkeyService.renameForUser(db, user.id, id, parsed.data.name);
    if (!ok) return c.json({ error: 'Passkey not found' }, 404);
    return c.json({ message: 'Passkey renamed' }, 200);
  };

  app.delete('/api/v1/auth/passkeys/:id', handler('delete'));
  app.patch('/api/v1/auth/passkeys/:id', handler('patch'));
}

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Passkeys'],
  operationId: 'deletePasskey',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Passkey deleted',
    },
    401: errorResponse('Not authenticated'),
    404: errorResponse('Passkey not found'),
  },
});

passkeyRoutes.openapi(deleteRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const { id } = c.req.valid('param');
  const ok = await passkeyService.deleteForUser(db, user.id, id);
  if (!ok) return c.json({ error: 'Passkey not found' }, 404);
  return c.json({ message: 'Passkey deleted' }, 200);
});

const renameRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Passkeys'],
  operationId: 'renamePasskey',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': { schema: PasskeyRenameRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Passkey renamed',
    },
    401: errorResponse('Not authenticated'),
    404: errorResponse('Passkey not found'),
  },
});

passkeyRoutes.openapi(renameRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const { id } = c.req.valid('param');
  const { name } = c.req.valid('json');
  const ok = await passkeyService.renameForUser(db, user.id, id, name);
  if (!ok) return c.json({ error: 'Passkey not found' }, 404);
  return c.json({ message: 'Passkey renamed' }, 200);
});

export default passkeyRoutes;
