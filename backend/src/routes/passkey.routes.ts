import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { requireAuth } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { passkeyService, type PasskeyRpConfig } from '../services/passkey.service';
import { config } from '../config/env';
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

const passkeyRoutes = new OpenAPIHono<AppContext>();

// Auth-protected paths: registration + management. Login paths are anonymous.
passkeyRoutes.use('/register/*', requireAuth);
passkeyRoutes.use('/', requireAuth);
passkeyRoutes.use('/:id', requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// RP config — derived per-request so it works across runtimes (Workers vs Bun).
// ─────────────────────────────────────────────────────────────────────────────

function rpFromContext(c: Context): PasskeyRpConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (c as any).env as Record<string, string | undefined> | undefined;

  const rpId = env?.WEBAUTHN_RP_ID || config.webauthn.rpId;
  const rpName = env?.WEBAUTHN_RP_NAME || config.webauthn.rpName;

  // Origins — prefer ALLOWED_ORIGINS env (Workers), fall back to config.
  const envOrigins = env?.ALLOWED_ORIGINS;
  const origins = envOrigins
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) || [...config.allowedOrigins];

  return { rpId, rpName, origins };
}

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
  const ctxUser = c.get('user');
  if (!ctxUser) return c.json({ error: 'Not authenticated' }, 401);
  const user = await userService.findById(db, ctxUser.id);
  if (!user) return c.json({ error: 'User not found' }, 401);
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
  const ctxUser = c.get('user');
  if (!ctxUser) return c.json({ error: 'Not authenticated' }, 401);
  const user = await userService.findById(db, ctxUser.id);
  if (!user) return c.json({ error: 'User not found' }, 401);
  const { response, name } = c.req.valid('json');
  const result = await passkeyService.finishRegistration(
    db,
    user,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response as any,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response as any,
    rpFromContext(c)
  );

  if (!result.verified || !result.userId) {
    return c.json({ error: result.error || 'Authentication failed' }, 401);
  }

  const user = await userService.findById(db, result.userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }
  if (!userService.canLogin(user)) {
    if (!user.enabled) return c.json({ error: 'Account is disabled' }, 403);
    if (!user.approved) return c.json({ error: 'Account pending approval' }, 403);
    return c.json({ error: 'Account cannot log in' }, 403);
  }

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
