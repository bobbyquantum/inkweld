/**
 * Zod/OpenAPI schemas for the AI provider routes.
 */
import { z } from '@hono/zod-openapi';

export const ProviderStatusSchema = z
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

export const ProvidersStatusResponseSchema = z
  .object({
    providers: z.array(ProviderStatusSchema).openapi({ description: 'All AI providers' }),
  })
  .openapi('ProvidersStatusResponse');

export const SetProviderKeyRequestSchema = z
  .object({
    apiKey: z.string().min(1).openapi({ description: 'API key to set (or empty to clear)' }),
  })
  .openapi('SetProviderKeyRequest');

export const SetProviderEndpointRequestSchema = z
  .object({
    endpoint: z.string().openapi({ description: 'Custom endpoint URL (or empty to clear)' }),
  })
  .openapi('SetProviderEndpointRequest');

export const SetProviderAccountIdRequestSchema = z
  .object({
    accountId: z.string().openapi({ description: 'Account ID (or empty to clear)' }),
  })
  .openapi('SetProviderAccountIdRequest');

export const SuccessResponseSchema = z
  .object({
    success: z.boolean().openapi({ description: 'Whether the operation succeeded' }),
  })
  .openapi('ProviderSuccessResponse');

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
  })
  .openapi('ProviderError');

export const SetImageEnabledRequestSchema = z
  .object({
    enabled: z.boolean().openapi({ description: 'Whether image generation is enabled' }),
  })
  .openapi('SetImageEnabledRequest');

export const OpenRouterModelSchema = z
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

export const OpenRouterModelsResponseSchema = z
  .object({
    models: z.array(OpenRouterModelSchema).openapi({ description: 'Available models' }),
    cached: z.boolean().openapi({ description: 'Whether the response was from cache' }),
    lastUpdated: z.string().optional().openapi({ description: 'ISO timestamp of last update' }),
  })
  .openapi('OpenRouterModelsResponse');

// Image model schema (simplified for image generation)
export const ImageModelSchema = z
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

export const ImageModelsResponseSchema = z
  .object({
    models: z.array(ImageModelSchema).openapi({ description: 'Available image models' }),
    cached: z.boolean().openapi({ description: 'Whether the response was from cache' }),
    lastUpdated: z.string().optional().openapi({ description: 'ISO timestamp of last update' }),
  })
  .openapi('ImageModelsResponse');

// Fal.ai model category type (used in OpenAPI schema generation)
const _FalaiCategorySchema = z
  .enum(['text-to-image', 'image-to-image', 'image-to-video', 'text-to-video'])
  .openapi('FalaiCategory');

export const FalaiModelMetadataSchema = z
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

export const WorkersAiModelsResponseSchema = z
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
