import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { requireAdmin } from '../middleware/auth';
import {
  BACKGROUND_SURFACES,
  brandingSlotKey,
  isBackgroundSurface,
} from '../services/appearance.service';
import { configService } from '../services/config.service';
import { imageService, MAX_BACKGROUND_UPLOAD_BYTES } from '../services/image.service';
import { getStorageService } from '../services/storage.service';
import { errorResponse, errorResponses, MessageResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';

/**
 * Admin-only branding background upload/removal.
 *
 * The rest of the appearance settings (external URLs, scrim opacity, blur, the
 * user-personalisation toggles) are plain config keys, so they go through the
 * existing generic `/api/v1/admin/config/{key}` endpoint. Only the image bytes
 * need dedicated routes.
 */
export const adminAppearanceRoutes = new OpenAPIHono<AppContext>();

adminAppearanceRoutes.use('*', requireAdmin);

// Reject oversized uploads before parseBody() buffers them. The file cap is
// enforced again after parsing; this bound covers the whole multipart envelope.
adminAppearanceRoutes.use(
  '/background/*',
  bodyLimit({ maxSize: MAX_BACKGROUND_UPLOAD_BYTES + 64 * 1024 })
);

const SurfaceParamSchema = z.object({
  surface: z.enum(BACKGROUND_SURFACES).openapi({
    param: { name: 'surface', in: 'path' },
    description: 'Which surface the background belongs to.',
  }),
});

const uploadBackgroundRoute = createRoute({
  method: 'put',
  path: '/background/{surface}',
  tags: ['Admin Appearance'],
  operationId: 'adminUploadBackground',
  summary: 'Upload the background image for a surface',
  description:
    'Replaces any existing image. The stored version token changes on every upload so the ' +
    'public image URL cache-busts for everyone.',
  request: {
    params: SurfaceParamSchema,
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
    ...errorResponses.admin,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
adminAppearanceRoutes.openapi(uploadBackgroundRoute, async (c): Promise<any> => {
  const surface = c.req.param('surface');
  if (!surface || !isBackgroundSurface(surface)) {
    return c.json({ error: 'Invalid surface' }, 400);
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
    'branding',
    brandingSlotKey(surface),
    processed.data,
    processed.contentType
  );

  // A fresh token invalidates the immutable cache entry every client holds for
  // the previous image.
  const db = c.get('db');
  const key = surface === 'login' ? 'LOGIN_BACKGROUND_ASSET' : 'HOME_BACKGROUND_ASSET';
  await configService.set(db, key, crypto.randomUUID().replaceAll('-', '').slice(0, 12));

  return c.json({ message: 'Background uploaded successfully' }, 200);
});

const deleteBackgroundRoute = createRoute({
  method: 'delete',
  path: '/background/{surface}',
  tags: ['Admin Appearance'],
  operationId: 'adminDeleteBackground',
  summary: 'Remove the uploaded background image for a surface',
  request: { params: SurfaceParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Background removed',
    },
    400: errorResponse('Invalid surface'),
    ...errorResponses.admin,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
adminAppearanceRoutes.openapi(deleteBackgroundRoute, async (c): Promise<any> => {
  const surface = c.req.param('surface');
  if (!surface || !isBackgroundSurface(surface)) {
    return c.json({ error: 'Invalid surface' }, 400);
  }

  const storage = getStorageService(c.get('storage'));
  await storage.deleteSlotImage('branding', brandingSlotKey(surface));

  // Clearing the token is what makes the surface fall back to the external URL
  // (if set) and then the bundled default.
  const db = c.get('db');
  const key = surface === 'login' ? 'LOGIN_BACKGROUND_ASSET' : 'HOME_BACKGROUND_ASSET';
  await configService.set(db, key, '');

  return c.json({ message: 'Background removed successfully' }, 200);
});

export default adminAppearanceRoutes;
