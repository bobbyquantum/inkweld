/**
 * Types for the multi-provider image generation system.
 */

/**
 * Supported image generation provider types
 */
export type ImageProviderType =
  | 'openai'
  | 'openrouter'
  | 'stable-diffusion'
  | 'falai'
  | 'workersai';

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
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto' | 'standard' | 'hd';

/**
 * Image style settings (provider-specific)
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
  /** Whether this model supports reference/input images */
  supportsImageInput?: boolean;
  /** Maximum number of reference images allowed (0 = none) */
  maxInputImages?: number;
  /** Maximum prompt tokens (approximate) - triggers truncation if exceeded */
  maxPromptTokens?: number;
}

/**
 * Known model limits - hard-coded overrides for specific models
 * These are discovered through testing and provider documentation
 */
export interface ModelLimits {
  /** Model ID patterns that share these limits (can match across providers) */
  models: string[];
  /** Maximum prompt characters before truncation */
  maxPromptChars?: number;
  /** Maximum number of input/reference images */
  maxInputImages?: number;
  /** Whether the model supports image input at all */
  supportsImageInput?: boolean;
  /** Whether the model requires multipart/form-data format (Workers AI FLUX.2) */
  requiresMultipart?: boolean;
  /**
   * Supported image sizes. If specified, requested sizes will be
   * normalized to the nearest supported size.
   * Format: "WxH" strings like "1024x1024"
   */
  supportedSizes?: string[];
  /** Prompting guide notes for this model */
  promptingNotes?: string;
}

/**
 * Registry of known model limits.
 * Each entry has an array of model patterns that share the same limits.
 * Patterns are matched against "provider/modelId" or just "modelId".
 */
export const KNOWN_MODEL_LIMITS: ModelLimits[] = [
  // Black Forest Labs FLUX.2 [klein] - optimized for narrative prose prompts
  {
    models: [
      'black-forest-labs/flux.2-klein-4b', // OpenRouter
      'fal-ai/flux-2/klein/4b', // Fal.ai
      'flux.2-klein-4b', // Generic match
    ],
    maxPromptChars: 3000,
    maxInputImages: 2,
    supportsImageInput: true,
    promptingNotes: `FLUX.2 [klein] Prompting Guide:
- Write like a novelist, not keywords. Flowing prose with subject first.
- Structure: Subject → Setting → Details → Lighting → Atmosphere
- Lighting is THE most important element - describe source, quality, direction, temperature
- Word order matters: front-load important elements
- Optimal length: 30-80 words for most work, up to 300+ words for complex scenes
- NO prompt upsampling - what you write is what you get
- Add style/mood tags at end: "Style: [style]. Mood: [mood]."

BAD: "woman, blonde, short hair, neutral background, earrings"
GOOD: "A woman with short, blonde hair poses against a light neutral background. She wears colorful earrings, resting her chin on her hand. Soft, warm afternoon light."

For image editing with references:
- "Turn into [style]" or "Reskin as [description]"
- "Replace [element] with [new element]"
- "Change image 1 to match the style of image 2"
- Be specific about what changes, avoid vague "make it better"`,
  },
  // Cloudflare Workers AI FLUX.2 models - require multipart format
  {
    models: [
      '@cf/black-forest-labs/flux-2-klein-4b', // Workers AI klein
      '@cf/black-forest-labs/flux-2-dev', // Workers AI dev
    ],
    maxPromptChars: 3000,
    maxInputImages: 2,
    supportsImageInput: true,
    /** Workers AI FLUX.2 models require multipart/form-data format */
    requiresMultipart: true,
    /** FLUX models work with multiples of 256, common sizes below */
    supportedSizes: [
      '512x512',
      '768x512',
      '512x768',
      '1024x512',
      '512x1024',
      '1024x768',
      '768x1024',
      '1024x1024',
      '1280x768',
      '768x1280',
      '1280x1024',
      '1024x1280',
      '1536x1024',
      '1024x1536',
    ],
    promptingNotes: `Workers AI FLUX.2 Prompting Guide:
- Write like a novelist, not keywords. Flowing prose with subject first.
- Structure: Subject → Setting → Details → Lighting → Atmosphere
- Lighting is THE most important element - describe source, quality, direction, temperature
- Optimal length: 30-80 words for most work, up to 300+ words for complex scenes`,
  },
  // Add more model families as we discover their limits
];

/**
 * Find limits for a specific model.
 * @param modelId The model ID (e.g., 'black-forest-labs/flux.2-klein-4b')
 * @param provider Optional provider prefix (e.g., 'openrouter')
 */
export function findModelLimits(modelId: string, provider?: string): ModelLimits | undefined {
  const fullId = provider ? `${provider}/${modelId}` : modelId;

  for (const limits of KNOWN_MODEL_LIMITS) {
    for (const pattern of limits.models) {
      // Check exact match or if modelId ends with the pattern
      if (fullId === pattern || modelId === pattern || fullId.endsWith(pattern)) {
        return limits;
      }
    }
  }
  return undefined;
}

/**
 * Normalize a requested size to the nearest supported size for a model.
 * If the model has no size constraints, returns the original size.
 *
 * @param width Requested width
 * @param height Requested height
 * @param modelLimits Model limits with optional supportedSizes
 * @returns [normalizedWidth, normalizedHeight]
 */
export function normalizeSize(
  width: number,
  height: number,
  modelLimits?: ModelLimits
): [number, number] {
  // If no model limits or no size constraints, return as-is
  if (!modelLimits?.supportedSizes || modelLimits.supportedSizes.length === 0) {
    return [width, height];
  }

  const supportedSizes = modelLimits.supportedSizes;
  const requestedPixels = width * height;
  const requestedRatio = width / height;

  let bestMatch = supportedSizes[0];
  let bestScore = Infinity;

  for (const sizeStr of supportedSizes) {
    const [w, h] = sizeStr.split('x').map(Number);
    if (!w || !h) continue;

    // Score based on aspect ratio similarity and total pixel difference
    const ratio = w / h;
    const pixels = w * h;

    // Weight aspect ratio match heavily, then consider size
    const ratioDiff = Math.abs(ratio - requestedRatio);
    const pixelDiff = Math.abs(pixels - requestedPixels) / 1000000; // Normalize

    const score = ratioDiff * 10 + pixelDiff;

    if (score < bestScore) {
      bestScore = score;
      bestMatch = sizeStr;
    }
  }

  const [normalizedWidth, normalizedHeight] = bestMatch.split('x').map(Number);
  return [normalizedWidth || width, normalizedHeight || height];
}

/**
 * Reference/input image for image-to-image or style reference.
 * This is an internal type - reference images are loaded server-side
 * from worldbuilding elements with role "reference".
 */
export interface ReferenceImage {
  /** Base64-encoded image data (with or without data URL prefix) */
  data: string;
  /** MIME type (e.g., 'image/png', 'image/jpeg') */
  mimeType?: string;
  /** Role of this reference image */
  role?: 'style' | 'subject' | 'composition' | 'reference';
  /** Optional weight/strength for this reference (0-1) */
  weight?: number;
}

/**
 * Request to generate images (API input)
 */
export interface ImageGenerateRequest {
  /** The main prompt for image generation */
  prompt: string;
  /** Profile ID to use for generation settings */
  profileId: string;
  /** Project key (username/slug) for loading reference images */
  projectKey?: string;
  /** Number of images to generate */
  n?: number;
  /** Image size (overrides profile default) */
  size?: ImageSize;
  /** Image quality (overrides profile config) */
  quality?: ImageQuality;
  /** Image style (overrides profile config) */
  style?: ImageStyle;
  /** Negative prompt (for Stable Diffusion models) */
  negativePrompt?: string;
  /** Worldbuilding elements context - elements with role 'reference' will have images loaded server-side */
  worldbuildingContext?: WorldbuildingContext[];
}

/**
 * Internal request with resolved profile settings (used by providers)
 */
export interface ResolvedImageRequest {
  /** The main prompt for image generation */
  prompt: string;
  /** Profile ID that was used */
  profileId: string;
  /** Resolved provider from profile */
  provider: ImageProviderType;
  /** Resolved model from profile */
  model: string;
  /** Number of images to generate */
  n?: number;
  /** Image size */
  size?: ImageSize;
  /** Image quality */
  quality?: ImageQuality;
  /** Image style */
  style?: ImageStyle;
  /** Negative prompt */
  negativePrompt?: string;
  /** Worldbuilding elements context */
  worldbuildingContext?: WorldbuildingContext[];
  /** Reference images for image-to-image or style guidance */
  referenceImages?: ReferenceImage[];
  /** Profile-specific model config options */
  options?: Record<string, unknown>;
  /**
   * When true, the model only accepts aspect ratio (e.g., "16:9") not pixel dimensions.
   * The provider should use image_config.aspect_ratio instead of size in the prompt.
   */
  usesAspectRatioOnly?: boolean;
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
  b64Json?: string;
  /** URL to the image */
  url?: string;
  /** Revised prompt (if provider modified it) */
  revisedPrompt?: string;
  /** Image index in batch */
  index: number;
  /**
   * Raw text content from the model (if it returned text instead of an image).
   * This is typically a refusal message or explanation.
   */
  textContent?: string;
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
  request: Pick<ResolvedImageRequest, 'prompt' | 'size' | 'quality' | 'style'>;
  /**
   * Raw text content from the model if it returned text instead of an image.
   * Useful for showing refusal messages or explanations to the user.
   */
  textContent?: string;
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
  generate(request: ResolvedImageRequest): Promise<ImageGenerateResponse>;

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
 * Note: API keys are now shared across features (AI_OPENAI_API_KEY, etc.)
 */
export const IMAGE_GENERATION_CONFIG_KEYS = {
  /** Master enable/disable for image generation */
  ENABLED: 'AI_IMAGE_ENABLED',
  /** Default provider */
  DEFAULT_PROVIDER: 'AI_IMAGE_DEFAULT_PROVIDER',
  /** OpenAI API key (shared across all AI features) */
  OPENAI_API_KEY: 'AI_OPENAI_API_KEY',
  /** OpenAI enabled */
  OPENAI_ENABLED: 'AI_IMAGE_OPENAI_ENABLED',
  /** OpenRouter API key (shared across all AI features) */
  OPENROUTER_API_KEY: 'AI_OPENROUTER_API_KEY',
  /** OpenRouter enabled */
  OPENROUTER_ENABLED: 'AI_IMAGE_OPENROUTER_ENABLED',
  /** Stable Diffusion endpoint (shared) */
  SD_ENDPOINT: 'AI_SD_ENDPOINT',
  /** Stable Diffusion API key (shared) */
  SD_API_KEY: 'AI_SD_API_KEY',
  /** Stable Diffusion enabled */
  SD_ENABLED: 'AI_IMAGE_SD_ENABLED',
  /** Fal.ai API key (shared) */
  FALAI_API_KEY: 'AI_FALAI_API_KEY',
  /** Fal.ai enabled */
  FALAI_ENABLED: 'AI_IMAGE_FALAI_ENABLED',
} as const;
