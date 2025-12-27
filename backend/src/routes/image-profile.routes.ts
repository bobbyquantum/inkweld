/**
 * Image Model Profile Routes
 *
 * Admin routes for managing image model profiles.
 * User routes for listing available profiles.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireAuth } from '../middleware/auth';
import {
  imageProfileService,
  type CreateProfileInput,
  type UpdateProfileInput,
} from '../services/image-profile.service';
import type { AppContext } from '../types/context';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';
import { IMAGE_PROVIDERS } from '../db/schema/image-model-profiles';

// ============================================
// Types & Helpers
// ============================================

type ProviderType = 'openai' | 'openrouter' | 'falai' | 'stable-diffusion';

/**
 * Format a profile for API response with proper provider typing
 */
function formatAdminProfile(profile: {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  modelId: string;
  enabled: boolean;
  supportsImageInput: boolean;
  supportsCustomResolutions: boolean;
  supportedSizes: string[] | null;
  defaultSize: string | null;
  sortOrder: number;
  modelConfig: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    provider: profile.provider as ProviderType,
    modelId: profile.modelId,
    enabled: profile.enabled,
    supportsImageInput: profile.supportsImageInput,
    supportsCustomResolutions: profile.supportsCustomResolutions,
    supportedSizes: profile.supportedSizes,
    defaultSize: profile.defaultSize,
    sortOrder: profile.sortOrder,
    modelConfig: profile.modelConfig,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

// ============================================
// Schemas
// ============================================

const ProviderSchema = z.enum(['openai', 'openrouter', 'falai', 'stable-diffusion']).openapi({
  description: 'Image generation provider',
});

const PublicProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    provider: ProviderSchema,
    modelId: z.string(),
    enabled: z.boolean(),
    supportsImageInput: z.boolean(),
    supportsCustomResolutions: z.boolean(),
    supportedSizes: z.array(z.string()).nullable(),
    defaultSize: z.string().nullable(),
    sortOrder: z.number(),
  })
  .openapi('PublicImageModelProfile');

const AdminProfileSchema = PublicProfileSchema.extend({
  modelConfig: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('AdminImageModelProfile');

const CreateProfileRequestSchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ description: 'Display name for the profile' }),
    description: z.string().max(500).optional().openapi({ description: 'Optional description' }),
    provider: ProviderSchema,
    modelId: z.string().min(1).openapi({ description: 'Provider-specific model identifier' }),
    enabled: z.boolean().optional().default(true),
    supportsImageInput: z.boolean().optional().default(false),
    supportsCustomResolutions: z
      .boolean()
      .optional()
      .default(false)
      .openapi({ description: 'Whether arbitrary/custom resolutions are allowed' }),
    supportedSizes: z.array(z.string()).optional(),
    defaultSize: z.string().optional(),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
    sortOrder: z.number().optional().default(0),
  })
  .openapi('CreateImageModelProfileRequest');

const UpdateProfileRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    provider: ProviderSchema.optional(),
    modelId: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    supportsImageInput: z.boolean().optional(),
    supportsCustomResolutions: z.boolean().optional(),
    supportedSizes: z.array(z.string()).nullable().optional(),
    defaultSize: z.string().nullable().optional(),
    modelConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    sortOrder: z.number().optional(),
  })
  .openapi('UpdateImageModelProfileRequest');

const ProfileIdParamsSchema = z.object({
  profileId: z.string().openapi({ example: 'abc-123', description: 'Profile ID' }),
});

// ============================================
// User Routes (list enabled profiles)
// ============================================

export const imageProfileUserRoutes = new OpenAPIHono<AppContext>();

imageProfileUserRoutes.use('*', requireAuth);

const listEnabledProfilesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Image Profiles'],
  summary: 'List available image profiles',
  description: 'Get a list of enabled image model profiles available for generation',
  operationId: 'listImageProfiles',
  responses: {
    200: {
      description: 'List of available profiles',
      content: {
        'application/json': {
          schema: z.array(PublicProfileSchema),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileUserRoutes.openapi(listEnabledProfilesRoute, async (c) => {
  const db = c.get('db');
  const profiles = await imageProfileService.listEnabled(db);
  return c.json(profiles, 200);
});

// ============================================
// Admin Routes (CRUD)
// ============================================

export const imageProfileAdminRoutes = new OpenAPIHono<AppContext>();

imageProfileAdminRoutes.use('*', requireAdmin);

// List all profiles (including disabled)
const listAllProfilesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin - Image Profiles'],
  summary: 'List all image profiles',
  description: 'Get a list of all image model profiles (admin only)',
  operationId: 'adminListImageProfiles',
  responses: {
    200: {
      description: 'List of all profiles',
      content: {
        'application/json': {
          schema: z.array(AdminProfileSchema),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileAdminRoutes.openapi(listAllProfilesRoute, async (c) => {
  const db = c.get('db');
  const profiles = await imageProfileService.listAll(db);
  // Convert dates to ISO strings for JSON
  const response = profiles.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
  return c.json(response, 200);
});

// List available providers (for admin UI dropdowns)
// NOTE: This route MUST come before /{profileId} to avoid being caught by the param route
const listProvidersRoute = createRoute({
  method: 'get',
  path: '/providers',
  tags: ['Admin - Image Profiles'],
  summary: 'List available providers',
  description: 'Get a list of supported image generation providers',
  operationId: 'adminListImageProviders',
  responses: {
    200: {
      description: 'List of providers',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
            })
          ),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileAdminRoutes.openapi(listProvidersRoute, async (c) => {
  const providers = IMAGE_PROVIDERS.map((id) => ({
    id,
    name: {
      openai: 'OpenAI',
      openrouter: 'OpenRouter',
      falai: 'Fal.ai',
      'stable-diffusion': 'Stable Diffusion (Local)',
    }[id],
  }));
  return c.json(providers, 200);
});

// Get a single profile
const getProfileRoute = createRoute({
  method: 'get',
  path: '/{profileId}',
  tags: ['Admin - Image Profiles'],
  summary: 'Get an image profile',
  description: 'Get details of a specific image model profile (admin only)',
  operationId: 'adminGetImageProfile',
  request: {
    params: ProfileIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Profile details',
      content: {
        'application/json': {
          schema: AdminProfileSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Profile not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileAdminRoutes.openapi(getProfileRoute, async (c) => {
  const db = c.get('db');
  const { profileId } = c.req.valid('param');

  const profile = await imageProfileService.getById(db, profileId);
  if (!profile) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  return c.json(formatAdminProfile(profile), 200);
});

// Create a new profile
const createProfileRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Admin - Image Profiles'],
  summary: 'Create an image profile',
  description: 'Create a new image model profile (admin only)',
  operationId: 'adminCreateImageProfile',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProfileRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Profile created',
      content: {
        'application/json': {
          schema: AdminProfileSchema,
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Profile with this name already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileAdminRoutes.openapi(createProfileRoute, async (c) => {
  const db = c.get('db');
  const body = c.req.valid('json');

  try {
    const input: CreateProfileInput = {
      name: body.name,
      description: body.description,
      provider: body.provider,
      modelId: body.modelId,
      enabled: body.enabled,
      supportsImageInput: body.supportsImageInput,
      supportsCustomResolutions: body.supportsCustomResolutions,
      supportedSizes: body.supportedSizes,
      defaultSize: body.defaultSize,
      modelConfig: body.modelConfig,
      sortOrder: body.sortOrder,
    };

    const profile = await imageProfileService.create(db, input);

    return c.json(formatAdminProfile(profile), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('already exists')) {
      return c.json({ error: message }, 409);
    }
    return c.json({ error: message }, 400);
  }
});

// Update a profile
const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/{profileId}',
  tags: ['Admin - Image Profiles'],
  summary: 'Update an image profile',
  description: 'Update an existing image model profile (admin only)',
  operationId: 'adminUpdateImageProfile',
  request: {
    params: ProfileIdParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateProfileRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Profile updated',
      content: {
        'application/json': {
          schema: AdminProfileSchema,
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Profile not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Profile with this name already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileAdminRoutes.openapi(updateProfileRoute, async (c) => {
  const db = c.get('db');
  const { profileId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const input: UpdateProfileInput = {
      name: body.name,
      description: body.description,
      provider: body.provider,
      modelId: body.modelId,
      enabled: body.enabled,
      supportsImageInput: body.supportsImageInput,
      supportsCustomResolutions: body.supportsCustomResolutions,
      supportedSizes: body.supportedSizes,
      defaultSize: body.defaultSize,
      modelConfig: body.modelConfig,
      sortOrder: body.sortOrder,
    };

    const profile = await imageProfileService.update(db, profileId, input);

    return c.json(formatAdminProfile(profile), 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return c.json({ error: message }, 404);
    }
    if (message.includes('already exists')) {
      return c.json({ error: message }, 409);
    }
    return c.json({ error: message }, 400);
  }
});

// Delete a profile
const deleteProfileRoute = createRoute({
  method: 'delete',
  path: '/{profileId}',
  tags: ['Admin - Image Profiles'],
  summary: 'Delete an image profile',
  description: 'Delete an image model profile (admin only)',
  operationId: 'adminDeleteImageProfile',
  request: {
    params: ProfileIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Profile deleted',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Profile not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

imageProfileAdminRoutes.openapi(deleteProfileRoute, async (c) => {
  const db = c.get('db');
  const { profileId } = c.req.valid('param');

  try {
    await imageProfileService.delete(db, profileId);
    return c.json({ message: 'Profile deleted' }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 404);
  }
});
