/**
 * OpenRouter image generation provider.
 * Uses the OpenRouter API to access various image models.
 * OpenRouter provides access to models like FLUX, Stable Diffusion, etc.
 *
 * Models are configurable via the admin panel since OpenRouter adds
 * new models frequently.
 */
import type {
  ImageGenerateRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
  ImageSize,
} from '../../types/image-generation.js';
import { BaseImageProvider } from './base-provider.js';

/**
 * Default OpenRouter image models.
 * These can be overridden via the AI_IMAGE_OPENROUTER_MODELS config.
 *
 * OpenRouter provides access to many image generation models via the chat completions API
 * with modalities: ["image", "text"]. Check https://openrouter.ai/models?modality=image
 * for the latest available models.
 *
 * Note: Some models may require specific prompt formatting to generate images.
 */

// All supported sizes based on OpenRouter/Gemini aspect ratios
const OPENROUTER_SUPPORTED_SIZES: ImageSize[] = [
  '1024x1024', // 1:1
  '832x1248', // 2:3 portrait
  '1248x832', // 3:2 landscape
  '864x1184', // 3:4 portrait
  '1184x864', // 4:3 landscape
  '896x1152', // 4:5 portrait
  '1152x896', // 5:4 landscape
  '768x1344', // 9:16 tall portrait
  '1344x768', // 16:9 wide landscape
  '1536x672', // 21:9 ultra-wide
];

export const DEFAULT_OPENROUTER_MODELS: ImageModelInfo[] = [
  {
    id: 'black-forest-labs/flux.2-flex',
    name: 'FLUX 2 Flex',
    provider: 'openrouter',
    supportedSizes: OPENROUTER_SUPPORTED_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 1,
    description: 'Flexible FLUX model with fast generation (~$0.06/MP)',
  },
  {
    id: 'sourceful/riverflow-v2-standard-preview',
    name: 'Riverflow v2 Standard',
    provider: 'openrouter',
    supportedSizes: OPENROUTER_SUPPORTED_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 1,
    description: 'Riverflow v2 image generation model (preview)',
  },
  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    provider: 'openrouter',
    supportedSizes: OPENROUTER_SUPPORTED_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 1,
    description: 'Google Gemini 2.5 Flash with image generation',
  },
  {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image (Preview)',
    provider: 'openrouter',
    supportedSizes: OPENROUTER_SUPPORTED_SIZES,
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 1,
    description: 'Google Gemini 3 Pro image generation preview',
  },
];

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter chat completions response with image generation
 */
interface _OpenRouterChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      images?: Array<{
        type: 'image_url';
        image_url: {
          url: string; // base64 data URL like "data:image/png;base64,..."
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

export class OpenRouterImageProvider extends BaseImageProvider {
  readonly type: ImageProviderType = 'openrouter';
  readonly name = 'OpenRouter';

  private configuredModels: ImageModelInfo[] = DEFAULT_OPENROUTER_MODELS;

  constructor(config?: { apiKey?: string; enabled?: boolean }) {
    super(config);
  }

  override configure(config: {
    apiKey?: string;
    endpoint?: string;
    enabled?: boolean;
    models?: ImageModelInfo[];
  }): void {
    super.configure(config);
    if (config.models && config.models.length > 0) {
      this.configuredModels = config.models;
    }
  }

  /**
   * Set available models from configuration.
   * Models should be an array of ImageModelInfo objects.
   */
  setModels(models: ImageModelInfo[]): void {
    if (models && models.length > 0) {
      this.configuredModels = models.map((m) => ({ ...m, provider: 'openrouter' as const }));
    }
  }

  isAvailable(): boolean {
    return this.enabled && !!this.apiKey;
  }

  getModels(): ImageModelInfo[] {
    return this.configuredModels;
  }

  /**
   * Convert a size string to an aspect ratio for OpenRouter's image_config parameter.
   *
   * Supported sizes and aspect ratios per OpenRouter docs:
   * - 1024x1024 → 1:1 (default)
   * - 832x1248  → 2:3 portrait
   * - 1248x832  → 3:2 landscape
   * - 864x1184  → 3:4 portrait
   * - 1184x864  → 4:3 landscape
   * - 896x1152  → 4:5 portrait
   * - 1152x896  → 5:4 landscape
   * - 768x1344  → 9:16 tall portrait (good for covers)
   * - 1344x768  → 16:9 wide landscape
   * - 1536x672  → 21:9 ultra-wide
   */
  private sizeToAspectRatio(size: string): string {
    // Direct mapping of supported sizes to aspect ratios
    const sizeToRatioMap: Record<string, string> = {
      '1024x1024': '1:1',
      '832x1248': '2:3',
      '1248x832': '3:2',
      '864x1184': '3:4',
      '1184x864': '4:3',
      '896x1152': '4:5',
      '1152x896': '5:4',
      '768x1344': '9:16',
      '1344x768': '16:9',
      '1536x672': '21:9',
    };

    // Direct lookup first
    if (sizeToRatioMap[size]) {
      return sizeToRatioMap[size];
    }

    // Fallback: calculate aspect ratio for any custom sizes
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return '1:1';

    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);

    // Map to closest supported aspect ratio
    if (height > width) {
      const ratio = width / height;
      if (ratio <= 0.6) return '9:16'; // Very tall portrait
      if (ratio <= 0.7) return '2:3'; // Standard portrait
      if (ratio <= 0.8) return '3:4'; // Mild portrait
      if (ratio <= 0.85) return '4:5'; // Slight portrait
      return '1:1';
    }

    if (width > height) {
      const ratio = width / height;
      if (ratio >= 2.0) return '21:9'; // Ultra-wide
      if (ratio >= 1.6) return '16:9'; // Wide landscape
      if (ratio >= 1.3) return '3:2'; // Standard landscape
      if (ratio >= 1.2) return '4:3'; // Mild landscape
      if (ratio >= 1.1) return '5:4'; // Slight landscape
      return '1:1';
    }

    return '1:1';
  }

  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable()) {
      throw new Error('OpenRouter image generation is not available. Please configure API key.');
    }

    const model = request.model || this.configuredModels[0]?.id || 'black-forest-labs/flux-1.1-pro';
    const modelInfo = this.configuredModels.find((m) => m.id === model);

    if (!modelInfo) {
      throw new Error(
        `Invalid model: ${model}. Available models: ${this.configuredModels.map((m) => m.id).join(', ')}`
      );
    }

    // Build prompt with worldbuilding context
    const prompt = this.buildPromptWithContext(request);

    // Convert size to aspect ratio for OpenRouter image_config
    const aspectRatio = this.sizeToAspectRatio(request.size || '1024x1024');

    console.log(
      `[OpenRouter] Generating image with model: ${model}, size: ${request.size}, aspect_ratio: ${aspectRatio}`
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      // OpenRouter uses chat completions API with modalities for image generation
      // See: https://openrouter.ai/docs/features/multimodal/image-generation
      //
      // The image_config.aspect_ratio parameter is supported by Gemini models
      // and may be supported by other models. FLUX models may ignore this parameter.
      const requestBody: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        modalities: ['image', 'text'],
        stream: false,
      };

      // Add image_config with aspect_ratio
      // This is supported by Gemini models, and may work with others
      if (aspectRatio !== '1:1') {
        requestBody.image_config = {
          aspect_ratio: aspectRatio,
        };
      }

      const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://inkweld.app',
          'X-Title': 'Inkweld',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[OpenRouter] API error: ${response.status} - ${errorBody}`);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorBody}`);
      }

      const data = (await response.json()) as {
        error?: { message?: string; metadata?: { raw?: string; provider_name?: string } };
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; image_url?: { url?: string } }>;
            images?: Array<{ image_url?: { url?: string }; url?: string }>;
          };
        }>;
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
        created?: number;
      };

      // Check for error response in body (some providers return 200 with error in body)
      if (data.error) {
        const errorMsg = data.error.message || 'Unknown error';
        const metadata = data.error.metadata;
        let details = '';
        if (metadata?.raw) {
          try {
            const rawData = JSON.parse(metadata.raw);
            if (rawData.status === 'Content Moderated') {
              details = ` - Content was flagged by ${metadata.provider_name || 'provider'} safety filter. Try rephrasing the prompt or using a different model.`;
            } else if (rawData.details) {
              details = ` - ${JSON.stringify(rawData.details)}`;
            }
          } catch {
            details = ` - ${metadata.raw}`;
          }
        }
        console.error(`[OpenRouter] Provider error: ${errorMsg}${details}`);
        throw new Error(`OpenRouter provider error: ${errorMsg}${details}`);
      }

      // Handle different response formats from OpenRouter
      // Some models return a chat completion format, others return images differently
      const images: Array<{
        b64Json?: string;
        url?: string;
        revisedPrompt?: string;
        index: number;
      }> = [];

      // Check if we have the standard chat completion format with choices
      if (data.choices && Array.isArray(data.choices)) {
        for (const choice of data.choices) {
          // Format 1: Images in message.images array (Gemini-style)
          if (choice.message?.images && Array.isArray(choice.message.images)) {
            for (const image of choice.message.images) {
              const dataUrl = image.image_url?.url || image.url;
              if (dataUrl) {
                const revisedPrompt =
                  typeof choice.message.content === 'string' ? choice.message.content : undefined;
                const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
                if (base64Match) {
                  images.push({
                    b64Json: base64Match[1],
                    revisedPrompt,
                    index: images.length,
                  });
                } else {
                  images.push({
                    url: dataUrl,
                    revisedPrompt,
                    index: images.length,
                  });
                }
              }
            }
          }

          // Format 2: Content is an array with image_url objects (multimodal response)
          if (Array.isArray(choice.message?.content)) {
            for (const part of choice.message.content) {
              if (part.type === 'image_url' && part.image_url?.url) {
                const dataUrl = part.image_url.url;
                const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
                if (base64Match) {
                  images.push({
                    b64Json: base64Match[1],
                    index: images.length,
                  });
                } else {
                  images.push({
                    url: dataUrl,
                    index: images.length,
                  });
                }
              }
            }
          }
        }
      }

      // Format 3: FLUX/diffusion models may return data array directly (OpenAI images format)
      if (data.data && Array.isArray(data.data)) {
        for (const item of data.data) {
          if (item.b64_json) {
            images.push({
              b64Json: item.b64_json,
              revisedPrompt: item.revised_prompt,
              index: images.length,
            });
          } else if (item.url) {
            images.push({
              url: item.url,
              revisedPrompt: item.revised_prompt,
              index: images.length,
            });
          }
        }
      }

      if (images.length === 0) {
        console.error(
          `[OpenRouter] No images in response. Response:`,
          JSON.stringify(data, null, 2)
        );
        throw new Error(
          'OpenRouter did not return any images. The model may not support image generation.'
        );
      }

      return {
        created: data.created || Math.floor(Date.now() / 1000),
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
      if (err.name === 'AbortError') {
        throw new Error('OpenRouter image generation timed out');
      }
      console.error(`[OpenRouter] Error generating image: ${err.message || 'Unknown error'}`);
      throw new Error(
        `Failed to generate image with OpenRouter: ${err.message || 'Unknown error'}`
      );
    }
  }
}
