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
import { logger } from '../services/logger.service';
import type { AppContext } from '../types/context';

const providerLog = logger.child('AIProviders');

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
    requiresAccountId: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether provider requires an account ID (e.g., Workers AI)' }),
    hasAccountId: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether an account ID is configured' }),
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

const SetProviderAccountIdRequestSchema = z
  .object({
    accountId: z.string().openapi({ description: 'Account ID (or empty to clear)' }),
  })
  .openapi('SetProviderAccountIdRequest');

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
  accountIdConfigKey?: string; // Config key for account ID (e.g., Workers AI)
  imageEnabledConfigKey?: string; // Config key for image generation enabled state
  textEnabledConfigKey?: string; // Config key for text generation enabled state
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
  {
    id: 'workersai',
    name: 'Cloudflare Workers AI',
    description: 'Cloudflare AI models (Llama, Mistral, FLUX). Free tier: 10K neurons/day.',
    supportsImages: true,
    supportsText: true,
    apiKeyConfigKey: 'AI_WORKERSAI_API_TOKEN',
    accountIdConfigKey: 'AI_WORKERSAI_ACCOUNT_ID',
    imageEnabledConfigKey: 'AI_IMAGE_WORKERSAI_ENABLED',
    textEnabledConfigKey: 'AI_TEXT_WORKERSAI_ENABLED',
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

      // Check account ID for providers that require it (e.g., Workers AI)
      let hasAccountId: boolean | undefined;
      if (def.accountIdConfigKey) {
        const accountIdConfig = await configService.get(
          db,
          def.accountIdConfigKey as Parameters<typeof configService.get>[1]
        );
        hasAccountId = !!accountIdConfig.value;
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
        requiresAccountId: !!def.accountIdConfigKey,
        hasAccountId,
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

// Set provider account ID (admin only, for providers that require it like Workers AI)
const setAccountIdRoute = createRoute({
  method: 'put',
  path: '/:providerId/account-id',
  tags: ['AI Providers'],
  summary: 'Set provider account ID',
  description: 'Set or update the account ID for a provider (e.g., Cloudflare Workers AI)',
  operationId: 'setAiProviderAccountId',
  request: {
    params: z.object({
      providerId: z.string().openapi({ description: 'Provider ID' }),
    }),
    body: {
      content: {
        'application/json': { schema: SetProviderAccountIdRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Account ID updated',
      content: { 'application/json': { schema: SuccessResponseSchema } },
    },
    400: {
      description: 'Invalid provider or provider does not require account ID',
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

aiProvidersRoutes.use('/:providerId/account-id', requireAdmin);
aiProvidersRoutes.openapi(setAccountIdRoute, async (c) => {
  const db = c.get('db');
  const { providerId } = c.req.valid('param');
  const { accountId } = c.req.valid('json');

  const provider = PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
  if (!provider) {
    return c.json({ error: `Unknown provider: ${providerId}` }, 400);
  }

  if (!provider.accountIdConfigKey) {
    return c.json({ error: `Provider ${providerId} does not require an account ID` }, 400);
  }

  await configService.set(
    db,
    provider.accountIdConfigKey as Parameters<typeof configService.set>[1],
    accountId
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
    supportsImageInput: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether model supports image input (for image-to-image)' }),
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
      providerLog.error('Failed to fetch models', { status: response.status, error: errorText });
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
        architecture?: {
          modality?: string;
          input_modalities?: string[];
          output_modalities?: string[];
        };
      }>;
    };

    // Transform and filter models (only include text models)
    // Use output_modalities to properly detect text vs image-only models
    const models = data.data
      .filter((m) => {
        // Include models that output text
        const outputModalities = m.architecture?.output_modalities || [];
        // If no output_modalities defined, assume it's a text model (legacy)
        if (outputModalities.length === 0) return true;
        // Include if it can output text
        return outputModalities.includes('text');
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
    providerLog.error(' Error fetching models:', err);
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

  try {
    // Fetch models from OpenRouter's frontend API which includes all available models
    // The /api/v1/models endpoint only returns a subset, but /api/frontend/models has the full list
    // including FLUX, Gemini, GPT-5 Image, and other image generation models
    const response = await fetch('https://openrouter.ai/api/frontend/models', {
      headers: {
        'HTTP-Referer': 'https://inkweld.app',
        'X-Title': 'Inkweld',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      providerLog.error('Failed to fetch image models', {
        status: response.status,
        error: errorText,
      });
      return c.json({ error: `OpenRouter API error: ${response.status}` }, 502);
    }

    const data = (await response.json()) as {
      data: Array<{
        slug: string;
        name: string;
        short_name?: string;
        description?: string;
        input_modalities?: string[];
        output_modalities?: string[];
      }>;
    };

    // Filter for models that can OUTPUT images
    // The frontend API has modalities at the top level (not nested under architecture)
    providerLog.info(`OpenRouter API returned ${data.data.length} total models`);

    const models = data.data
      .filter((m) => {
        // Check if model has image in output_modalities
        const outputModalities = m.output_modalities || [];
        return outputModalities.includes('image');
      })
      .map((m) => {
        // Check if model supports image INPUT (for image-to-image)
        const inputModalities = m.input_modalities || [];
        const supportsImageInput = inputModalities.includes('image');

        return {
          id: m.slug, // Frontend API uses 'slug' instead of 'id'
          name: m.name || m.short_name || m.slug,
          description: m.description,
          provider: 'openrouter' as const,
          supportsImageInput,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    providerLog.info(`Filtered to ${models.length} image generation models`);

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
    providerLog.error(' Error fetching image models:', err);
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
      providerLog.error('Failed to fetch models', { status: response.status, error: errorText });
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
    providerLog.error(' Error fetching models:', err);
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
    providerLog.error(' Error fetching model metadata:', err);
    return c.json({ error: 'Failed to fetch model metadata from Fal.ai' }, 502);
  }
});

// ============================================================================
// Workers AI Model Search
// ============================================================================

// Cache for Workers AI models (keyed by task type)
const workersAiModelsCacheByTask: Record<
  string,
  {
    models: Array<{
      id: string;
      name: string;
      description?: string;
      task?: string;
      provider: 'workersai';
    }>;
    timestamp: number;
  }
> = {};

const WorkersAiModelsResponseSchema = z
  .object({
    models: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        task: z.string().optional(),
        provider: z.literal('workersai'),
      })
    ),
    cached: z.boolean(),
    lastUpdated: z.string(),
  })
  .openapi('WorkersAiModelsResponse');

// Get Workers AI models
const getWorkersAiModelsRoute = createRoute({
  method: 'get',
  path: '/workersai/models',
  tags: ['AI Providers'],
  summary: 'Get Cloudflare Workers AI models',
  description:
    'Fetch available models from Cloudflare Workers AI. Can filter by task type. Results are cached for 1 hour.',
  operationId: 'getWorkersAiModels',
  parameters: [
    {
      name: 'task',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: [
          'Text Generation',
          'Text-to-Image',
          'Image-to-Text',
          'Text Embeddings',
          'Automatic Speech Recognition',
          'Translation',
          'Summarization',
          'Text Classification',
          'Object Detection',
          'Image Classification',
        ],
      },
      description: 'Filter models by task type',
    },
    {
      name: 'q',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Search query to filter models by name',
    },
  ],
  responses: {
    200: {
      description: 'List of available models',
      content: { 'application/json': { schema: WorkersAiModelsResponseSchema } },
    },
    400: {
      description: 'Workers AI API credentials not configured',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Failed to fetch from Workers AI',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.openapi(getWorkersAiModelsRoute, async (c) => {
  const db = c.get('db');
  const task = c.req.query('task');
  const searchQuery = c.req.query('q');

  // Cache key based on task (or 'all')
  const cacheKey = task || 'all';

  // If searching, don't use cache (search is dynamic)
  const useCache = !searchQuery;

  // Check if we have a valid cache for this task (only for non-search requests)
  const cachedData = workersAiModelsCacheByTask[cacheKey];
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

  // Get Workers AI credentials
  const apiTokenConfig = await configService.get(db, 'AI_WORKERSAI_API_TOKEN');
  const accountIdConfig = await configService.get(db, 'AI_WORKERSAI_ACCOUNT_ID');

  if (!apiTokenConfig.value || !accountIdConfig.value) {
    return c.json({ error: 'Workers AI API token and account ID must be configured' }, 400);
  }

  try {
    // Build URL with query parameters
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountIdConfig.value}/ai/models/search`
    );
    if (task) {
      url.searchParams.set('task', task);
    }
    if (searchQuery) {
      url.searchParams.set('search', searchQuery);
    }
    url.searchParams.set('per_page', '100');

    // Fetch models from Cloudflare
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiTokenConfig.value}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      providerLog.error('Failed to fetch Workers AI models', {
        status: response.status,
        error: errorText,
      });
      return c.json({ error: `Workers AI API error: ${response.status}` }, 502);
    }

    const data = (await response.json()) as {
      success: boolean;
      result: Array<{
        id: string;
        name: string;
        description?: string;
        task?: { name?: string };
      }>;
      errors?: Array<{ message: string }>;
    };

    if (!data.success) {
      const errorMsg = data.errors?.[0]?.message || 'Unknown error';
      providerLog.error('Workers AI API error', { error: errorMsg });
      return c.json({ error: `Workers AI API error: ${errorMsg}` }, 502);
    }

    // Transform models
    const models = data.result
      .map((m) => ({
        id: m.name, // Workers AI uses 'name' as the model identifier in run calls
        name: m.name.split('/').pop() || m.name,
        description: m.description,
        task: m.task?.name,
        provider: 'workersai' as const,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Update cache for this task (only for non-search requests)
    if (useCache) {
      workersAiModelsCacheByTask[cacheKey] = {
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
    providerLog.error('Error fetching Workers AI models:', err);
    return c.json({ error: 'Failed to fetch models from Workers AI' }, 502);
  }
});

// Get Workers AI image models (shortcut filtered by Text-to-Image task)
const getWorkersAiImageModelsRoute = createRoute({
  method: 'get',
  path: '/workersai/image-models',
  tags: ['AI Providers'],
  summary: 'Get Cloudflare Workers AI image generation models',
  description:
    'Fetch available image generation models from Cloudflare Workers AI. This is a shortcut for filtering by Text-to-Image task.',
  operationId: 'getWorkersAiImageModels',
  responses: {
    200: {
      description: 'List of available image models',
      content: { 'application/json': { schema: ImageModelsResponseSchema } },
    },
    400: {
      description: 'Workers AI API credentials not configured',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Failed to fetch from Workers AI',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiProvidersRoutes.openapi(getWorkersAiImageModelsRoute, async (c) => {
  const db = c.get('db');

  // Check if we have a valid cache for image models
  const cacheKey = 'Text-to-Image';
  const cachedData = workersAiModelsCacheByTask[cacheKey];
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
    return c.json(
      {
        models: cachedData.models,
        cached: true,
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
      },
      200
    );
  }

  // Get Workers AI credentials
  const apiTokenConfig = await configService.get(db, 'AI_WORKERSAI_API_TOKEN');
  const accountIdConfig = await configService.get(db, 'AI_WORKERSAI_ACCOUNT_ID');

  if (!apiTokenConfig.value || !accountIdConfig.value) {
    return c.json({ error: 'Workers AI API token and account ID must be configured' }, 400);
  }

  try {
    // Fetch image generation models specifically
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountIdConfig.value}/ai/models/search`
    );
    url.searchParams.set('task', 'Text-to-Image');
    url.searchParams.set('per_page', '100');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiTokenConfig.value}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      providerLog.error('Failed to fetch Workers AI image models', {
        status: response.status,
        error: errorText,
      });
      // Parse error if possible for better user feedback
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors?.[0]?.message) {
          errorDetail = errorJson.errors[0].message;
        }
      } catch {
        // Use status code if JSON parsing fails
      }
      return c.json({ error: `Workers AI API error: ${errorDetail}` }, 502);
    }

    const data = (await response.json()) as {
      success: boolean;
      result: Array<{
        id: string;
        name: string;
        description?: string;
        task?: { name?: string };
      }>;
      errors?: Array<{ message: string }>;
    };

    if (!data.success) {
      const errorMsg = data.errors?.[0]?.message || 'Unknown error';
      providerLog.error('Workers AI API error', { error: errorMsg });
      return c.json({ error: `Workers AI API error: ${errorMsg}` }, 502);
    }

    // Transform models
    const models = data.result
      .map((m) => ({
        id: m.name,
        name: m.name.split('/').pop() || m.name,
        description: m.description,
        task: m.task?.name,
        provider: 'workersai' as const,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Update cache
    workersAiModelsCacheByTask[cacheKey] = {
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
    const errMessage = err instanceof Error ? err.message : String(err);
    providerLog.error('Error fetching Workers AI image models', { error: errMessage });
    return c.json({ error: `Failed to fetch image models from Workers AI: ${errMessage}` }, 502);
  }
});

export { aiProvidersRoutes };
