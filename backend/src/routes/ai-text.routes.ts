/**
 * AI Text Generation Routes
 *
 * Unified routes for multi-provider text generation (text-to-text).
 * Supports OpenAI, OpenRouter, and Anthropic.
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { configService } from '../services/config.service';
import { logger } from '../services/logger.service';
import {
  DEFAULT_OPENAI_TEXT_MODELS,
  DEFAULT_OPENROUTER_TEXT_MODELS,
  DEFAULT_ANTHROPIC_TEXT_MODELS,
} from '../config/default-text-models';
import type { AppContext } from '../types/context';
import type { TextProviderType } from '../types/text-generation';

const aiTextLog = logger.child('AIText');
const aiTextRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all routes
aiTextRoutes.use('*', requireAuth);

// ============================================================================
// Schemas
// ============================================================================

const TextProviderTypeSchema = z
  .enum(['openai', 'openrouter', 'anthropic', 'workersai'])
  .openapi('TextProviderType');

const TextModelInfoSchema = z
  .object({
    id: z.string().openapi({ description: 'Model ID' }),
    name: z.string().openapi({ description: 'Model display name' }),
    provider: TextProviderTypeSchema,
    maxTokens: z.number().openapi({ description: 'Maximum context tokens' }),
    supportsJsonMode: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether JSON mode is supported' }),
    supportsStreaming: z
      .boolean()
      .optional()
      .openapi({ description: 'Whether streaming is supported' }),
    description: z.string().optional().openapi({ description: 'Model description' }),
    costTier: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .openapi({ description: 'Cost tier (1=cheapest, 5=most expensive)' }),
  })
  .openapi('TextModelInfo');

const TextProviderStatusSchema = z
  .object({
    type: TextProviderTypeSchema,
    name: z.string().openapi({ description: 'Provider display name' }),
    available: z.boolean().openapi({ description: 'Whether provider is available' }),
    enabled: z.boolean().openapi({ description: 'Whether provider is enabled' }),
    models: z.array(TextModelInfoSchema).openapi({ description: 'Available models' }),
    error: z.string().optional().openapi({ description: 'Error message if unavailable' }),
  })
  .openapi('TextProviderStatus');

const TextStatusResponseSchema = z
  .object({
    available: z.boolean().openapi({ description: 'Whether any provider is available' }),
    providers: z
      .array(TextProviderStatusSchema)
      .openapi({ description: 'All configured providers' }),
    defaultProvider: TextProviderTypeSchema.optional().openapi({ description: 'Default provider' }),
    lintModel: z.string().optional().openapi({ description: 'Configured lint model' }),
    imagePromptModel: z
      .string()
      .optional()
      .openapi({ description: 'Configured image prompt optimization model' }),
  })
  .openapi('TextGenerationStatus');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
  })
  .openapi('TextGenerationError');

// Default models response schema
const DefaultTextModelsResponseSchema = z
  .object({
    providers: z
      .object({
        openai: z
          .object({
            name: z.string().openapi({ description: 'Provider display name' }),
            models: z.array(TextModelInfoSchema).openapi({ description: 'Default models' }),
          })
          .openapi({ description: 'OpenAI default models' }),
        openrouter: z
          .object({
            name: z.string().openapi({ description: 'Provider display name' }),
            models: z.array(TextModelInfoSchema).openapi({ description: 'Default models' }),
          })
          .openapi({ description: 'OpenRouter default models' }),
        anthropic: z
          .object({
            name: z.string().openapi({ description: 'Provider display name' }),
            models: z.array(TextModelInfoSchema).openapi({ description: 'Default models' }),
          })
          .openapi({ description: 'Anthropic default models' }),
      })
      .openapi({ description: 'Default models grouped by provider' }),
  })
  .openapi('DefaultTextModelsResponse');

// Optimize image prompt request schema
const OptimizeImagePromptRequestSchema = z
  .object({
    rawInput: z.string().min(1).max(10000).openapi({
      description: 'Raw input text to optimize (e.g., worldbuilding data dump)',
      example:
        'Character: Elena, age 25, dark hair, blue eyes, wears leather armor, carries a sword',
    }),
    targetStyle: z.string().optional().openapi({
      description: 'Target image style',
      example: 'fantasy art, detailed, painterly',
    }),
    context: z.string().optional().openapi({
      description: 'Additional context for the optimization',
      example: 'character portrait for a book cover',
    }),
    maxLength: z.number().int().min(50).max(2000).optional().openapi({
      description: 'Maximum length of the optimized prompt',
      example: 500,
    }),
  })
  .openapi('OptimizeImagePromptRequest');

const OptimizeImagePromptResponseSchema = z
  .object({
    optimizedPrompt: z.string().openapi({ description: 'The optimized image prompt' }),
    negativePrompt: z.string().optional().openapi({ description: 'Suggested negative prompt' }),
    suggestedSize: z.string().optional().openapi({ description: 'Suggested image size' }),
    optimizationNotes: z
      .string()
      .optional()
      .openapi({ description: 'Notes about the optimization' }),
  })
  .openapi('OptimizeImagePromptResponse');

// ============================================================================
// Routes
// ============================================================================

// Get default models for all text providers
const defaultModelsRoute = createRoute({
  method: 'get',
  path: '/default-models',
  tags: ['AI Text Generation'],
  summary: 'Get default text-to-text models',
  description: 'Get the default model configurations for all text generation providers',
  operationId: 'getDefaultTextModels',
  responses: {
    200: {
      description: 'Default models by provider',
      content: { 'application/json': { schema: DefaultTextModelsResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiTextRoutes.openapi(defaultModelsRoute, async (c) => {
  return c.json(
    {
      providers: {
        openai: {
          name: 'OpenAI',
          models: DEFAULT_OPENAI_TEXT_MODELS,
        },
        openrouter: {
          name: 'OpenRouter',
          models: DEFAULT_OPENROUTER_TEXT_MODELS,
        },
        anthropic: {
          name: 'Anthropic',
          models: DEFAULT_ANTHROPIC_TEXT_MODELS,
        },
      },
    },
    200
  );
});

// Get status of all text providers
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['AI Text Generation'],
  summary: 'Get text generation status',
  description: 'Get the status of all configured text generation providers',
  operationId: 'getTextGenerationStatus',
  responses: {
    200: {
      description: 'Provider status',
      content: { 'application/json': { schema: TextStatusResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiTextRoutes.openapi(statusRoute, async (c) => {
  const db = c.get('db');

  // Get configuration values
  const configResults = await Promise.all([
    configService.get(db, 'AI_TEXT_ENABLED'),
    configService.get(db, 'AI_TEXT_DEFAULT_PROVIDER'),
    configService.get(db, 'AI_TEXT_LINT_MODEL'),
    configService.get(db, 'AI_TEXT_IMAGE_PROMPT_MODEL'),
    configService.get(db, 'AI_OPENAI_API_KEY'), // Shared provider key
    configService.get(db, 'AI_TEXT_OPENAI_ENABLED'),
    configService.get(db, 'AI_TEXT_OPENAI_MODELS'),
    configService.get(db, 'AI_OPENROUTER_API_KEY'), // Shared provider key
    configService.get(db, 'AI_TEXT_OPENROUTER_ENABLED'),
    configService.get(db, 'AI_TEXT_OPENROUTER_MODELS'),
    configService.get(db, 'AI_ANTHROPIC_API_KEY'), // Shared provider key
    configService.get(db, 'AI_TEXT_ANTHROPIC_ENABLED'),
    configService.get(db, 'AI_TEXT_ANTHROPIC_MODELS'),
  ]);

  const [
    textEnabled,
    defaultProvider,
    lintModel,
    imagePromptModel,
    openaiApiKey,
    openaiEnabled,
    openaiModels,
    openrouterApiKey,
    openrouterEnabled,
    openrouterModels,
    anthropicApiKey,
    anthropicEnabled,
    anthropicModels,
  ] = configResults.map((r) => r.value);

  // Parse model configurations
  const parseModels = (
    modelsJson: string | null,
    defaultModels: typeof DEFAULT_OPENAI_TEXT_MODELS
  ) => {
    if (!modelsJson) return defaultModels;
    try {
      return JSON.parse(modelsJson);
    } catch {
      return defaultModels;
    }
  };

  const providers: z.infer<typeof TextProviderStatusSchema>[] = [];

  // OpenAI status
  const openaiAvailable = !!openaiApiKey;
  providers.push({
    type: 'openai' as const,
    name: 'OpenAI',
    available: openaiAvailable,
    enabled: openaiEnabled === 'true',
    models: parseModels(openaiModels, DEFAULT_OPENAI_TEXT_MODELS),
    error: openaiAvailable ? undefined : 'OpenAI API key not configured',
  });

  // OpenRouter status
  const openrouterAvailable = !!openrouterApiKey;
  providers.push({
    type: 'openrouter' as const,
    name: 'OpenRouter',
    available: openrouterAvailable,
    enabled: openrouterEnabled === 'true',
    models: parseModels(openrouterModels, DEFAULT_OPENROUTER_TEXT_MODELS),
    error: openrouterAvailable ? undefined : 'OpenRouter API key not configured',
  });

  // Anthropic status
  const anthropicAvailable = !!anthropicApiKey;
  providers.push({
    type: 'anthropic' as const,
    name: 'Anthropic',
    available: anthropicAvailable,
    enabled: anthropicEnabled === 'true',
    models: parseModels(anthropicModels, DEFAULT_ANTHROPIC_TEXT_MODELS),
    error: anthropicAvailable ? undefined : 'Anthropic API key not configured',
  });

  const anyAvailable = providers.some((p) => p.available && p.enabled);

  return c.json(
    {
      available: anyAvailable && textEnabled === 'true',
      providers,
      defaultProvider: (defaultProvider as TextProviderType) || undefined,
      lintModel: lintModel || undefined,
      imagePromptModel: imagePromptModel || undefined,
    },
    200
  );
});

// Optimize image prompt endpoint
const optimizeImagePromptRoute = createRoute({
  method: 'post',
  path: '/optimize-image-prompt',
  tags: ['AI Text Generation'],
  summary: 'Optimize an image generation prompt',
  description:
    'Takes raw input (like worldbuilding data) and optimizes it into a clean image generation prompt',
  operationId: 'optimizeImagePrompt',
  request: {
    body: {
      content: {
        'application/json': {
          schema: OptimizeImagePromptRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Optimized prompt',
      content: { 'application/json': { schema: OptimizeImagePromptResponseSchema } },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    503: {
      description: 'Text generation not available',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

aiTextRoutes.openapi(optimizeImagePromptRoute, async (c) => {
  const db = c.get('db');
  const body = c.req.valid('json');

  // Check if text generation is enabled
  const textEnabledConfig = await configService.get(db, 'AI_TEXT_ENABLED');
  if (textEnabledConfig.value !== 'true') {
    return c.json({ error: 'Text generation is not enabled' }, 503);
  }

  // Get the configured image prompt model and provider
  const configResults = await Promise.all([
    configService.get(db, 'AI_TEXT_IMAGE_PROMPT_MODEL'),
    configService.get(db, 'AI_TEXT_DEFAULT_PROVIDER'),
    configService.get(db, 'AI_TEXT_IMAGE_PROMPT_TEMPLATE'),
    configService.get(db, 'AI_OPENAI_API_KEY'),
    configService.get(db, 'AI_OPENROUTER_API_KEY'),
    configService.get(db, 'AI_ANTHROPIC_API_KEY'),
  ]);

  const [
    imagePromptModel,
    defaultProvider,
    customTemplate,
    openaiApiKey,
    openrouterApiKey,
    anthropicApiKey,
  ] = configResults.map((r) => r.value);

  // Determine which provider to use based on the model
  let provider: TextProviderType = (defaultProvider as TextProviderType) || 'openai';
  const model = imagePromptModel || 'gpt-4o-mini';

  // Try to infer provider from model ID if not explicitly set
  if (model.includes('/')) {
    // OpenRouter models typically have a slash
    if (model.startsWith('anthropic/')) {
      provider = 'openrouter'; // Use OpenRouter for Anthropic models via OR
    } else {
      provider = 'openrouter';
    }
  } else if (model.startsWith('claude')) {
    provider = 'anthropic';
  } else if (model.startsWith('gpt') || model.startsWith('o1')) {
    provider = 'openai';
  }

  // Check if the provider is available
  let apiKey: string | null = null;
  switch (provider) {
    case 'openai':
      apiKey = openaiApiKey;
      break;
    case 'openrouter':
      apiKey = openrouterApiKey;
      break;
    case 'anthropic':
      apiKey = anthropicApiKey;
      break;
  }

  if (!apiKey) {
    return c.json({ error: `${provider} API key not configured` }, 503);
  }

  // Build the system prompt
  const defaultTemplate = `You are an expert at creating prompts for AI image generation. Your task is to take raw input (which may include character descriptions, worldbuilding data, or other creative content) and transform it into an optimized image generation prompt.

Guidelines:
- Focus on visual elements: appearance, setting, lighting, mood, style
- Be specific and descriptive but concise
- Use comma-separated descriptors that work well with image AI
- Include artistic style suggestions when appropriate
- Avoid abstract concepts that can't be visualized
- If the input is about a character, focus on their appearance, pose, and setting
- Output ONLY the optimized prompt, nothing else

${body.targetStyle ? `Target style: ${body.targetStyle}` : ''}
${body.context ? `Context: ${body.context}` : ''}
${body.maxLength ? `Maximum length: approximately ${body.maxLength} characters` : ''}`;

  const systemPrompt = customTemplate || defaultTemplate;

  // Call the appropriate provider
  let optimizedPrompt: string;
  try {
    switch (provider) {
      case 'openai':
        optimizedPrompt = await callOpenAI(apiKey, model, systemPrompt, body.rawInput);
        break;
      case 'openrouter':
        optimizedPrompt = await callOpenRouter(apiKey, model, systemPrompt, body.rawInput);
        break;
      case 'anthropic':
        optimizedPrompt = await callAnthropic(apiKey, model, systemPrompt, body.rawInput);
        break;
      default:
        return c.json({ error: 'Invalid provider' }, 400);
    }
  } catch (error) {
    aiTextLog.error('Error optimizing prompt', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to optimize prompt' },
      503
    );
  }

  return c.json(
    {
      optimizedPrompt: optimizedPrompt.trim(),
      // These could be enhanced with more AI analysis in the future
      negativePrompt: undefined,
      suggestedSize: undefined,
      optimizationNotes: `Optimized using ${model}`,
    },
    200
  );
});

// ============================================================================
// Provider API Helpers
// ============================================================================

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://inkweld.app',
      'X-Title': 'Inkweld',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userInput }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const textContent = data.content.find((c) => c.type === 'text');
  return textContent?.text || '';
}

export { aiTextRoutes };
