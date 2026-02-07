/**
 * Stable Diffusion image generation provider.
 * Supports AUTOMATIC1111/Stable Diffusion WebUI API and compatible endpoints.
 */
import type {
  ResolvedImageRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
} from '../../types/image-generation';
import { BaseImageProvider } from './base-provider';
import { logger } from '../logger.service';

const sdLog = logger.child('StableDiffusion');

// Default models - actual models depend on the server configuration
const DEFAULT_SD_MODELS: ImageModelInfo[] = [
  {
    id: 'sd-default',
    name: 'Default Model',
    provider: 'stable-diffusion',
    supportedSizes: ['512x512', '1024x1024', '1024x1792', '1792x1024'],
    supportsQuality: false,
    supportsStyle: false,
    maxImages: 4,
    description: 'Uses the default model configured on the server',
  },
];

interface SDTxt2ImgRequest {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  sampler_name?: string;
  batch_size?: number;
  n_iter?: number;
}

interface SDTxt2ImgResponse {
  images: string[]; // Base64 encoded images
  parameters: Record<string, unknown>;
  info: string;
}

interface SDModelResponse {
  title: string;
  model_name: string;
  hash?: string;
}

export class StableDiffusionProvider extends BaseImageProvider {
  readonly type: ImageProviderType = 'stable-diffusion';
  readonly name = 'Stable Diffusion';

  private cachedModels: ImageModelInfo[] = [];
  private lastModelFetch: number = 0;
  private readonly modelCacheDuration = 60000; // 1 minute

  constructor(config?: { apiKey?: string; endpoint?: string; enabled?: boolean }) {
    super(config);
  }

  protected override requiresApiKey(): boolean {
    // API key is optional for SD (depends on server config)
    return false;
  }

  protected override requiresEndpoint(): boolean {
    return true;
  }

  isAvailable(): boolean {
    return this.enabled && !!this.endpoint;
  }

  getModels(): ImageModelInfo[] {
    // Return cached models or default
    return this.cachedModels.length > 0 ? this.cachedModels : DEFAULT_SD_MODELS;
  }

  /**
   * Fetch available models from the SD server
   */
  async fetchModels(): Promise<ImageModelInfo[]> {
    if (!this.isAvailable()) {
      return DEFAULT_SD_MODELS;
    }

    // Use cache if fresh
    if (
      this.cachedModels.length > 0 &&
      Date.now() - this.lastModelFetch < this.modelCacheDuration
    ) {
      return this.cachedModels;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.endpoint}/sdapi/v1/sd-models`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        sdLog.warn(`Failed to fetch models: ${response.status}`);
        return DEFAULT_SD_MODELS;
      }

      const models = (await response.json()) as SDModelResponse[];

      this.cachedModels = models.map((model) => ({
        id: model.model_name,
        name: model.title,
        provider: 'stable-diffusion' as const,
        supportedSizes: ['512x512', '1024x1024', '1024x1792', '1792x1024'],
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 4,
        description: model.hash ? `Hash: ${model.hash}` : undefined,
      }));

      this.lastModelFetch = Date.now();
      return this.cachedModels;
    } catch (error) {
      sdLog.warn(`Error fetching models`, { error });
      return DEFAULT_SD_MODELS;
    }
  }

  async generate(request: ResolvedImageRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable()) {
      throw new Error('Stable Diffusion is not available. Please configure endpoint.');
    }

    // Build prompt with worldbuilding context
    const prompt = this.buildPromptWithContext(request);

    // Parse size into width/height
    const [width, height] = this.parseSize(request.size || '1024x1024');

    sdLog.info(`Generating image: ${width}x${height}`);

    const sdRequest: SDTxt2ImgRequest = {
      prompt,
      negative_prompt: request.negativePrompt,
      width,
      height,
      steps: 30,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: Math.min(request.n || 1, 4),
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes for SD

      const response = await fetch(`${this.endpoint}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sdRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        sdLog.error(`API error: ${response.status}`, { body: errorBody });
        throw new Error(`Stable Diffusion API error: ${response.status}`);
      }

      const data = (await response.json()) as SDTxt2ImgResponse;

      sdLog.info(`Generated ${data.images.length} images`);

      return {
        created: Math.floor(Date.now() / 1000),
        data: data.images.map((b64, index) => ({
          b64Json: b64,
          index,
        })),
        provider: this.type,
        model: request.model || 'sd-default',
        request: {
          prompt: request.prompt,
          size: request.size,
        },
      };
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
      const err = error as any;
      if (err.name === 'AbortError') {
        throw new Error('Stable Diffusion image generation timed out', { cause: error });
      }
      sdLog.error(`Error generating image: ${err.message || 'Unknown error'}`);
      throw new Error(
        `Failed to generate image with Stable Diffusion: ${err.message || 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  private parseSize(size: string): [number, number] {
    const parts = size.split('x');
    if (parts.length !== 2) {
      return [1024, 1024];
    }
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }
}
