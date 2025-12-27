/**
 * AI Provider Management Routes
 *
 * Centralized routes for managing AI provider API keys.
 * These keys are shared across all AI features (image generation, text generation).
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { configService } from '../services/config.service';
import type { AppContext } from '../types/context';

const aiProvidersRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all routes
aiProvidersRoutes.use('*', requireAuth);

// ============================================================================
// Schemas
// ============================================================================

const ProviderStatusSchema = z
  .object({
    id: z.string().openapi({ description: 'Provider identifier' }),
    name: z.string().openapi({ description: 'Provider display name' }),
    hasApiKey: z.boolean().openapi({ description: 'Whether an API key is configured' }),
    description: z.string().openapi({ description: 'Provider description' }),
    supportsImages: z
      .boolean()
      .openapi({ description: 'Whether provider supports image generation' }),
    supportsText: z.boolean().openapi({ description: 'Whether provider supports text generation' }),
    requiresEndpoint: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether provider requires a custom endpoint' }),
    hasEndpoint: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether a custom endpoint is configured' }),
    imageEnabled: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether image generation is enabled for this provider' }),
    imageEnabledExplicit: z.boolean().optional().openapi({
      description: 'Whether the enabled state was explicitly set (vs auto-detected from API key)',
    }),
  })
  .openapi('ProviderStatus');

const ProvidersStatusResponseSchema = z
  .object({
    providers: z.array(ProviderStatusSchema).openapi({ description: 'All AI providers' }),
  })
  .openapi('ProvidersStatusResponse');

const SetProviderKeyRequestSchema = z
  .object({
    apiKey: z.string().min(1).openapi({ description: 'API key to set (or empty to clear)' }),
  })
  .openapi('SetProviderKeyRequest');

const SetProviderEndpointRequestSchema = z
  .object({
    endpoint: z.string().openapi({ description: 'Custom endpoint URL (or empty to clear)' }),
  })
  .openapi('SetProviderEndpointRequest');

const SuccessResponseSchema = z
  .object({
    success: z.boolean().openapi({ description: 'Whether the operation succeeded' }),
  })
  .openapi('ProviderSuccessResponse');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
  })
  .openapi('ProviderError');

// ============================================================================
// Provider Definitions
// ============================================================================

interface ProviderDef {
  id: string;
  name: string;
  description: string;
  supportsImages: boolean;
  supportsText: boolean;
  apiKeyConfigKey: string;
  endpointConfigKey?: string;
  imageEnabledConfigKey?: string; // Config key for image generation enabled state
}

const PROVIDER_DEFINITIONS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models for text and image generation (or OpenAI-compatible API)',
    supportsImages: true,
    supportsText: true,
    apiKeyConfigKey: 'AI_OPENAI_API_KEY',
    endpointConfigKey: 'AI_OPENAI_ENDPOINT',
    imageEnabledConfigKey: 'AI_IMAGE_OPENAI_ENABLED',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access to many models including Claude, Gemini, Flux',
    supportsImages: true,
    supportsText: true,
    apiKeyConfigKey: 'AI_OPENROUTER_API_KEY',
    imageEnabledConfigKey: 'AI_IMAGE_OPENROUTER_ENABLED',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for text generation',
    supportsImages: false,
    supportsText: true,
    apiKeyConfigKey: 'AI_ANTHROPIC_API_KEY',
  },
  {
    id: 'stable-diffusion',
    name: 'Stable Diffusion',
    description: 'Self-hosted Stable Diffusion API (Automatic1111, ComfyUI)',
    supportsImages: true,
    supportsText: false,
    apiKeyConfigKey: 'AI_SD_API_KEY',
    endpointConfigKey: 'AI_SD_ENDPOINT',
    imageEnabledConfigKey: 'AI_IMAGE_SD_ENABLED',
  },
  {
    id: 'falai',
    name: 'Fal.ai',
    description: 'Fal.ai image generation (Flux, SDXL)',
    supportsImages: true,
    supportsText: false,
    apiKeyConfigKey: 'AI_FALAI_API_KEY',
    imageEnabledConfigKey: 'AI_IMAGE_FALAI_ENABLED',
  },
];

// ============================================================================
// Routes
// ============================================================================

// Get status of all providers
const getStatusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['AI Providers'],
  summary: 'Get AI provider status',
  description: 'Get the configuration status of all AI providers',
  operationId: 'getAiProvidersStatus',
  responses: {
    200: {
      description: 'Provider status',
      content: { 'application/json': { schema: ProvidersStatusResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.openapi(getStatusRoute, async (c) => {
  const db = c.get('db');

  const providers = await Promise.all(
    PROVIDER_DEFINITIONS.map(async (def) => {
      const apiKeyConfig = await configService.get(
        db,
        def.apiKeyConfigKey as Parameters<typeof configService.get>[1]
      );
      const hasApiKey = !!apiKeyConfig.value;

      let hasEndpoint: boolean | undefined;
      if (def.endpointConfigKey) {
        const endpointConfig = await configService.get(
          db,
          def.endpointConfigKey as Parameters<typeof configService.get>[1]
        );
        hasEndpoint = !!endpointConfig.value;
      }

      // Get image enabled state if this provider supports images
      let imageEnabled: boolean | undefined;
      let imageEnabledExplicit: boolean | undefined;
      if (def.supportsImages && def.imageEnabledConfigKey) {
        const enabledConfig = await configService.getBooleanWithSource(
          db,
          def.imageEnabledConfigKey as Parameters<typeof configService.get>[1]
        );
        imageEnabledExplicit = enabledConfig.isExplicitlySet;
        // If explicitly set, use that value; otherwise auto-enable if API key (or endpoint for SD) is present
        if (enabledConfig.isExplicitlySet) {
          imageEnabled = enabledConfig.value;
        } else {
          imageEnabled = def.id === 'stable-diffusion' ? !!hasEndpoint : hasApiKey;
        }
      }

      return {
        id: def.id,
        name: def.name,
        hasApiKey,
        description: def.description,
        supportsImages: def.supportsImages,
        supportsText: def.supportsText,
        requiresEndpoint: !!def.endpointConfigKey,
        hasEndpoint,
        imageEnabled,
        imageEnabledExplicit,
      };
    })
  );

  return c.json({ providers }, 200);
});

// Set provider API key (admin only)
const setKeyRoute = createRoute({
  method: 'put',
  path: '/:providerId/key',
  tags: ['AI Providers'],
  summary: 'Set provider API key',
  description: 'Set or update the API key for a provider',
  operationId: 'setAiProviderKey',
  request: {
    params: z.object({
      providerId: z.string().openapi({ description: 'Provider ID' }),
    }),
    body: {
      content: {
        'application/json': { schema: SetProviderKeyRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'API key updated',
      content: { 'application/json': { schema: SuccessResponseSchema } },
    },
    400: {
      description: 'Invalid provider',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    403: {
      description: 'Admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.use('/:providerId/key', requireAdmin);
aiProvidersRoutes.openapi(setKeyRoute, async (c) => {
  const db = c.get('db');
  const { providerId } = c.req.valid('param');
  const { apiKey } = c.req.valid('json');

  const provider = PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
  if (!provider) {
    return c.json({ error: `Unknown provider: ${providerId}` }, 400);
  }

  await configService.set(
    db,
    provider.apiKeyConfigKey as Parameters<typeof configService.set>[1],
    apiKey
  );

  return c.json({ success: true }, 200);
});

// Delete provider API key (admin only)
const deleteKeyRoute = createRoute({
  method: 'delete',
  path: '/:providerId/key',
  tags: ['AI Providers'],
  summary: 'Delete provider API key',
  description: 'Remove the API key for a provider',
  operationId: 'deleteAiProviderKey',
  request: {
    params: z.object({
      providerId: z.string().openapi({ description: 'Provider ID' }),
    }),
  },
  responses: {
    200: {
      description: 'API key deleted',
      content: { 'application/json': { schema: SuccessResponseSchema } },
    },
    400: {
      description: 'Invalid provider',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    403: {
      description: 'Admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.use('/:providerId/key', requireAdmin);
aiProvidersRoutes.openapi(deleteKeyRoute, async (c) => {
  const db = c.get('db');
  const { providerId } = c.req.valid('param');

  const provider = PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
  if (!provider) {
    return c.json({ error: `Unknown provider: ${providerId}` }, 400);
  }

  await configService.set(
    db,
    provider.apiKeyConfigKey as Parameters<typeof configService.set>[1],
    ''
  );

  return c.json({ success: true }, 200);
});

// Set provider endpoint (admin only, for providers that support it)
const setEndpointRoute = createRoute({
  method: 'put',
  path: '/:providerId/endpoint',
  tags: ['AI Providers'],
  summary: 'Set provider endpoint',
  description: 'Set or update the custom endpoint for a provider (e.g., Stable Diffusion)',
  operationId: 'setAiProviderEndpoint',
  request: {
    params: z.object({
      providerId: z.string().openapi({ description: 'Provider ID' }),
    }),
    body: {
      content: {
        'application/json': { schema: SetProviderEndpointRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Endpoint updated',
      content: { 'application/json': { schema: SuccessResponseSchema } },
    },
    400: {
      description: 'Invalid provider or provider does not support custom endpoints',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    403: {
      description: 'Admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.use('/:providerId/endpoint', requireAdmin);
aiProvidersRoutes.openapi(setEndpointRoute, async (c) => {
  const db = c.get('db');
  const { providerId } = c.req.valid('param');
  const { endpoint } = c.req.valid('json');

  const provider = PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
  if (!provider) {
    return c.json({ error: `Unknown provider: ${providerId}` }, 400);
  }

  if (!provider.endpointConfigKey) {
    return c.json({ error: `Provider ${providerId} does not support custom endpoints` }, 400);
  }

  await configService.set(
    db,
    provider.endpointConfigKey as Parameters<typeof configService.set>[1],
    endpoint
  );

  return c.json({ success: true }, 200);
});

// Set provider image enabled state (admin only)
const SetImageEnabledRequestSchema = z
  .object({
    enabled: z.boolean().openapi({ description: 'Whether image generation is enabled' }),
  })
  .openapi('SetImageEnabledRequest');

const setImageEnabledRoute = createRoute({
  method: 'put',
  path: '/:providerId/image-enabled',
  tags: ['AI Providers'],
  summary: 'Set provider image generation enabled state',
  description: 'Enable or disable image generation for a provider',
  operationId: 'setAiProviderImageEnabled',
  request: {
    params: z.object({
      providerId: z.string().openapi({ description: 'Provider ID' }),
    }),
    body: {
      content: {
        'application/json': { schema: SetImageEnabledRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Image enabled state updated',
      content: { 'application/json': { schema: SuccessResponseSchema } },
    },
    400: {
      description: 'Invalid provider or provider does not support images',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    403: {
      description: 'Admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.use('/:providerId/image-enabled', requireAdmin);
aiProvidersRoutes.openapi(setImageEnabledRoute, async (c) => {
  const db = c.get('db');
  const { providerId } = c.req.valid('param');
  const { enabled } = c.req.valid('json');

  const provider = PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
  if (!provider) {
    return c.json({ error: `Unknown provider: ${providerId}` }, 400);
  }

  if (!provider.supportsImages || !provider.imageEnabledConfigKey) {
    return c.json({ error: `Provider ${providerId} does not support image generation` }, 400);
  }

  await configService.set(
    db,
    provider.imageEnabledConfigKey as Parameters<typeof configService.set>[1],
    enabled ? 'true' : 'false'
  );

  return c.json({ success: true }, 200);
});

// ============================================================================
// OpenRouter Models Fetching
// ============================================================================

const OpenRouterModelSchema = z
  .object({
    id: z.string().openapi({ description: 'Model ID' }),
    name: z.string().openapi({ description: 'Model display name' }),
    description: z.string().optional().openapi({ description: 'Model description' }),
    contextLength: z.number().optional().openapi({ description: 'Context length in tokens' }),
    pricing: z
      .object({
        prompt: z.string().optional().openapi({ description: 'Price per 1M prompt tokens' }),
        completion: z
          .string()
          .optional()
          .openapi({ description: 'Price per 1M completion tokens' }),
      })
      .optional()
      .openapi({ description: 'Pricing information' }),
  })
  .openapi('OpenRouterModel');

const OpenRouterModelsResponseSchema = z
  .object({
    models: z.array(OpenRouterModelSchema).openapi({ description: 'Available models' }),
    cached: z.boolean().openapi({ description: 'Whether the response was from cache' }),
    lastUpdated: z.string().optional().openapi({ description: 'ISO timestamp of last update' }),
  })
  .openapi('OpenRouterModelsResponse');

// Image model schema (simplified for image generation)
const ImageModelSchema = z
  .object({
    id: z.string().openapi({ description: 'Model ID' }),
    name: z.string().openapi({ description: 'Model display name' }),
    description: z.string().optional().openapi({ description: 'Model description' }),
    category: z.string().optional().openapi({ description: 'Model category' }),
    provider: z.string().openapi({ description: 'Provider identifier' }),
  })
  .openapi('ImageModel');

const ImageModelsResponseSchema = z
  .object({
    models: z.array(ImageModelSchema).openapi({ description: 'Available image models' }),
    cached: z.boolean().openapi({ description: 'Whether the response was from cache' }),
    lastUpdated: z.string().optional().openapi({ description: 'ISO timestamp of last update' }),
  })
  .openapi('ImageModelsResponse');

// Simple in-memory cache for OpenRouter models
let openRouterModelsCache: {
  models: z.infer<typeof OpenRouterModelSchema>[];
  timestamp: number;
} | null = null;

// Cache for OpenRouter IMAGE models
let openRouterImageModelsCache: {
  models: z.infer<typeof ImageModelSchema>[];
  timestamp: number;
} | null = null;

// Cache for Fal.ai models (per category)
const falaiModelsCacheByCategory: Record<
  string,
  {
    models: z.infer<typeof ImageModelSchema>[];
    timestamp: number;
  }
> = {};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Get OpenRouter models
const getOpenRouterModelsRoute = createRoute({
  method: 'get',
  path: '/openrouter/models',
  tags: ['AI Providers'],
  summary: 'Get OpenRouter models',
  description:
    'Fetch available models from OpenRouter API. Results are cached for 1 hour. Requires OpenRouter API key to be configured.',
  operationId: 'getOpenRouterModels',
  responses: {
    200: {
      description: 'List of available models',
      content: { 'application/json': { schema: OpenRouterModelsResponseSchema } },
    },
    400: {
      description: 'OpenRouter API key not configured',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Failed to fetch from OpenRouter',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.openapi(getOpenRouterModelsRoute, async (c) => {
  const db = c.get('db');

  // Check if we have a valid cache
  if (openRouterModelsCache && Date.now() - openRouterModelsCache.timestamp < CACHE_TTL_MS) {
    return c.json(
      {
        models: openRouterModelsCache.models,
        cached: true,
        lastUpdated: new Date(openRouterModelsCache.timestamp).toISOString(),
      },
      200
    );
  }

  // Get OpenRouter API key
  const apiKeyConfig = await configService.get(db, 'AI_OPENROUTER_API_KEY');
  if (!apiKeyConfig.value) {
    return c.json({ error: 'OpenRouter API key not configured' }, 400);
  }

  try {
    // Fetch models from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKeyConfig.value}`,
        'HTTP-Referer': 'https://inkweld.app',
        'X-Title': 'Inkweld',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenRouter] Failed to fetch models:', response.status, errorText);
      return c.json({ error: `OpenRouter API error: ${response.status}` }, 502);
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name: string;
        description?: string;
        context_length?: number;
        pricing?: {
          prompt?: string;
          completion?: string;
        };
      }>;
    };

    // Transform and filter models (only include text models)
    const models = data.data
      .filter((m) => {
        // Filter out image-only models
        const id = m.id.toLowerCase();
        return !id.includes('image') && !id.includes('flux') && !id.includes('stable-diffusion');
      })
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        contextLength: m.context_length,
        pricing: m.pricing
          ? {
              prompt: m.pricing.prompt,
              completion: m.pricing.completion,
            }
          : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Update cache
    openRouterModelsCache = {
      models,
      timestamp: Date.now(),
    };

    return c.json(
      {
        models,
        cached: false,
        lastUpdated: new Date().toISOString(),
      },
      200
    );
  } catch (err) {
    console.error('[OpenRouter] Error fetching models:', err);
    return c.json({ error: 'Failed to fetch models from OpenRouter' }, 502);
  }
});

// ============================================================================
// OpenRouter IMAGE Models Fetching
// ============================================================================

// Get OpenRouter image models
const getOpenRouterImageModelsRoute = createRoute({
  method: 'get',
  path: '/openrouter/image-models',
  tags: ['AI Providers'],
  summary: 'Get OpenRouter image models',
  description:
    'Fetch available image generation models from OpenRouter API (Flux, SDXL, etc.). Results are cached for 1 hour.',
  operationId: 'getOpenRouterImageModels',
  responses: {
    200: {
      description: 'List of available image models',
      content: { 'application/json': { schema: ImageModelsResponseSchema } },
    },
    400: {
      description: 'OpenRouter API key not configured',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Failed to fetch from OpenRouter',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.openapi(getOpenRouterImageModelsRoute, async (c) => {
  const db = c.get('db');

  // Check if we have a valid cache
  if (
    openRouterImageModelsCache &&
    Date.now() - openRouterImageModelsCache.timestamp < CACHE_TTL_MS
  ) {
    return c.json(
      {
        models: openRouterImageModelsCache.models,
        cached: true,
        lastUpdated: new Date(openRouterImageModelsCache.timestamp).toISOString(),
      },
      200
    );
  }

  // Get OpenRouter API key
  const apiKeyConfig = await configService.get(db, 'AI_OPENROUTER_API_KEY');
  if (!apiKeyConfig.value) {
    return c.json({ error: 'OpenRouter API key not configured' }, 400);
  }

  try {
    // Fetch models from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKeyConfig.value}`,
        'HTTP-Referer': 'https://inkweld.app',
        'X-Title': 'Inkweld',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenRouter] Failed to fetch image models:', response.status, errorText);
      return c.json({ error: `OpenRouter API error: ${response.status}` }, 502);
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name: string;
        description?: string;
      }>;
    };

    // Filter for IMAGE models only (opposite of text models filter)
    const models = data.data
      .filter((m) => {
        const id = m.id.toLowerCase();
        return id.includes('image') || id.includes('flux') || id.includes('stable-diffusion');
      })
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        provider: 'openrouter' as const,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Update cache
    openRouterImageModelsCache = {
      models,
      timestamp: Date.now(),
    };

    return c.json(
      {
        models,
        cached: false,
        lastUpdated: new Date().toISOString(),
      },
      200
    );
  } catch (err) {
    console.error('[OpenRouter] Error fetching image models:', err);
    return c.json({ error: 'Failed to fetch image models from OpenRouter' }, 502);
  }
});

// ============================================================================
// Fal.ai Models Fetching
// ============================================================================

// Fal.ai model category type (used in OpenAPI schema generation)
const _FalaiCategorySchema = z
  .enum(['text-to-image', 'image-to-image', 'image-to-video', 'text-to-video'])
  .openapi('FalaiCategory');

// Get Fal.ai image models
const getFalaiModelsRoute = createRoute({
  method: 'get',
  path: '/falai/models',
  tags: ['AI Providers'],
  summary: 'Get Fal.ai image models',
  description:
    'Fetch available models from Fal.ai API by category. Results are cached for 1 hour per category.',
  operationId: 'getFalaiModels',
  parameters: [
    {
      name: 'category',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['text-to-image', 'image-to-image', 'image-to-video', 'text-to-video'],
      },
      description: 'Model category (default: text-to-image)',
    },
    {
      name: 'q',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Search query to filter models',
    },
  ],
  responses: {
    200: {
      description: 'List of available image models',
      content: { 'application/json': { schema: ImageModelsResponseSchema } },
    },
    400: {
      description: 'Fal.ai API key not configured',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Failed to fetch from Fal.ai',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.openapi(getFalaiModelsRoute, async (c) => {
  const db = c.get('db');
  const searchQuery = c.req.query('q');
  const category = c.req.query('category') || 'text-to-image';

  // If searching, don't use cache (search is dynamic)
  const useCache = !searchQuery;

  // Check if we have a valid cache for this category (only for non-search requests)
  const cachedData = falaiModelsCacheByCategory[category];
  if (useCache && cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
    return c.json(
      {
        models: cachedData.models,
        cached: true,
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
      },
      200
    );
  }

  // Get Fal.ai API key (optional - API works without it but with rate limits)
  const apiKeyConfig = await configService.get(db, 'AI_FALAI_API_KEY');

  try {
    // Build URL with query parameters
    const url = new URL('https://api.fal.ai/v1/models');
    url.searchParams.set('category', category);
    url.searchParams.set('status', 'active');
    url.searchParams.set('limit', '100');
    if (searchQuery) {
      url.searchParams.set('q', searchQuery);
    }

    // Fetch models from Fal.ai
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if available (grants higher rate limits)
    if (apiKeyConfig.value) {
      headers['Authorization'] = `Key ${apiKeyConfig.value}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Fal.ai] Failed to fetch models:', response.status, errorText);
      return c.json({ error: `Fal.ai API error: ${response.status}` }, 502);
    }

    const data = (await response.json()) as {
      models: Array<{
        endpoint_id: string;
        metadata?: {
          display_name?: string;
          description?: string;
          category?: string;
          status?: string;
        };
      }>;
      has_more?: boolean;
    };

    // Transform models
    const models = data.models
      .map((m) => ({
        id: m.endpoint_id,
        name: m.metadata?.display_name || m.endpoint_id.split('/').pop() || m.endpoint_id,
        description: m.metadata?.description,
        category: m.metadata?.category,
        provider: 'falai' as const,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Update cache for this category (only for non-search requests)
    if (useCache) {
      falaiModelsCacheByCategory[category] = {
        models,
        timestamp: Date.now(),
      };
    }

    return c.json(
      {
        models,
        cached: false,
        lastUpdated: new Date().toISOString(),
      },
      200
    );
  } catch (err) {
    console.error('[Fal.ai] Error fetching models:', err);
    return c.json({ error: 'Failed to fetch models from Fal.ai' }, 502);
  }
});

// ============================================================================
// Fal.ai Model Metadata (with OpenAPI schema for sizes/resolutions)
// ============================================================================

import {
  fetchFalModelWithSchema,
  parseModelSchema,
  type ParsedFalModelInfo,
} from '../services/fal-model-metadata.service';

const FalaiModelMetadataSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string(),
    status: z.enum(['active', 'deprecated']),
    supportsImageInput: z.boolean(),
    supportsCustomResolutions: z.boolean(),
    supportedSizes: z.array(z.string()),
    supportedAspectRatios: z.array(z.string()),
    supportedResolutions: z.array(z.string()),
    sizeMode: z.enum(['dimensions', 'aspect_ratio', 'unknown']),
  })
  .openapi('FalaiModelMetadata');

// Get detailed Fal.ai model metadata
const getFalaiModelMetadataRoute = createRoute({
  method: 'get',
  path: '/falai/models/:modelId/metadata',
  tags: ['AI Providers'],
  summary: 'Get Fal.ai model metadata with supported sizes',
  description:
    'Fetch detailed model metadata from Fal.ai including supported sizes, resolutions, and whether custom resolutions are allowed. Uses OpenAPI schema expansion.',
  operationId: 'getFalaiModelMetadata',
  parameters: [
    {
      name: 'modelId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Model endpoint ID (e.g., fal-ai/flux-2-pro)',
    },
  ],
  responses: {
    200: {
      description: 'Model metadata with size/resolution info',
      content: { 'application/json': { schema: FalaiModelMetadataSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    404: {
      description: 'Model not found',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Failed to fetch from Fal.ai',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

// Cache for model metadata (keyed by model ID)
const falaiModelMetadataCache: Record<
  string,
  {
    data: ParsedFalModelInfo;
    timestamp: number;
  }
> = {};

aiProvidersRoutes.openapi(getFalaiModelMetadataRoute, async (c) => {
  const db = c.get('db');
  const modelId = c.req.param('modelId');

  if (!modelId) {
    return c.json({ error: 'Model ID is required' }, 400);
  }

  // Check cache
  const cached = falaiModelMetadataCache[modelId];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return c.json(cached.data, 200);
  }

  // Get Fal.ai API key (optional)
  const apiKeyConfig = await configService.get(db, 'AI_FALAI_API_KEY');
  const apiKey = apiKeyConfig.value || undefined;

  try {
    const model = await fetchFalModelWithSchema(modelId, apiKey);

    if (!model) {
      return c.json({ error: 'Model not found' }, 404);
    }

    const parsed = parseModelSchema(model);

    // Cache the result
    falaiModelMetadataCache[modelId] = {
      data: parsed,
      timestamp: Date.now(),
    };

    return c.json(parsed, 200);
  } catch (err) {
    console.error('[Fal.ai] Error fetching model metadata:', err);
    return c.json({ error: 'Failed to fetch model metadata from Fal.ai' }, 502);
  }
});

export { aiProvidersRoutes };
