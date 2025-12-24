/**
 * OpenAI image generation provider.
 * Supports gpt-image-1 and gpt-image-1-mini models (formerly DALL-E).
 */
import OpenAI from 'openai';

import type {
  ImageGenerateRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
} from '../../types/image-generation';
import { BaseImageProvider } from './base-provider';

/**
 * Default OpenAI image models.
 * These can be overridden via the AI_IMAGE_OPENAI_MODELS config.
 */
export const DEFAULT_OPENAI_MODELS: ImageModelInfo[] = [
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    provider: 'openai',
    supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
    supportsQuality: true,
    supportsStyle: false,
    maxImages: 1,
    description: 'High-quality image generation with excellent prompt understanding',
  },
  {
    id: 'gpt-image-1-mini',
    name: 'GPT Image 1 Mini',
    provider: 'openai',
    supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
    supportsQuality: true,
    supportsStyle: false,
    maxImages: 1,
    description: 'Fast and cost-effective image generation',
  },
];

export class OpenAIImageProvider extends BaseImageProvider {
  readonly type: ImageProviderType = 'openai';
  readonly name = 'OpenAI';

  private client: OpenAI | null = null;
  private configuredModels: ImageModelInfo[] = DEFAULT_OPENAI_MODELS;

  constructor(config?: { apiKey?: string; enabled?: boolean }) {
    super(config);
    this.initializeClient();
  }

  private initializeClient(): void {
    if (this.apiKey) {
      this.client = new OpenAI({ apiKey: this.apiKey });
    } else {
      this.client = null;
    }
  }

  override configure(config: {
    apiKey?: string;
    endpoint?: string;
    enabled?: boolean;
    models?: ImageModelInfo[];
  }): void {
    super.configure(config);
    this.initializeClient();
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
      this.configuredModels = models.map((m) => ({ ...m, provider: 'openai' as const }));
    }
  }

  isAvailable(): boolean {
    return this.enabled && !!this.apiKey && !!this.client;
  }

  getModels(): ImageModelInfo[] {
    return this.configuredModels;
  }

  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable() || !this.client) {
      throw new Error('OpenAI image generation is not available. Please configure API key.');
    }

    const model = request.model || this.configuredModels[0]?.id || 'gpt-image-1';
    const modelInfo = this.configuredModels.find((m) => m.id === model);

    if (!modelInfo) {
      throw new Error(
        `Invalid model: ${model}. Available models: ${this.configuredModels.map((m) => m.id).join(', ')}`
      );
    }

    // Validate size for model
    const size = request.size || '1024x1024';
    if (!modelInfo.supportedSizes.includes(size) && !modelInfo.supportedSizes.includes('auto')) {
      throw new Error(
        `Size ${size} not supported by ${model}. Supported: ${modelInfo.supportedSizes.join(', ')}`
      );
    }

    // Validate number of images
    const n = Math.min(request.n || 1, modelInfo.maxImages);

    // Build prompt with worldbuilding context
    const prompt = this.buildPromptWithContext(request);

    console.log(`[OpenAI] Generating image with model: ${model}, size: ${size}, n: ${n}`);

    // Build request parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAI SDK has complex types
    const params: any = {
      prompt,
      model,
      n,
      size,
      response_format: 'b64_json',
    };

    // Add quality parameter if model supports it
    if (modelInfo.supportsQuality && request.quality) {
      params.quality = request.quality;
    }

    // Add style parameter if model supports it
    if (modelInfo.supportsStyle && request.style) {
      params.style = request.style;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

      const response = await this.client.images.generate(params, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`[OpenAI] Image generated successfully. Created: ${response.created}`);

      return {
        created: response.created,
        data: (response.data ?? []).map((img, index) => ({
          b64Json: img.b64_json,
          url: img.url,
          revisedPrompt: img.revised_prompt,
          index,
        })),
        provider: this.type,
        model,
        request: {
          prompt: request.prompt,
          size,
          quality: request.quality,
          style: request.style,
        },
      };
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
      const err = error as any;
      if (err.name === 'AbortError') {
        throw new Error('OpenAI image generation timed out');
      }
      console.error(`[OpenAI] Error generating image: ${err.message || 'Unknown error'}`);
      throw new Error(`Failed to generate image with OpenAI: ${err.message || 'Unknown error'}`);
    }
  }
}
