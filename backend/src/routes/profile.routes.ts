/**
 * Public profile routes
 *
 * Mounted alongside `user.routes.ts` under `/api/v1/users`.
 *
 *   GET /api/v1/users/:username/profile
 *     -> The profile card (name, bio, avatar flag, appearance) plus whichever
 *        sections the viewer is allowed to see. 403 when the profile is not
 *        visible to this viewer; 404 for unknown/disabled accounts.
 *
 *   GET /api/v1/users/:username/activity?year=YYYY&tz=Area/City
 *     -> One calendar year of per-day word counts for the GitHub-style
 *        contribution grid, with streaks and the list of years that have
 *        any writing. Gated by the activity section's effective visibility.
 *
 *   GET /api/v1/users/:username/banner
 *     -> The owner's uploaded profile banner. Gated like the profile itself.
 *
 * Those use `optionalAuth`: anonymous callers are allowed, and the visibility
 * rules in `profile-visibility.service.ts` decide what they get back.
 *
 * The owner personalises their page through authenticated `/me/...` routes:
 *
 *   PUT    /api/v1/users/me/profile-background  -> choose plain or a preset
 *   POST   /api/v1/users/me/banner              -> upload a banner
 *   DELETE /api/v1/users/me/banner              -> remove it
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { userService } from '../services/user.service';
import { projectService } from '../services/project.service';
import { resolveProfileAccess } from '../services/profile-visibility.service';
import { profileActivityService, isValidTimeZone } from '../services/profile-activity.service';
import { appearanceService, BACKGROUND_PRESET_IDS } from '../services/appearance.service';
import { imageService, MAX_BACKGROUND_UPLOAD_BYTES } from '../services/image.service';
import { getStorageService } from '../services/storage.service';
import {
  errorResponse,
  errorResponses,
  MessageResponseSchema,
  ProfileVisibilitySchema,
} from '../schemas/common.schemas';

const profileRoutes = new OpenAPIHono<AppContext>();

profileRoutes.use('/:username/profile', optionalAuth);
profileRoutes.use('/:username/activity', optionalAuth);
// Only the public read is optional-auth; the owner's POST/DELETE below need a
// session. Method-scoped so a `/me/banner` write does not run both.
profileRoutes.use('/:username/banner', async (c, next) => {
  if (c.req.method === 'GET') {
    return optionalAuth(c, next);
  }
  await next();
});
profileRoutes.use('/me/profile-background', requireAuth);
profileRoutes.use('/me/banner', requireAuth);
// Reject oversized uploads before parseBody() buffers them; the file cap is
// enforced again after parsing.
profileRoutes.use('/me/banner', bodyLimit({ maxSize: MAX_BACKGROUND_UPLOAD_BYTES + 64 * 1024 }));

const UsernameParams = z.object({
  username: z.string().openapi({ description: 'Username', example: 'johndoe' }),
});

const ProfileProjectSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    updatedDate: z.number().openapi({ description: 'Unix ms' }),
  })
  .openapi('ProfileProject');

const ProfileVisibilitySettingsSchema = z
  .object({
    profile: ProfileVisibilitySchema,
    activity: ProfileVisibilitySchema,
    projects: ProfileVisibilitySchema,
  })
  .openapi('ProfileVisibilitySettings');

export const ProfileBackgroundSchema = z
  .object({
    kind: z.enum(['plain', 'preset']).openapi({
      description: "plain shows the theme's own surface colour; preset uses a built-in backdrop.",
    }),
    presetId: z
      .enum(BACKGROUND_PRESET_IDS)
      .optional()
      .openapi({ description: 'Required when kind is `preset`.' }),
  })
  .openapi('ProfileBackground');

const ProfileAppearanceSchema = z
  .object({
    background: ProfileBackgroundSchema,
    hasBanner: z.boolean().openapi({
      description: 'Whether `GET /users/{username}/banner` will return an image.',
    }),
  })
  .openapi('ProfileAppearance');

export const UserProfileSchema = z
  .object({
    username: z.string(),
    name: z.string().nullable(),
    bio: z.string().nullable(),
    hasAvatar: z.boolean(),
    isOwner: z.boolean(),
    /** How the owner has dressed their page. */
    appearance: ProfileAppearanceSchema,
    /** Which sections this viewer may see. */
    sections: z.object({
      activity: z.boolean(),
      projects: z.boolean(),
    }),
    /** Present only for the owner (and admins) so they can see how the page is gated. */
    visibility: ProfileVisibilitySettingsSchema.optional(),
    /** Present only when `sections.projects` is true. */
    projects: z.array(ProfileProjectSchema).optional(),
  })
  .openapi('UserProfile');

const ActivityDaySchema = z
  .object({
    day: z.string().openapi({ description: 'YYYY-MM-DD', example: '2026-03-14' }),
    words: z.number().int(),
    sessions: z.number().int(),
  })
  .openapi('ProfileActivityDay');

export const ProfileActivityYearSchema = z
  .object({
    year: z.number().int(),
    timeZone: z.string(),
    days: z.array(ActivityDaySchema),
    totalWords: z.number().int(),
    activeDays: z.number().int(),
    longestStreak: z.number().int(),
    currentStreak: z.number().int(),
    availableYears: z.array(z.number().int()),
  })
  .openapi('ProfileActivityYear');

const getProfileRoute = createRoute({
  method: 'get',
  path: '/{username}/profile',
  tags: ['Users'],
  operationId: 'getUserProfile',
  // Anonymous callers are allowed; visibility is enforced per response.
  security: [],
  request: { params: UsernameParams },
  responses: {
    200: {
      content: { 'application/json': { schema: UserProfileSchema } },
      description: 'Profile as visible to the caller',
    },
    403: errorResponse('Profile is not visible to the caller'),
    404: errorResponse('User not found'),
  },
});

profileRoutes.openapi(getProfileRoute, async (c) => {
  const db = c.get('db');
  const viewer = c.get('user');
  const { username } = c.req.valid('param');

  const owner = await userService.findByUsername(db, username);
  if (!owner?.username || !owner.enabled) {
    return c.json({ error: 'User not found' }, 404);
  }

  const access = resolveProfileAccess(owner, viewer);
  if (!access.profile) {
    return c.json({ error: 'This profile is private' }, 403);
  }

  const showSettings = access.isOwner || !!viewer?.isAdmin;
  const background = await appearanceService.getProfileBackground(db, owner.id);
  const projects = access.sections.projects
    ? (await projectService.findByUserId(db, owner.id)).map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description ?? null,
        updatedDate: p.updatedDate,
      }))
    : undefined;

  return c.json(
    {
      username: owner.username,
      name: owner.name ?? null,
      bio: owner.bio ?? null,
      hasAvatar: owner.hasAvatar,
      isOwner: access.isOwner,
      appearance: { background, hasBanner: owner.hasBanner },
      sections: access.sections,
      visibility: showSettings
        ? {
            profile: owner.profileVisibility,
            activity: owner.activityVisibility,
            projects: owner.projectsVisibility,
          }
        : undefined,
      projects,
    },
    200
  );
});

const ActivityQuery = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .openapi({ description: 'Calendar year; defaults to the current year', example: '2026' }),
  tz: z.string().max(64).optional().openapi({
    description: 'IANA timezone used to bucket days; defaults to UTC',
    example: 'Europe/London',
  }),
});

const getActivityRoute = createRoute({
  method: 'get',
  path: '/{username}/activity',
  tags: ['Users'],
  operationId: 'getUserActivity',
  // Anonymous callers are allowed; visibility is enforced per response.
  security: [],
  request: { params: UsernameParams, query: ActivityQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: ProfileActivityYearSchema } },
      description: 'Per-day writing activity for one year',
    },
    403: errorResponse('Activity is not visible to the caller'),
    404: errorResponse('User not found'),
  },
});

profileRoutes.openapi(getActivityRoute, async (c) => {
  const db = c.get('db');
  const viewer = c.get('user');
  const { username } = c.req.valid('param');
  const { year: rawYear, tz } = c.req.valid('query');

  const owner = await userService.findByUsername(db, username);
  if (!owner?.username || !owner.enabled) {
    return c.json({ error: 'User not found' }, 404);
  }

  const access = resolveProfileAccess(owner, viewer);
  if (!access.profile || !access.sections.activity) {
    return c.json({ error: 'Activity is not visible' }, 403);
  }

  const timeZone = isValidTimeZone(tz) ? tz : 'UTC';
  const currentYear = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(new Date())
  );
  let year = rawYear ? Number(rawYear) : currentYear;
  // Clamp to a sane range so a typo can't request the year 9999.
  if (year < 2000 || year > currentYear) year = currentYear;

  const result = await profileActivityService.yearForUser(db, owner.id, year, timeZone);
  return c.json(result, 200);
});

// ──────────────── GET /:username/banner ────────────────

const getBannerRoute = createRoute({
  method: 'get',
  path: '/{username}/banner',
  tags: ['Users'],
  operationId: 'getUserBanner',
  summary: "Get a user's profile banner",
  // Anonymous callers are allowed; visibility is enforced per response.
  security: [],
  request: { params: UsernameParams },
  responses: {
    200: {
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
      description: 'Banner image',
    },
    403: errorResponse('Profile is not visible to the caller'),
    404: errorResponse('Banner not found'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- binary + error unions
profileRoutes.openapi(getBannerRoute, async (c): Promise<any> => {
  const db = c.get('db');
  const viewer = c.get('user');
  const { username } = c.req.valid('param');

  const owner = await userService.findByUsername(db, username);
  if (!owner?.username || !owner.enabled) {
    return c.json({ error: 'Banner not found' }, 404);
  }

  // The banner is part of the profile card, so it is gated exactly like the
  // card: a private profile must not leak its image via a guessable URL.
  if (!resolveProfileAccess(owner, viewer).profile) {
    return c.json({ error: 'This profile is private' }, 403);
  }

  if (!owner.hasBanner) {
    return c.json({ error: 'Banner not found' }, 404);
  }

  const storage = getStorageService(c.get('storage'));
  const stored = await storage.getSlotImage('banners', owner.username);
  if (!stored) {
    return c.json({ error: 'Banner not found' }, 404);
  }

  const bytes = new Uint8Array(
    stored.data instanceof ArrayBuffer ? stored.data : new Uint8Array(stored.data)
  );

  return c.body(bytes, 200, {
    'Content-Type': stored.contentType,
    'Content-Length': bytes.byteLength.toString(),
    // Visibility-gated and replaceable in place: revalidate rather than let a
    // stale (or no-longer-visible) image survive in a shared cache.
    'Cache-Control': 'private, no-cache',
  });
});

// ──────────────── PUT /me/profile-background ────────────────

const setProfileBackgroundRoute = createRoute({
  method: 'put',
  path: '/me/profile-background',
  tags: ['Users'],
  operationId: 'setProfileBackground',
  summary: "Set the caller's profile page background",
  request: {
    body: { content: { 'application/json': { schema: ProfileBackgroundSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ProfileBackgroundSchema } },
      description: 'Stored profile background',
    },
    400: errorResponse('Invalid profile background'),
    ...errorResponses.notAuthenticated,
  },
});

profileRoutes.openapi(setProfileBackgroundRoute, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const body = c.req.valid('json');
  if (body.kind === 'preset' && !body.presetId) {
    return c.json({ error: 'presetId is required for a preset background' }, 400);
  }

  const stored = await appearanceService.setProfileBackground(c.get('db'), user.id, body);
  return c.json(stored, 200);
});

// ──────────────── POST / DELETE /me/banner ────────────────

const uploadBannerRoute = createRoute({
  method: 'post',
  path: '/me/banner',
  tags: ['Users'],
  operationId: 'uploadProfileBanner',
  summary: "Upload the caller's profile banner",
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            banner: z
              .any()
              .openapi({ type: 'string', format: 'binary', description: 'Banner image file' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Banner uploaded',
    },
    400: errorResponse('No file or invalid image'),
    ...errorResponses.notAuthenticated,
    ...errorResponses.notFound('User'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
profileRoutes.openapi(uploadBannerRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const record = await userService.findById(db, user.id);
  if (!record?.username) {
    return c.json({ error: 'User not found' }, 404);
  }

  const body = await c.req.parseBody();
  const file = body['banner'] as File | undefined;
  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Same rules as a background upload: raster formats only, SVG refused.
  const validation = await imageService.validateBackground(buffer);
  if (!validation.valid) {
    return c.json({ error: validation.error || 'Invalid image' }, 400);
  }

  const processed = await imageService.processBanner(buffer);
  const storage = getStorageService(c.get('storage'));
  await storage.saveSlotImage('banners', record.username, processed.data, processed.contentType);
  await userService.setHasBanner(db, user.id, true);

  return c.json({ message: 'Banner uploaded successfully' }, 200);
});

const deleteBannerRoute = createRoute({
  method: 'delete',
  path: '/me/banner',
  tags: ['Users'],
  operationId: 'deleteProfileBanner',
  summary: "Delete the caller's profile banner",
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Banner deleted',
    },
    ...errorResponses.notAuthenticated,
    ...errorResponses.notFound('User'),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- error response unions
profileRoutes.openapi(deleteBannerRoute, async (c): Promise<any> => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.get('db');
  const record = await userService.findById(db, user.id);
  if (!record?.username) {
    return c.json({ error: 'User not found' }, 404);
  }

  const storage = getStorageService(c.get('storage'));
  await storage.deleteSlotImage('banners', record.username);
  await userService.setHasBanner(db, user.id, false);

  return c.json({ message: 'Banner deleted successfully' }, 200);
});

export default profileRoutes;
