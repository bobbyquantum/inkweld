/**
 * Types for the multi-provider image generation system.
 */

/**
 * Supported image generation provider types
 */
export type ImageProviderType = 'openai' | 'openrouter' | 'stable-diffusion' | 'falai';

/**
 * Image sizes supported across providers.
 * Includes standard sizes, OpenRouter aspect ratio sizes, and Fal.ai extended sizes.
 */
export type ImageSize =
  | '256x256'
  | '512x512'
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | '1024x1792'
  | '1792x1024'
  | '832x1248' // 2:3 portrait
  | '1248x832' // 3:2 landscape
  | '864x1184' // 3:4 portrait
  | '1184x864' // 4:3 landscape
  | '896x1152' // 4:5 portrait
  | '1152x896' // 5:4 landscape
  | '768x1344' // 9:16 tall portrait
  | '1344x768' // 16:9 wide landscape
  | '1536x672' // 21:9 ultra-wide
  // Fal.ai extended sizes (flexible resolution support)
  | '1920x1080' // HD 1080p landscape
  | '1080x1920' // HD 1080p portrait
  | '1600x2560' // Ebook cover (Kindle)
  | '2560x1600' // Landscape ebook/print
  | 'auto'
  | string; // Allow custom sizes as strings (e.g., "1200x1800")

/**
 * Custom image size profile defined by users
 */
export interface CustomImageSize {
  /** Unique identifier for this size */
  id: string;
  /** User-friendly name for the size */
  name: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Optional description */
  description?: string;
}

/**
 * Image quality settings
 */
export type ImageQuality = 'standard' | 'hd';

/**
 * Image style settings (primarily for DALL-E 3)
 */
export type ImageStyle = 'vivid' | 'natural';

/**
 * Configuration for a single image generation provider
 */
export interface ImageProviderConfig {
  /** Provider type identifier */
  type: ImageProviderType;
  /** Human-readable provider name */
  name: string;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** API key for authentication */
  apiKey?: string;
  /** Custom API endpoint (for self-hosted or alternative endpoints) */
  endpoint?: string;
  /** Default model for this provider */
  defaultModel?: string;
  /** Available models for this provider */
  availableModels?: string[];
  /** Provider-specific settings */
  settings?: Record<string, unknown>;
}

/**
 * Provider-specific model info
 */
export interface ImageModelInfo {
  id: string;
  name: string;
  provider: ImageProviderType;
  supportedSizes: ImageSize[];
  supportsQuality: boolean;
  supportsStyle: boolean;
  maxImages: number;
  description?: string;
}

/**
 * Request to generate images
 */
export interface ImageGenerateRequest {
  /** The main prompt for image generation */
  prompt: string;
  /** Provider to use for generation */
  provider: ImageProviderType;
  /** Specific model to use */
  model?: string;
  /** Number of images to generate */
  n?: number;
  /** Image size */
  size?: ImageSize;
  /** Image quality */
  quality?: ImageQuality;
  /** Image style */
  style?: ImageStyle;
  /** Negative prompt (for Stable Diffusion) */
  negativePrompt?: string;
  /** Worldbuilding elements context */
  worldbuildingContext?: WorldbuildingContext[];
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Worldbuilding element reference for prompt context
 */
export interface WorldbuildingContext {
  /** Element ID */
  elementId: string;
  /** Element name */
  name: string;
  /** Element type */
  type: string;
  /** How to use this element in the prompt */
  role: 'subject' | 'setting' | 'style' | 'reference';
  /** Description of the element's role */
  roleDescription?: string;
  /** Raw JSON data from the worldbuilding element */
  data: Record<string, unknown>;
}

/**
 * Generated image data
 */
export interface GeneratedImageData {
  /** Base64-encoded image data */
  b64_json?: string;
  /** URL to the image */
  url?: string;
  /** Revised prompt (if provider modified it) */
  revisedPrompt?: string;
  /** Image index in batch */
  index: number;
}

/**
 * Response from image generation
 */
export interface ImageGenerateResponse {
  /** Unix timestamp of creation */
  created: number;
  /** Generated images */
  data: GeneratedImageData[];
  /** Provider that generated the images */
  provider: ImageProviderType;
  /** Model used */
  model: string;
  /** Original request for reference */
  request: Pick<ImageGenerateRequest, 'prompt' | 'size' | 'quality' | 'style'>;
}

/**
 * Status of an image provider
 */
export interface ImageProviderStatus {
  /** Provider type */
  type: ImageProviderType;
  /** Human-readable name */
  name: string;
  /** Whether the provider is configured and available */
  available: boolean;
  /** Whether the provider is enabled in settings */
  enabled: boolean;
  /** Available models */
  models: ImageModelInfo[];
  /** Error message if unavailable */
  error?: string;
}

/**
 * Overall image generation status
 */
export interface ImageGenerationStatus {
  /** Whether any provider is available */
  available: boolean;
  /** List of all configured providers */
  providers: ImageProviderStatus[];
  /** Default provider if multiple are available */
  defaultProvider?: ImageProviderType;
}

/**
 * Interface for image generation providers
 */
export interface IImageProvider {
  /** Provider type identifier */
  readonly type: ImageProviderType;
  /** Human-readable name */
  readonly name: string;

  /**
   * Check if the provider is available (configured and working)
   */
  isAvailable(): boolean;

  /**
   * Get available models for this provider
   */
  getModels(): ImageModelInfo[];

  /**
   * Generate images using this provider
   */
  generate(request: ImageGenerateRequest): Promise<ImageGenerateResponse>;

  /**
   * Get provider status
   */
  getStatus(): ImageProviderStatus;
}

/**
 * Provider configuration as stored in database/config
 */
export interface StoredProviderConfig {
  /** Provider type */
  type: ImageProviderType;
  /** Whether enabled */
  enabled: boolean;
  /** Encrypted API key reference */
  apiKeyConfigKey?: string;
  /** Custom endpoint */
  endpoint?: string;
  /** Default model */
  defaultModel?: string;
  /** Additional settings (JSON string) */
  settings?: string;
}

/**
 * Admin config keys for image generation
 */
export const IMAGE_GENERATION_CONFIG_KEYS = {
  /** Master enable/disable for image generation */
  ENABLED: 'AI_IMAGE_ENABLED',
  /** Default provider */
  DEFAULT_PROVIDER: 'AI_IMAGE_DEFAULT_PROVIDER',
  /** OpenAI API key */
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  /** OpenAI enabled */
  OPENAI_ENABLED: 'AI_IMAGE_OPENAI_ENABLED',
  /** OpenRouter API key */
  OPENROUTER_API_KEY: 'AI_IMAGE_OPENROUTER_API_KEY',
  /** OpenRouter enabled */
  OPENROUTER_ENABLED: 'AI_IMAGE_OPENROUTER_ENABLED',
  /** Stable Diffusion endpoint */
  SD_ENDPOINT: 'AI_IMAGE_SD_ENDPOINT',
  /** Stable Diffusion API key */
  SD_API_KEY: 'AI_IMAGE_SD_API_KEY',
  /** Stable Diffusion enabled */
  SD_ENABLED: 'AI_IMAGE_SD_ENABLED',
} as const;
