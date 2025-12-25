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
}

const PROVIDER_DEFINITIONS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models for text, DALL-E for images (or OpenAI-compatible API)',
    supportsImages: true,
    supportsText: true,
    apiKeyConfigKey: 'AI_OPENAI_API_KEY',
    endpointConfigKey: 'AI_OPENAI_ENDPOINT',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access to many models including Claude, Gemini, Flux',
    supportsImages: true,
    supportsText: true,
    apiKeyConfigKey: 'AI_OPENROUTER_API_KEY',
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
  },
  {
    id: 'falai',
    name: 'Fal.ai',
    description: 'Fal.ai image generation (Flux, SDXL)',
    supportsImages: true,
    supportsText: false,
    apiKeyConfigKey: 'AI_FALAI_API_KEY',
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

      return {
        id: def.id,
        name: def.name,
        hasApiKey,
        description: def.description,
        supportsImages: def.supportsImages,
        supportsText: def.supportsText,
        requiresEndpoint: !!def.endpointConfigKey,
        hasEndpoint,
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

// Simple in-memory cache for OpenRouter models
let openRouterModelsCache: {
  models: z.infer<typeof OpenRouterModelSchema>[];
  timestamp: number;
} | null = null;
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

export { aiProvidersRoutes };
