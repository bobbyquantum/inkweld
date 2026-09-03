import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import {
  appearanceService,
  BACKGROUND_PRESET_IDS,
  BACKGROUND_SURFACES,
  brandingSlotKey,
  isBackgroundSurface,
} from '../services/appearance.service';
import { imageService } from '../services/image.service';
import { getStorageService } from '../services/storage.service';
import { userService } from '../services/user.service';
import { errorResponse, errorResponses, MessageResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';

/**
 * Appearance routes.
 *
 * The config and branding-image endpoints are deliberately **unauthenticated**:
 * the login page has to resolve its background before anyone can sign in, which
 * also means an admin-uploaded background is world-readable. Everything under
 * `/user-background` and `/preference` is authenticated and scoped to the
 * caller — a personal background is not a public identity asset the way an
 * avatar is, so there is no `/:username/` form of it.
 */
const appearanceRoutes = new OpenAPIHono<AppContext>();

// Per-user endpoints require a session; the config + branding endpoints above
// them must stay public.
appearanceRoutes.use('/user-background', requireAuth);
appearanceRoutes.use('/preference', requireAuth);

const SurfaceBackgroundSchema = z
  .object({
    source: z.enum(['default', 'asset', 'url']).openapi({
      description:
        'Where the image comes from: an admin upload (asset), an external URL (url), or the ' +
        "client's bundled default (default).",
    }),
    value: z.string().nullable().openapi({
      example: '/api/v1/appearance/background/home?v=a1b2c3',
      description:
        'Server-relative API path for `asset`, absolute URL for `url`, null for `default`.',
    }),
  })
  .openapi('SurfaceBackground');

const AppearanceConfigSchema = z
  .object({
    login: SurfaceBackgroundSchema,
    home: SurfaceBackgroundSchema,
    overlayOpacity: z.number().nullable().openapi({
      example: 0.5,
      description:
        'Opacity of the scrim over the background, or null to keep the per-theme defaults.',
    }),
    blur: z
      .number()
      .openapi({ example: 0, description: 'Blur radius in px behind the scrim; 0 disables it.' }),
    userBackgroundEnabled: z.boolean().openapi({
      example: true,
      description: 'Whether users may choose their own background for post-auth surfaces.',
    }),
    userBackgroundUploadEnabled: z.boolean().openapi({
      example: false,
      description: 'Whether users may upload their own background image.',
    }),
  })
  .openapi('AppearanceConfig');

const BackgroundPreferenceSchema = z
  .object({
    kind: z.enum(['default', 'preset', 'upload']).openapi({
      description:
        'default follows the admin setting, preset uses a built-in, upload uses the ' +
        "user's own image.",
    }),
    presetId: z
      .enum(BACKGROUND_PRESET_IDS)
      .optional()
      .openapi({ description: 'Required when kind is `preset`.' }),
  })
  .openapi('BackgroundPreference');

const SurfaceParamSchema = z.object({
  surface: z.enum(BACKGROUND_SURFACES).openapi({
    param: { name: 'surface', in: 'path' },
    description: 'Which surface the background belongs to.',
  }),
});

// ─── Public: appearance config ───────────────────────────────────────────────

const getAppearanceConfigRoute = createRoute({
  method: 'get',
  path: '/config',
  tags: ['Appearance'],
  operationId: 'getAppearanceConfig',
  summary: 'Get the resolved appearance configuration',
  description: 'Public because the login page must resolve its background before authentication.',
  responses: {
    200: {
      content: { 'application/json': { schema: AppearanceConfigSchema } },
      description: 'Appearance configuration',
    },
  },
});

appearanceRoutes.openapi(getAppearanceConfigRoute, async (c) => {
  const config = await appearanceService.getConfig(c.get('db'));
  return c.json(config, 200);
});

// ─── Public: admin-uploaded background image ─────────────────────────────────

const getBrandingBackgroundRoute = createRoute({
  method: 'get',
  path: '/background/{surface}',
  tags: ['Appearance'],
  operationId: 'getBrandingBackground',
  summary: 'Get the admin-uploaded background for a surface',
  request: { params: SurfaceParamSchema },
  responses: {
    200: {
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
      description: 'Background image',
    },
    ...errorResponses.notFound('Background'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- binary + error unions
appearanceRoutes.openapi(getBrandingBackgroundRoute, async (c): Promise<any> => {
  const surface = c.req.param('surface');
  if (!surface || !isBackgroundSurface(surface)) {
    return c.json({ error: 'Background not found' }, 404);
  }

  const storage = getStorageService(c.get('storage'));
  const stored = await storage.getSlotImage('branding', brandingSlotKey(surface));
  if (!stored) {
    return c.json({ error: 'Background not found' }, 404);
  }

  const bytes = new Uint8Array(
    stored.data instanceof ArrayBuffer ? stored.data : new Uint8Array(stored.data)
  );

  return c.body(bytes, 200, {
    'Content-Type': stored.contentType,
    'Content-Length': bytes.byteLength.toString(),
    // The URL carries a ?v= token that changes on every upload, so the bytes
    // behind a given URL never change and can be cached hard.
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
});

// ─── Authenticated: the caller's own background image ────────────────────────

const getUserBackgroundRoute = createRoute({
  method: 'get',
  path: '/user-background',
  tags: ['Appearance'],
  operationId: 'getOwnBackground',
  summary: "Get the caller's uploaded background image",
  responses: {
    200: {
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
      description: 'Background image',
    },
    ...errorResponses.notAuthenticated,
    ...errorResponses.notFound('Background'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- binary + error unions
appearanceRoutes.openapi(getUserBackgroundRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const record = await userService.findById(db, user.id);
  if (!record?.username) {
    return c.json({ error: 'Background not found' }, 404);
  }

  const storage = getStorageService(c.get('storage'));
  const stored = await storage.getSlotImage('backgrounds', record.username);
  if (!stored) {
    return c.json({ error: 'Background not found' }, 404);
  }

  const bytes = new Uint8Array(
    stored.data instanceof ArrayBuffer ? stored.data : new Uint8Array(stored.data)
  );

  return c.body(bytes, 200, {
    'Content-Type': stored.contentType,
    'Content-Length': bytes.byteLength.toString(),
    // Personal, session-scoped and replaceable in place — revalidate rather
    // than let a stale image survive an upload.
    'Cache-Control': 'private, no-cache',
  });
});

const uploadUserBackgroundRoute = createRoute({
  method: 'post',
  path: '/user-background',
  tags: ['Appearance'],
  operationId: 'uploadOwnBackground',
  summary: "Upload the caller's background image",
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            background: z
              .any()
              .openapi({ type: 'string', format: 'binary', description: 'Background image file' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Background uploaded',
    },
    400: errorResponse('No file or invalid image'),
    403: errorResponse('User background uploads are disabled'),
    ...errorResponses.notAuthenticated,
    ...errorResponses.notFound('User'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
appearanceRoutes.openapi(uploadUserBackgroundRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const appearance = await appearanceService.getConfig(db);
  if (!appearance.userBackgroundUploadEnabled) {
    return c.json({ error: 'User background uploads are disabled' }, 403);
  }

  const record = await userService.findById(db, user.id);
  if (!record?.username) {
    return c.json({ error: 'User not found' }, 404);
  }

  const body = await c.req.parseBody();
  const file = body['background'] as File | undefined;
  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await imageService.validateBackground(buffer);
  if (!validation.valid) {
    return c.json({ error: validation.error || 'Invalid image' }, 400);
  }

  const processed = await imageService.processBackground(buffer);
  const storage = getStorageService(c.get('storage'));
  await storage.saveSlotImage(
    'backgrounds',
    record.username,
    processed.data,
    processed.contentType
  );
  await userService.setHasBackground(db, user.id, true);

  // Uploading is an implicit "use it": anything else leaves the user staring
  // at an unchanged page wondering whether the upload worked.
  await appearanceService.setBackgroundPreference(db, user.id, { kind: 'upload' });

  return c.json({ message: 'Background uploaded successfully' }, 200);
});

const deleteUserBackgroundRoute = createRoute({
  method: 'delete',
  path: '/user-background',
  tags: ['Appearance'],
  operationId: 'deleteOwnBackground',
  summary: "Delete the caller's background image",
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Background deleted',
    },
    ...errorResponses.notAuthenticated,
    ...errorResponses.notFound('Background'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
appearanceRoutes.openapi(deleteUserBackgroundRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const record = await userService.findById(db, user.id);
  if (!record?.username) {
    return c.json({ error: 'Background not found' }, 404);
  }

  const storage = getStorageService(c.get('storage'));
  await storage.deleteSlotImage('backgrounds', record.username);
  await userService.setHasBackground(db, user.id, false);

  // The image it pointed at is gone, so an `upload` preference would render
  // nothing. Fall back to the admin default.
  const preferences = await appearanceService.getPreferences(db, user.id);
  if (preferences.background?.kind === 'upload') {
    await appearanceService.setBackgroundPreference(db, user.id, { kind: 'default' });
  }

  return c.json({ message: 'Background deleted successfully' }, 200);
});

// ─── Authenticated: the caller's background preference ───────────────────────

const getPreferenceRoute = createRoute({
  method: 'get',
  path: '/preference',
  tags: ['Appearance'],
  operationId: 'getBackgroundPreference',
  summary: "Get the caller's background preference",
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              background: BackgroundPreferenceSchema,
              hasUpload: z.boolean().openapi({
                description: 'Whether the caller has an uploaded background image stored.',
              }),
            })
            .openapi('BackgroundPreferenceResponse'),
        },
      },
      description: 'Background preference',
    },
    ...errorResponses.notAuthenticated,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
appearanceRoutes.openapi(getPreferenceRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const [preferences, record] = await Promise.all([
    appearanceService.getPreferences(db, user.id),
    userService.findById(db, user.id),
  ]);

  return c.json(
    {
      background: preferences.background ?? { kind: 'default' as const },
      hasUpload: record?.hasBackground ?? false,
    },
    200
  );
});

const setPreferenceRoute = createRoute({
  method: 'put',
  path: '/preference',
  tags: ['Appearance'],
  operationId: 'setBackgroundPreference',
  summary: "Set the caller's background preference",
  request: {
    body: {
      content: { 'application/json': { schema: BackgroundPreferenceSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: BackgroundPreferenceSchema } },
      description: 'Updated preference',
    },
    400: errorResponse('Invalid preference'),
    403: errorResponse('User backgrounds are disabled'),
    ...errorResponses.notAuthenticated,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
appearanceRoutes.openapi(setPreferenceRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const preference = c.req.valid('json');

  // `default` is always allowed — it is how a user opts back out after an
  // admin turns personalisation off.
  if (preference.kind !== 'default') {
    const appearance = await appearanceService.getConfig(db);
    if (!appearance.userBackgroundEnabled) {
      return c.json({ error: 'User backgrounds are disabled' }, 403);
    }
    if (preference.kind === 'upload' && !appearance.userBackgroundUploadEnabled) {
      return c.json({ error: 'User background uploads are disabled' }, 403);
    }
  }

  if (preference.kind === 'preset' && !preference.presetId) {
    return c.json({ error: 'presetId is required when kind is preset' }, 400);
  }

  const stored = await appearanceService.setBackgroundPreference(db, user.id, preference);
  return c.json(stored.background ?? { kind: 'default' as const }, 200);
});

export default appearanceRoutes;
