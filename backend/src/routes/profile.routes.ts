/**
 * Public profile routes
 *
 * Mounted alongside `user.routes.ts` under `/api/v1/users`.
 *
 *   GET /api/v1/users/:username/profile
 *     -> The profile card (name, bio, avatar flag) plus whichever sections
 *        the viewer is allowed to see. 403 when the profile is not visible
 *        to this viewer; 404 for unknown/disabled accounts.
 *
 *   GET /api/v1/users/:username/activity?year=YYYY&tz=Area/City
 *     -> One calendar year of per-day word counts for the GitHub-style
 *        contribution grid, with streaks and the list of years that have
 *        any writing. Gated by the activity section's effective visibility.
 *
 * Both use `optionalAuth`: anonymous callers are allowed, and the visibility
 * rules in `profile-visibility.service.ts` decide what they get back.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { optionalAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { userService } from '../services/user.service';
import { projectService } from '../services/project.service';
import { resolveProfileAccess } from '../services/profile-visibility.service';
import { profileActivityService, isValidTimeZone } from '../services/profile-activity.service';
import { errorResponse, ProfileVisibilitySchema } from '../schemas/common.schemas';

const profileRoutes = new OpenAPIHono<AppContext>();

profileRoutes.use('/:username/profile', optionalAuth);
profileRoutes.use('/:username/activity', optionalAuth);

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

export const UserProfileSchema = z
  .object({
    username: z.string(),
    name: z.string().nullable(),
    bio: z.string().nullable(),
    hasAvatar: z.boolean(),
    isOwner: z.boolean(),
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

export default profileRoutes;
