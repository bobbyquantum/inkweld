/**
 * Types for the multi-provider text-to-text generation system.
 * Used for AI linting, prompt optimization, and other text transformations.
 */

/**
 * Supported text-to-text provider types
 */
export type TextProviderType = 'openai' | 'openrouter' | 'anthropic' | 'workersai';

/**
 * Information about a text generation model
 */
export interface TextModelInfo {
  /** Model identifier (e.g., "gpt-4o", "claude-3-sonnet") */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Provider this model belongs to */
  provider: TextProviderType;
  /** Maximum context window size in tokens */
  maxTokens: number;
  /** Whether this model supports JSON mode */
  supportsJsonMode?: boolean;
  /** Whether this model supports streaming */
  supportsStreaming?: boolean;
  /** Description of the model's capabilities */
  description?: string;
  /** Relative cost indicator (1 = cheap, 5 = expensive) */
  costTier?: number;
}

/**
 * Status of a text provider
 */
export interface TextProviderStatus {
  /** Provider type */
  type: TextProviderType;
  /** Provider display name */
  name: string;
  /** Whether the provider is available (has API key) */
  available: boolean;
  /** Whether the provider is enabled in config */
  enabled: boolean;
  /** Available models for this provider */
  models: TextModelInfo[];
  /** Error message if unavailable */
  error?: string;
}

/**
 * Request to optimize an image prompt
 */
export interface OptimizeImagePromptRequest {
  /** Raw data dump or description to optimize */
  rawInput: string;
  /** Target image style (e.g., "fantasy art", "photorealistic") */
  targetStyle?: string;
  /** Additional context about the desired image */
  context?: string;
  /** Maximum length of the optimized prompt */
  maxLength?: number;
}

/**
 * Response from image prompt optimization
 */
export interface OptimizeImagePromptResponse {
  /** The optimized prompt ready for image generation */
  optimizedPrompt: string;
  /** Negative prompt suggestions (things to avoid) */
  negativePrompt?: string;
  /** Suggested image size based on content */
  suggestedSize?: string;
  /** Brief explanation of optimizations made */
  optimizationNotes?: string;
}

/**
 * Text generation request
 */
export interface TextGenerateRequest {
  /** The prompt/input text */
  prompt: string;
  /** System message/context */
  systemPrompt?: string;
  /** Provider to use */
  provider?: TextProviderType;
  /** Specific model to use */
  model?: string;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Whether to use JSON mode if available */
  jsonMode?: boolean;
}

/**
 * Text generation response
 */
export interface TextGenerateResponse {
  /** Generated text content */
  content: string;
  /** Model used for generation */
  model: string;
  /** Provider used */
  provider: TextProviderType;
  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
