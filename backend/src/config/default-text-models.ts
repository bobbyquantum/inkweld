/**
 * Default text-to-text models for each provider.
 * These serve as the single source of truth and are exposed via the API.
 */
import type { TextModelInfo, TextProviderType } from '../types/text-generation';

/**
 * Default OpenAI text models
 */
export const DEFAULT_OPENAI_TEXT_MODELS: TextModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    maxTokens: 128000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Most capable GPT-4 model with vision and excellent reasoning',
    costTier: 4,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    maxTokens: 128000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and cost-effective GPT-4 variant',
    costTier: 2,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    maxTokens: 128000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'GPT-4 Turbo with improved performance',
    costTier: 4,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    maxTokens: 16385,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and affordable for simple tasks',
    costTier: 1,
  },
  {
    id: 'o1',
    name: 'o1',
    provider: 'openai',
    maxTokens: 200000,
    supportsJsonMode: false,
    supportsStreaming: false,
    description: 'Advanced reasoning model for complex tasks',
    costTier: 5,
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    provider: 'openai',
    maxTokens: 128000,
    supportsJsonMode: false,
    supportsStreaming: false,
    description: 'Smaller reasoning model, faster and cheaper',
    costTier: 3,
  },
];

/**
 * Default OpenRouter text models
 * OpenRouter provides access to many models - these are curated popular ones
 */
export const DEFAULT_OPENROUTER_TEXT_MODELS: TextModelInfo[] = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'openrouter',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Excellent balance of intelligence and speed',
    costTier: 3,
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'openrouter',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Most capable Claude model for complex tasks',
    costTier: 5,
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'openrouter',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and efficient for simple tasks',
    costTier: 1,
  },
  {
    id: 'google/gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    provider: 'openrouter',
    maxTokens: 1000000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Google Gemini 2.0 with massive context',
    costTier: 2,
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'openrouter',
    maxTokens: 2000000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Gemini Pro with 2M token context',
    costTier: 3,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'openrouter',
    maxTokens: 131072,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Meta Llama 3.3 large model',
    costTier: 2,
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'openrouter',
    maxTokens: 128000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Mistral flagship model',
    costTier: 3,
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'openrouter',
    maxTokens: 64000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'DeepSeek V3 - excellent cost-performance ratio',
    costTier: 1,
  },
];

/**
 * Default Anthropic text models (direct API)
 */
export const DEFAULT_ANTHROPIC_TEXT_MODELS: TextModelInfo[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Latest Claude Sonnet with excellent capabilities',
    costTier: 3,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Excellent balance of intelligence and speed',
    costTier: 3,
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Most capable Claude for complex reasoning',
    costTier: 5,
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    maxTokens: 200000,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and efficient for quick tasks',
    costTier: 1,
  },
];

/**
 * Get default models for a specific provider
 */
export function getDefaultTextModels(provider: TextProviderType): TextModelInfo[] {
  switch (provider) {
    case 'openai':
      return DEFAULT_OPENAI_TEXT_MODELS;
    case 'openrouter':
      return DEFAULT_OPENROUTER_TEXT_MODELS;
    case 'anthropic':
      return DEFAULT_ANTHROPIC_TEXT_MODELS;
    default:
      return [];
  }
}

/**
 * Get all default text models from all providers
 */
export function getAllDefaultTextModels(): Record<TextProviderType, TextModelInfo[]> {
  return {
    openai: DEFAULT_OPENAI_TEXT_MODELS,
    openrouter: DEFAULT_OPENROUTER_TEXT_MODELS,
    anthropic: DEFAULT_ANTHROPIC_TEXT_MODELS,
    workersai: [], // No default models - fetched from API
  };
}
