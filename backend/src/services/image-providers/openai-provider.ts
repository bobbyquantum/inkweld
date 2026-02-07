/**
 * OpenAI image generation provider.
 * Supports gpt-image-1, gpt-image-1-mini, and gpt-image-1.5 models.
 */
import OpenAI from 'openai';

import type {
  ResolvedImageRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
} from '../../types/image-generation';
import { BaseImageProvider } from './base-provider';
import { logger } from '../logger.service';

const oaiLog = logger.child('OpenAI-Image');

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
    maxImages: 10,
    description: 'High-quality image generation with excellent prompt understanding',
  },
  {
    id: 'gpt-image-1-mini',
    name: 'GPT Image 1 Mini',
    provider: 'openai',
    supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
    supportsQuality: true,
    supportsStyle: false,
    maxImages: 10,
    description: 'Fast and cost-effective image generation',
  },
  {
    id: 'gpt-image-1.5',
    name: 'GPT Image 1.5',
    provider: 'openai',
    supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
    supportsQuality: true,
    supportsStyle: false,
    maxImages: 10,
    description: 'Latest GPT image model with enhanced capabilities',
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
      const options: { apiKey: string; baseURL?: string } = { apiKey: this.apiKey };
      if (this.endpoint) {
        options.baseURL = this.endpoint;
      }
      this.client = new OpenAI(options);
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

  async generate(request: ResolvedImageRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable() || !this.client) {
      throw new Error('OpenAI image generation is not available. Please configure API key.');
    }

    // Model comes from the profile - no validation needed
    const model = request.model;
    const size = request.size || '1024x1024';
    const n = request.n || 1;

    // Build prompt with worldbuilding context
    const prompt = this.buildPromptWithContext(request);

    oaiLog.info(`Generating image`, { model, size, n });

    // Build request parameters for GPT image models
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAI SDK has complex types
    const params: any = {
      prompt,
      model,
      n,
      size,
      output_format: 'png', // GPT image models always use output_format
    };

    // Add quality parameter if provided
    // GPT image models use: 'low', 'medium', 'high', 'auto'
    if (request.quality) {
      // Map legacy quality values to GPT image model values
      const qualityMap: Record<string, string> = {
        standard: 'medium',
        hd: 'high',
      };
      params.quality = qualityMap[request.quality] || request.quality;
    }

    // Note: GPT image models do not support the 'style' parameter

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

      const response = await this.client.images.generate(params, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      oaiLog.info(`Image generated successfully`, { created: response.created });

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
        throw new Error('OpenAI image generation timed out', { cause: error });
      }
      oaiLog.error(`Error generating image: ${err.message || 'Unknown error'}`);
      throw new Error(`Failed to generate image with OpenAI: ${err.message || 'Unknown error'}`, {
        cause: error,
      });
    }
  }
}
