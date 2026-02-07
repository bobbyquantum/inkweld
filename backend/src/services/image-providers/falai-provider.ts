/**
 * Fal.ai image generation provider.
 * Uses the @fal-ai/client SDK for image generation.
 *
 * Different models have different input structures:
 * - FLUX 2 Pro: uses `image_size: { width, height }` with flexible resolutions
 * - Nano Banana Pro: uses `aspect_ratio` + `resolution` (1K/2K/4K)
 *
 * Each model has its own supported sizes/aspect ratios since different
 * models have different capabilities.
 */
import { fal } from '@fal-ai/client';
import type {
  ResolvedImageRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
  ImageSize,
} from '../../types/image-generation';
import { BaseImageProvider } from './base-provider';
import { logger } from '../logger.service';

const falLog = logger.child('Fal.ai');

/**
 * Size mode determines how size is passed to the model.
 * - 'dimensions': Uses width x height (e.g., 1920x1080)
 * - 'aspect_ratio': Uses aspect ratio + resolution (e.g., 16:9 + 4K)
 */
export type FalAiSizeMode = 'dimensions' | 'aspect_ratio';

/**
 * Extended model info for Fal.ai models with size mode metadata.
 */
export interface FalAiModelInfo extends ImageModelInfo {
  /** How this model accepts size input */
  sizeMode: FalAiSizeMode;
  /** For aspect_ratio mode: available resolutions like ["1K", "2K", "4K"] */
  resolutions?: string[];
  /** For aspect_ratio mode: available aspect ratios */
  aspectRatios?: string[];
}

/**
 * FLUX 2 Pro supported sizes (dimensions mode).
 * Supports flexible resolutions - these are curated presets.
 */
const FLUX_2_PRO_SIZES: ImageSize[] = [
  // Standard square
  '1024x1024', // 1:1 square
  // HD/Video sizes
  '1920x1080', // 16:9 HD 1080p landscape
  '1080x1920', // 9:16 HD 1080p portrait
  // Ebook/Print sizes
  '1600x2560', // Ebook cover (common Kindle size)
  '2560x1600', // Landscape ebook/print
  // Standard aspect ratios
  '832x1248', // 2:3 portrait
  '1248x832', // 3:2 landscape
  '864x1184', // 3:4 portrait
  '1184x864', // 4:3 landscape
  '896x1152', // 4:5 portrait
  '1152x896', // 5:4 landscape
  '768x1344', // 9:16 tall portrait
  '1344x768', // 16:9 wide landscape
];

/**
 * Aspect ratios and resolutions shared by Fal.ai aspect-ratio models.
 * Both Nano Banana Pro and GPT Image 1.5 use these inputs.
 */
const DEFAULT_ASPECT_RATIOS = [
  '1:1', // Square
  '16:9', // Landscape
  '9:16', // Portrait (tall)
  '4:3', // Standard landscape
  '3:4', // Standard portrait
  '21:9', // Ultrawide
  '9:21', // Ultra tall
  '3:2', // Classic photo landscape
  '2:3', // Classic photo portrait
];

const DEFAULT_ASPECT_RESOLUTIONS = ['1K', '2K', '4K'];

const NANO_BANANA_ASPECT_RATIOS = DEFAULT_ASPECT_RATIOS;
const NANO_BANANA_RESOLUTIONS = DEFAULT_ASPECT_RESOLUTIONS;
const GPT_IMAGE_15_ASPECT_RATIOS = DEFAULT_ASPECT_RATIOS;
const GPT_IMAGE_15_RESOLUTIONS = DEFAULT_ASPECT_RESOLUTIONS;

/**
 * Convert aspect ratio + resolution to a size string for storage.
 * Format: "ratio@resolution" (e.g., "16:9@4K")
 */
function aspectRatioToSizeString(ratio: string, resolution: string): ImageSize {
  return `${ratio}@${resolution}` as ImageSize;
}

/**
 * Parse a size string to determine if it's aspect_ratio format.
 */
function parseAspectRatioSize(size: string): { ratio: string; resolution: string } | null {
  const match = size.match(/^(\d+:\d+)@(\d+K)$/);
  if (match) {
    return { ratio: match[1], resolution: match[2] };
  }
  return null;
}

/**
 * Generate all supported sizes for Nano Banana (aspect ratio combinations).
 */
function getAspectRatioSizes(aspectRatios: string[], resolutions: string[]): ImageSize[] {
  const sizes: ImageSize[] = [];
  for (const ratio of aspectRatios) {
    for (const res of resolutions) {
      sizes.push(aspectRatioToSizeString(ratio, res));
    }
  }
  return sizes;
}

const NANO_BANANA_SUPPORTED_SIZES = getAspectRatioSizes(
  NANO_BANANA_ASPECT_RATIOS,
  NANO_BANANA_RESOLUTIONS
);

const GPT_IMAGE_15_SUPPORTED_SIZES = getAspectRatioSizes(
  GPT_IMAGE_15_ASPECT_RATIOS,
  GPT_IMAGE_15_RESOLUTIONS
);

/**
 * Default Fal.ai image models.
 * Each model has its own size configuration since capabilities vary.
 * More models can be enabled via the AI_IMAGE_FALAI_MODELS config.
 *
 * See https://fal.ai/models for the full list of available models.
 */
export const DEFAULT_FALAI_MODELS: FalAiModelInfo[] = [
  {
    id: 'fal-ai/flux-2-pro',
    name: 'FLUX 2 Pro',
    provider: 'falai',
    supportedSizes: FLUX_2_PRO_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 4,
    description: 'FLUX 2 Pro - excellent quality with flexible resolution',
    sizeMode: 'dimensions',
  },
  {
    id: 'fal-ai/gpt-image-1.5',
    name: 'GPT Image 1.5',
    provider: 'falai',
    supportedSizes: GPT_IMAGE_15_SUPPORTED_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 4,
    description: 'GPT Image 1.5 - high quality generation with aspect ratio + resolution control',
    sizeMode: 'aspect_ratio',
    resolutions: GPT_IMAGE_15_RESOLUTIONS,
    aspectRatios: GPT_IMAGE_15_ASPECT_RATIOS,
  },
  {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'falai',
    supportedSizes: NANO_BANANA_SUPPORTED_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 4,
    description: 'Nano Banana Pro - fast generation with aspect ratio + resolution control',
    sizeMode: 'aspect_ratio',
    resolutions: NANO_BANANA_RESOLUTIONS,
    aspectRatios: NANO_BANANA_ASPECT_RATIOS,
  },
];

/**
 * Map from model ID to its size mode for quick lookup.
 */
const MODEL_SIZE_MODES: Record<string, FalAiSizeMode> = {
  'fal-ai/flux-2-pro': 'dimensions',
  'fal-ai/gpt-image-1.5': 'aspect_ratio',
  'fal-ai/nano-banana-pro': 'aspect_ratio',
};

/**
 * Fal.ai generation result structure
 */
interface FalAiResult {
  data: {
    images?: Array<{
      url: string;
      width?: number;
      height?: number;
      content_type?: string;
    }>;
    image?: {
      url: string;
      width?: number;
      height?: number;
      content_type?: string;
    };
    seed?: number;
    prompt?: string;
    has_nsfw_concepts?: boolean[];
  };
  requestId: string;
}

export class FalAiImageProvider extends BaseImageProvider {
  readonly type: ImageProviderType = 'falai';
  readonly name = 'Fal.ai';

  private configuredModels: FalAiModelInfo[] = DEFAULT_FALAI_MODELS;

  constructor(config?: { apiKey?: string; enabled?: boolean }) {
    super(config);
    // Configure fal client if API key is provided
    if (config?.apiKey) {
      this.configureFalClient(config.apiKey);
    }
  }

  /**
   * Configure the fal client with credentials
   */
  private configureFalClient(apiKey: string): void {
    fal.config({
      credentials: apiKey,
    });
  }

  override configure(config: {
    apiKey?: string;
    endpoint?: string;
    enabled?: boolean;
    models?: ImageModelInfo[];
  }): void {
    super.configure(config);
    if (config.apiKey) {
      this.configureFalClient(config.apiKey);
    }
    if (config.models && config.models.length > 0) {
      // Preserve sizeMode from default models if not provided
      this.configuredModels = config.models.map((m) => {
        const defaultModel = DEFAULT_FALAI_MODELS.find((dm) => dm.id === m.id);
        return {
          ...m,
          provider: 'falai' as const,
          sizeMode: (m as FalAiModelInfo).sizeMode || defaultModel?.sizeMode || 'dimensions',
          resolutions: (m as FalAiModelInfo).resolutions || defaultModel?.resolutions,
          aspectRatios: (m as FalAiModelInfo).aspectRatios || defaultModel?.aspectRatios,
        } as FalAiModelInfo;
      });
    }
  }

  /**
   * Set available models from configuration.
   */
  setModels(models: ImageModelInfo[]): void {
    if (models && models.length > 0) {
      this.configuredModels = models.map((m) => {
        const defaultModel = DEFAULT_FALAI_MODELS.find((dm) => dm.id === m.id);
        return {
          ...m,
          provider: 'falai' as const,
          sizeMode:
            (m as FalAiModelInfo).sizeMode ||
            MODEL_SIZE_MODES[m.id] ||
            defaultModel?.sizeMode ||
            'dimensions',
          resolutions: (m as FalAiModelInfo).resolutions || defaultModel?.resolutions,
          aspectRatios: (m as FalAiModelInfo).aspectRatios || defaultModel?.aspectRatios,
        } as FalAiModelInfo;
      });
    }
  }

  isAvailable(): boolean {
    return this.enabled && !!this.apiKey;
  }

  getModels(): FalAiModelInfo[] {
    return this.configuredModels;
  }

  /**
   * Convert a size string to width/height object for Fal.ai (dimensions mode)
   */
  private parseSize(size: string): { width: number; height: number } {
    const match = size.match(/^(\d+)x(\d+)$/);
    if (match) {
      return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    }
    // Default to 1024x1024
    return { width: 1024, height: 1024 };
  }

  /**
   * Get size mode for a model
   */
  private getSizeMode(modelId: string): FalAiSizeMode {
    const model = this.configuredModels.find((m) => m.id === modelId);
    return model?.sizeMode || MODEL_SIZE_MODES[modelId] || 'dimensions';
  }

  /**
   * Build size parameters based on the model's size mode.
   */
  private buildSizeParams(
    modelId: string,
    size: string
  ): Record<string, string | number | { width: number; height: number }> {
    const sizeMode = this.getSizeMode(modelId);

    if (sizeMode === 'aspect_ratio') {
      // Parse aspect_ratio@resolution format
      const parsed = parseAspectRatioSize(size);
      if (parsed) {
        return {
          aspect_ratio: parsed.ratio,
          resolution: parsed.resolution,
        };
      }
      // Fallback: if given dimensions, try to convert to aspect ratio
      const dimMatch = size.match(/^(\d+)x(\d+)$/);
      if (dimMatch) {
        const w = parseInt(dimMatch[1], 10);
        const h = parseInt(dimMatch[2], 10);
        const ratio = this.dimensionsToAspectRatio(w, h);
        return {
          aspect_ratio: ratio,
          resolution: '2K', // Default to 2K
        };
      }
      // Default
      return { aspect_ratio: '1:1', resolution: '2K' };
    }

    // Dimensions mode
    const { width, height } = this.parseSize(size);
    return {
      image_size: { width, height },
    };
  }

  /**
   * Convert dimensions to the closest standard aspect ratio.
   */
  private dimensionsToAspectRatio(width: number, height: number): string {
    const ratio = width / height;
    // Common aspect ratios
    const ratios: [number, string][] = [
      [1, '1:1'],
      [16 / 9, '16:9'],
      [9 / 16, '9:16'],
      [4 / 3, '4:3'],
      [3 / 4, '3:4'],
      [21 / 9, '21:9'],
      [9 / 21, '9:21'],
      [3 / 2, '3:2'],
      [2 / 3, '2:3'],
    ];

    // Find closest ratio
    let closest = ratios[0];
    let minDiff = Math.abs(ratio - closest[0]);
    for (const r of ratios) {
      const diff = Math.abs(ratio - r[0]);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }
    return closest[1];
  }

  async generate(request: ResolvedImageRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable()) {
      throw new Error('Fal.ai image generation is not available. Please configure API key.');
    }

    // Model comes from the profile - no validation needed
    const model = request.model;

    // Build prompt with worldbuilding context
    const prompt = this.buildPromptWithContext(request);

    // Number of images to generate
    const numImages = request.n || 1;

    // Get size parameters based on model's size mode
    const sizeParams = this.buildSizeParams(model, request.size || '1024x1024');

    falLog.info(`Generating image`, { model, sizeParams, count: numImages });

    try {
      // Ensure fal client is configured with current API key
      if (this.apiKey) {
        this.configureFalClient(this.apiKey);
      }

      // Build the input parameters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fal.ai models have varying input schemas
      const input: Record<string, any> = {
        prompt,
        ...sizeParams,
      };

      // Add num_images for models that support it
      if (numImages > 1) {
        input.num_images = numImages;
      }

      // Add output format
      input.output_format = 'png';

      // Add negative prompt if provided
      if (request.negativePrompt) {
        input.negative_prompt = request.negativePrompt;
      }

      input.enable_safety_checker = false;

      // Use fal.subscribe for async generation with progress updates
      const result = (await fal.subscribe(model, {
        input,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            falLog.debug('Generation in progress...');
            if ('logs' in update && Array.isArray(update.logs)) {
              update.logs.map((log) => log.message).forEach((msg) => falLog.debug(msg));
            }
          }
        },
      })) as FalAiResult;

      falLog.debug(`Response received`, { requestId: result.requestId });

      // Extract images from response
      // Different models return images in different formats
      const images: Array<{
        url?: string;
        b64Json?: string;
        revisedPrompt?: string;
        index: number;
      }> = [];

      // Check for images array (common format)
      if (result.data.images && Array.isArray(result.data.images)) {
        for (let i = 0; i < result.data.images.length; i++) {
          const img = result.data.images[i];
          images.push({
            url: img.url,
            revisedPrompt: result.data.prompt || undefined,
            index: i,
          });
        }
      }
      // Check for single image (some models use this)
      else if (result.data.image) {
        images.push({
          url: result.data.image.url,
          revisedPrompt: result.data.prompt || undefined,
          index: 0,
        });
      }

      if (images.length === 0) {
        falLog.error('No images in response', { response: JSON.stringify(result, null, 2) });
        throw new Error('Fal.ai did not return any images.');
      }

      falLog.info(`Image generated successfully`, { count: images.length });

      return {
        created: Math.floor(Date.now() / 1000),
        data: images,
        provider: this.type,
        model,
        request: {
          prompt: request.prompt,
          size: request.size,
          quality: request.quality,
          style: request.style,
        },
      };
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
      const err = error as any;
      falLog.error(`Error generating image: ${err.message || 'Unknown error'}`);
      throw new Error(`Failed to generate image with Fal.ai: ${err.message || 'Unknown error'}`, {
        cause: error,
      });
    }
  }
}
