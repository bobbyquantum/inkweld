/**
 * Static AI provider definitions and request-environment helpers.
 */

export interface ProviderDef {
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

export const PROVIDER_DEFINITIONS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'OpenAI Compatible',
    description:
      'GPT models for text and image generation, or any OpenAI-compatible API (Ollama, LM Studio, etc.)',
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

export function getAppUrl(c: { env: unknown }): string {
  return (
    (c.env as Record<string, string>)?.['FRONTEND_URL'] ||
    process.env.FRONTEND_URL ||
    (c.env as Record<string, string>)?.['BASE_URL'] ||
    process.env.BASE_URL ||
    'https://inkweld.app'
  );
}

export function getAppName(c: { env: unknown }): string {
  return (c.env as Record<string, string>)?.['APP_NAME'] || process.env.APP_NAME || 'Inkweld';
}
