/**
 * AI Image Generation Routes
 *
 * Unified routes for multi-provider image generation (text-to-image).
 * Supports OpenAI DALL-E, OpenRouter, Stable Diffusion, and Fal.ai.
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { imageGenerationService } from '../services/image-generation.service';
import { configService } from '../services/config.service';
import { DEFAULT_OPENAI_MODELS } from '../services/image-providers/openai-provider';
import { DEFAULT_OPENROUTER_MODELS } from '../services/image-providers/openrouter-provider';
import { DEFAULT_FALAI_MODELS } from '../services/image-providers/falai-provider';
import type { AppContext } from '../types/context';
import type {
  ImageProviderType,
  WorldbuildingContext,
  CustomImageSize,
} from '../types/image-generation';

const aiImageRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all routes
aiImageRoutes.use('*', requireAuth);

// ============================================================================
// Schemas
// ============================================================================

const ProviderTypeSchema = z
  .enum(['openai', 'openrouter', 'stable-diffusion', 'falai'])
  .openapi('ImageProviderType');

// Image sizes supported across providers
// Includes standard sizes, OpenRouter aspect ratios, Fal.ai aspect-ratio formats, and custom dimensions
const PRESET_IMAGE_SIZES = [
  '256x256',
  '512x512',
  '1024x1024', // 1:1 square
  '1024x1536',
  '1536x1024',
  '1024x1792',
  '1792x1024',
  '832x1248', // 2:3 portrait
  '1248x832', // 3:2 landscape
  '864x1184', // 3:4 portrait
  '1184x864', // 4:3 landscape
  '896x1152', // 4:5 portrait
  '1152x896', // 5:4 landscape
  '768x1344', // 9:16 tall portrait - good for covers
  '1344x768', // 16:9 wide landscape
  '1536x672', // 21:9 ultra-wide
  // Fal.ai extended sizes (flexible resolution support)
  '1920x1080', // HD 1080p landscape
  '1080x1920', // HD 1080p portrait
  '1600x2560', // Ebook cover (Kindle)
  '2560x1600', // Landscape ebook/print
  'auto',
] as const;

const ImageSizeSchema = z.enum(PRESET_IMAGE_SIZES).openapi('ImageSize');

const WorldbuildingContextSchema = z
  .object({
    elementId: z.string().openapi({ description: 'Element ID' }),
    name: z.string().openapi({ description: 'Element name' }),
    type: z.string().openapi({ description: 'Element type' }),
    role: z
      .enum(['subject', 'setting', 'style', 'reference'])
      .openapi({ description: 'Role of the element in the prompt' }),
    roleDescription: z.string().optional().openapi({ description: 'Description of the role' }),
    data: z
      .record(z.string(), z.unknown())
      .openapi({ description: 'Raw worldbuilding element data' }),
  })
  .openapi('WorldbuildingContext');

const GenerateRequestSchema = z
  .object({
    prompt: z.string().min(1).max(4000).openapi({
      example: 'A fantasy castle on a misty mountain',
      description: 'The image generation prompt',
    }),
    provider: ProviderTypeSchema.optional().openapi({
      description: 'Provider to use (uses default if not specified)',
    }),
    model: z.string().optional().openapi({
      example: 'dall-e-3',
      description: 'Specific model to use',
    }),
    n: z.number().int().min(1).max(4).optional().openapi({
      example: 1,
      description: 'Number of images to generate',
    }),
    size: ImageSizeSchema,
    quality: z.enum(['standard', 'hd']).optional().openapi({
      example: 'standard',
      description: 'Image quality (DALL-E 3 only)',
    }),
    style: z.enum(['vivid', 'natural']).optional().openapi({
      example: 'vivid',
      description: 'Image style (DALL-E 3 only)',
    }),
    negativePrompt: z.string().optional().openapi({
      description: 'Negative prompt (Stable Diffusion only)',
    }),
    worldbuildingContext: z.array(WorldbuildingContextSchema).optional().openapi({
      description: 'Worldbuilding elements to include in the prompt',
    }),
  })
  .openapi('ImageGenerateRequest');

const GeneratedImageSchema = z
  .object({
    b64Json: z.string().optional().openapi({ description: 'Base64-encoded image data' }),
    url: z.string().optional().openapi({ description: 'URL to the image' }),
    revisedPrompt: z.string().optional().openapi({ description: 'Revised prompt if modified' }),
    index: z.number().openapi({ description: 'Image index in batch' }),
  })
  .openapi('GeneratedImage');

const GenerateResponseSchema = z
  .object({
    created: z.number().openapi({ description: 'Unix timestamp of creation' }),
    data: z.array(GeneratedImageSchema).openapi({ description: 'Generated images' }),
    provider: ProviderTypeSchema.openapi({ description: 'Provider that generated the images' }),
    model: z.string().openapi({ description: 'Model used' }),
    request: z
      .object({
        prompt: z.string(),
        size: z.string().optional(),
        quality: z.string().optional(),
        style: z.string().optional(),
      })
      .openapi({ description: 'Original request parameters' }),
  })
  .openapi('ImageGenerateResponse');

const ModelInfoSchema = z
  .object({
    id: z.string().openapi({ description: 'Model ID' }),
    name: z.string().openapi({ description: 'Model name' }),
    provider: ProviderTypeSchema,
    supportedSizes: z.array(z.string()).openapi({ description: 'Supported image sizes' }),
    supportsQuality: z.boolean().openapi({ description: 'Whether quality setting is supported' }),
    supportsStyle: z.boolean().openapi({ description: 'Whether style setting is supported' }),
    maxImages: z.number().openapi({ description: 'Maximum images per request' }),
    description: z.string().optional().openapi({ description: 'Model description' }),
  })
  .openapi('ImageModelInfo');

const ProviderStatusSchema = z
  .object({
    type: ProviderTypeSchema,
    name: z.string().openapi({ description: 'Provider display name' }),
    available: z.boolean().openapi({ description: 'Whether provider is available' }),
    enabled: z.boolean().openapi({ description: 'Whether provider is enabled' }),
    models: z.array(ModelInfoSchema).openapi({ description: 'Available models' }),
    error: z.string().optional().openapi({ description: 'Error message if unavailable' }),
  })
  .openapi('ImageProviderStatus');

const StatusResponseSchema = z
  .object({
    available: z.boolean().openapi({ description: 'Whether any provider is available' }),
    providers: z.array(ProviderStatusSchema).openapi({ description: 'All configured providers' }),
    defaultProvider: ProviderTypeSchema.optional().openapi({ description: 'Default provider' }),
  })
  .openapi('ImageGenerationStatus');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
  })
  .openapi('ImageGenerationError');

// Custom image size schema
const CustomImageSizeSchema = z
  .object({
    id: z.string().openapi({ description: 'Unique identifier for this size' }),
    name: z.string().openapi({ description: 'User-friendly name for the size' }),
    width: z.number().int().min(256).max(4096).openapi({ description: 'Width in pixels' }),
    height: z.number().int().min(256).max(4096).openapi({ description: 'Height in pixels' }),
    description: z.string().optional().openapi({ description: 'Optional description' }),
  })
  .openapi('CustomImageSize');

const CustomSizesResponseSchema = z
  .object({
    sizes: z.array(CustomImageSizeSchema).openapi({ description: 'Custom image sizes' }),
  })
  .openapi('CustomSizesResponse');

// Default models response schema - provides default model configs for text-to-image providers
const DefaultTextToImageModelsResponseSchema = z
  .object({
    providers: z
      .object({
        openai: z
          .object({
            name: z.string().openapi({ description: 'Provider display name' }),
            models: z.array(ModelInfoSchema).openapi({ description: 'Default models' }),
          })
          .openapi({ description: 'OpenAI default models' }),
        openrouter: z
          .object({
            name: z.string().openapi({ description: 'Provider display name' }),
            models: z.array(ModelInfoSchema).openapi({ description: 'Default models' }),
          })
          .openapi({ description: 'OpenRouter default models' }),
        falai: z
          .object({
            name: z.string().openapi({ description: 'Provider display name' }),
            models: z.array(ModelInfoSchema).openapi({ description: 'Default models' }),
          })
          .openapi({ description: 'Fal.ai default models' }),
      })
      .openapi({ description: 'Default models grouped by provider' }),
  })
  .openapi('DefaultTextToImageModelsResponse');

// ============================================================================
// Routes
// ============================================================================

// Get status of all providers
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['AI Image Generation'],
  summary: 'Get image generation status',
  description: 'Get the status of all configured image generation providers',
  operationId: 'getImageGenerationStatus',
  responses: {
    200: {
      description: 'Provider status',
      content: { 'application/json': { schema: StatusResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiImageRoutes.openapi(statusRoute, async (c) => {
  const db = c.get('db');
  const status = await imageGenerationService.getStatus(db);
  return c.json(status, 200);
});

// Generate images
const generateRoute = createRoute({
  method: 'post',
  path: '/generate',
  tags: ['AI Image Generation'],
  summary: 'Generate images',
  description: 'Generate images using the specified or default provider',
  operationId: 'generateImage',
  request: {
    body: {
      content: {
        'application/json': { schema: GenerateRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Images generated successfully',
      content: { 'application/json': { schema: GenerateResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    503: {
      description: 'No provider available',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiImageRoutes.openapi(generateRoute, async (c) => {
  const db = c.get('db');

  try {
    const body = await c.req.json();
    const validatedBody = GenerateRequestSchema.parse(body);

    // Check if generation is available
    const isAvailable = await imageGenerationService.isAvailable(db);
    if (!isAvailable) {
      return c.json(
        {
          error:
            'No image generation provider is available. Please configure at least one provider.',
        },
        503
      );
    }

    // Generate images
    const result = await imageGenerationService.generate(db, {
      prompt: validatedBody.prompt,
      provider: (validatedBody.provider as ImageProviderType) || 'openai',
      model: validatedBody.model,
      n: validatedBody.n,
      size: validatedBody.size,
      quality: validatedBody.quality,
      style: validatedBody.style,
      negativePrompt: validatedBody.negativePrompt,
      worldbuildingContext: validatedBody.worldbuildingContext as WorldbuildingContext[],
    });

    return c.json(result, 200);
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    const err = error as any;
    console.error('[AI Image] Error in generate endpoint:', err);

    if (err.name === 'ZodError') {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    return c.json({ error: err.message || 'Failed to generate image' }, 503);
  }
});

// Get available models for a provider
const modelsRoute = createRoute({
  method: 'get',
  path: '/models/{provider}',
  tags: ['AI Image Generation'],
  summary: 'Get available models',
  description: 'Get available models for a specific provider',
  operationId: 'getProviderModels',
  request: {
    params: z.object({
      provider: ProviderTypeSchema,
    }),
  },
  responses: {
    200: {
      description: 'Available models',
      content: {
        'application/json': {
          schema: z.object({
            models: z.array(ModelInfoSchema),
          }),
        },
      },
    },
    404: {
      description: 'Provider not found',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiImageRoutes.openapi(modelsRoute, async (c) => {
  const db = c.get('db');
  const { provider } = c.req.valid('param');

  // Ensure service is configured
  await imageGenerationService.configure(db);

  const providerInstance = imageGenerationService.getProvider(provider as ImageProviderType);
  if (!providerInstance) {
    return c.json({ error: `Provider ${provider} not found` }, 404);
  }

  return c.json({ models: providerInstance.getModels() }, 200);
});

// ============================================================================
// Custom Sizes Routes
// ============================================================================

// Get custom image sizes
const getCustomSizesRoute = createRoute({
  method: 'get',
  path: '/custom-sizes',
  tags: ['AI Image Generation'],
  summary: 'Get custom image sizes',
  description: 'Get user-defined custom image size profiles',
  operationId: 'getCustomImageSizes',
  responses: {
    200: {
      description: 'Custom sizes',
      content: { 'application/json': { schema: CustomSizesResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiImageRoutes.openapi(getCustomSizesRoute, async (c) => {
  const db = c.get('db');

  try {
    const sizesJson = await configService.get(db, 'AI_IMAGE_CUSTOM_SIZES');
    const sizes: CustomImageSize[] =
      sizesJson && typeof sizesJson === 'string' ? JSON.parse(sizesJson) : [];
    return c.json({ sizes }, 200);
  } catch (error) {
    console.error('[AI Image] Error getting custom sizes:', error);
    return c.json({ sizes: [] }, 200);
  }
});

// Update custom image sizes (admin only)
const updateCustomSizesRoute = createRoute({
  method: 'put',
  path: '/custom-sizes',
  tags: ['AI Image Generation'],
  summary: 'Update custom image sizes',
  description: 'Update user-defined custom image size profiles (admin only)',
  operationId: 'updateCustomImageSizes',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            sizes: z.array(CustomImageSizeSchema),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Custom sizes updated',
      content: { 'application/json': { schema: CustomSizesResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    403: {
      description: 'Forbidden - admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

// Admin-only middleware for this route
aiImageRoutes.put('/custom-sizes', requireAdmin);

aiImageRoutes.openapi(updateCustomSizesRoute, async (c) => {
  const db = c.get('db');

  try {
    const body = await c.req.json();
    const validated = z.object({ sizes: z.array(CustomImageSizeSchema) }).parse(body);

    // Validate unique IDs
    const ids = new Set<string>();
    for (const size of validated.sizes) {
      if (ids.has(size.id)) {
        return c.json({ error: `Duplicate size ID: ${size.id}` }, 400);
      }
      ids.add(size.id);
    }

    // Save to config
    await configService.set(db, 'AI_IMAGE_CUSTOM_SIZES', JSON.stringify(validated.sizes));

    return c.json({ sizes: validated.sizes }, 200);
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    const err = error as any;
    console.error('[AI Image] Error updating custom sizes:', err);

    if (err.name === 'ZodError') {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    return c.json({ error: err.message || 'Failed to update custom sizes' }, 400);
  }
});

// ============================================================================
// Default Models Route (text-to-image)
// ============================================================================

// Get default models for all text-to-image providers
// This is the single source of truth for model configurations
const defaultModelsRoute = createRoute({
  method: 'get',
  path: '/default-models',
  tags: ['AI Image Generation'],
  summary: 'Get default text-to-image models',
  description:
    'Get default model configurations for all text-to-image providers. This is the authoritative source of available models - frontend should use this instead of hardcoding model lists.',
  operationId: 'getDefaultTextToImageModels',
  responses: {
    200: {
      description: 'Default models for all providers',
      content: { 'application/json': { schema: DefaultTextToImageModelsResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiImageRoutes.openapi(defaultModelsRoute, async (c) => {
  // Return the default models from each provider
  // These are the built-in defaults that can be overridden via admin config
  return c.json(
    {
      providers: {
        openai: {
          name: 'OpenAI',
          models: DEFAULT_OPENAI_MODELS,
        },
        openrouter: {
          name: 'OpenRouter',
          models: DEFAULT_OPENROUTER_MODELS,
        },
        falai: {
          name: 'Fal.ai',
          models: DEFAULT_FALAI_MODELS,
        },
      },
    },
    200
  );
});

export default aiImageRoutes;
