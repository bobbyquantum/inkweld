/**
 * Cloudflare Workers AI image generation provider.
 *
 * Supports two modes:
 * 1. AI Binding (when running on Cloudflare Workers) - zero config, just works
 * 2. REST API (Docker, self-hosted, local dev) - requires account ID + API token
 *
 * @see https://developers.cloudflare.com/workers-ai/
 * @see https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 */
import type {
  ResolvedImageRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
} from '../../types/image-generation';
import { findModelLimits, normalizeSize } from '../../types/image-generation';
import { BaseImageProvider } from './base-provider';
import { logger } from '../logger.service';

const waiLog = logger.child('WorkersAI-Image');

/**
 * Cloudflare AI binding type (when running on Workers)
 * This is the interface for env.AI in Cloudflare Workers runtime
 */
interface CloudflareAiBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<unknown>;
}

export class WorkersAIImageProvider extends BaseImageProvider {
  readonly type: ImageProviderType = 'workersai';
  readonly name = 'Cloudflare Workers AI';

  // No default models - must be configured via API or admin settings
  private configuredModels: ImageModelInfo[] = [];
  private accountId: string | null = null;
  private aiBinding: CloudflareAiBinding | null = null;

  constructor(config?: { apiKey?: string; accountId?: string; enabled?: boolean }) {
    super(config);
    if (config?.accountId) {
      this.accountId = config.accountId;
    }
  }

  override configure(config: {
    apiKey?: string;
    endpoint?: string;
    accountId?: string;
    enabled?: boolean;
    models?: ImageModelInfo[];
    aiBinding?: CloudflareAiBinding;
  }): void {
    super.configure(config);
    if (config.accountId !== undefined) {
      this.accountId = config.accountId || null;
    }
    if (config.models && config.models.length > 0) {
      this.configuredModels = config.models;
    }
    if (config.aiBinding !== undefined) {
      this.aiBinding = config.aiBinding || null;
    }
  }

  /**
   * Set available models from configuration.
   */
  setModels(models: ImageModelInfo[]): void {
    if (models && models.length > 0) {
      this.configuredModels = models.map((m) => ({ ...m, provider: 'workersai' as const }));
    }
  }

  /**
   * Set the Cloudflare AI binding (for Workers runtime)
   */
  setAiBinding(binding: CloudflareAiBinding): void {
    this.aiBinding = binding;
  }

  isAvailable(): boolean {
    // Available if we have AI binding (Workers) OR REST API credentials
    const hasRestApi = this.enabled && !!this.apiKey && !!this.accountId;
    const hasBinding = !!this.aiBinding;
    return hasRestApi || hasBinding;
  }

  getModels(): ImageModelInfo[] {
    return this.configuredModels;
  }

  protected override getUnavailableReason(): string {
    if (!this.enabled) {
      return 'Provider is disabled';
    }
    if (!this.aiBinding && (!this.apiKey || !this.accountId)) {
      return 'API token and Account ID not configured (required for REST API mode)';
    }
    return 'Unknown error';
  }

  async generate(request: ResolvedImageRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable()) {
      throw new Error(
        'Workers AI is not available. Configure API token + Account ID, or use AI binding on Cloudflare.'
      );
    }

    const model = request.model;
    const prompt = this.buildPromptWithContext(request);

    // Parse size into width/height
    const [requestedWidth, requestedHeight] = this.parseSize(request.size || '1024x1024');

    // Normalize size to nearest supported size for this model
    const modelLimits = findModelLimits(model, 'workersai');
    const [width, height] = normalizeSize(requestedWidth, requestedHeight, modelLimits);

    if (width !== requestedWidth || height !== requestedHeight) {
      waiLog.info(
        `Normalized size from ${requestedWidth}x${requestedHeight} to ${width}x${height}`,
        {
          model,
        }
      );
    }

    waiLog.info(`Generating image`, { model, width, height, promptLength: prompt.length });

    try {
      let result: unknown;

      if (this.aiBinding) {
        // Use AI binding (Cloudflare Workers runtime)
        result = await this.generateWithBinding(model, prompt, width, height, request);
      } else {
        // Use REST API (Docker, self-hosted, local dev)
        result = await this.generateWithRestApi(model, prompt, width, height, request);
      }

      return this.transformResult(result, model, request);
    } catch (error: unknown) {
      const err = error as Error;
      waiLog.error(`Error generating image: ${err.message}`);
      throw new Error(`Failed to generate image with Workers AI: ${err.message}`, { cause: error });
    }
  }

  /**
   * Generate using Cloudflare AI binding (Workers runtime)
   */
  private async generateWithBinding(
    model: string,
    prompt: string,
    width: number,
    height: number,
    request: ResolvedImageRequest
  ): Promise<unknown> {
    if (!this.aiBinding) {
      throw new Error('AI binding not available');
    }

    // Check if this model requires multipart format (FLUX.2 models)
    const modelLimits = findModelLimits(model, 'workersai');
    const requiresMultipart = modelLimits?.requiresMultipart ?? false;

    waiLog.debug('Using AI binding for generation', { model, requiresMultipart });

    // Build input based on model type
    const innerBody: Record<string, unknown> = {
      prompt,
      width,
      height,
    };

    // Add steps/guidance if available (model-dependent, passed via profile options)
    const steps = request.options?.steps as number | undefined;
    if (steps) {
      innerBody.num_steps = steps;
    }

    // Add reference images for models that support it
    if (request.referenceImages && request.referenceImages.length > 0) {
      // Workers AI uses 'image' for single input or 'images' for multiple
      const images = request.referenceImages.map((img) => {
        // Extract base64 data without data URL prefix
        const base64Data = img.data.includes(',') ? img.data.split(',')[1] : img.data;
        return base64Data;
      });
      if (images.length === 1) {
        innerBody.image = images[0];
      } else {
        innerBody.images = images;
      }
    }

    // FLUX.2 models require multipart wrapper even with binding
    if (requiresMultipart) {
      return this.aiBinding.run(model, {
        multipart: {
          body: innerBody,
          contentType: 'application/json',
        },
      });
    }

    return this.aiBinding.run(model, innerBody);
  }

  /**
   * Generate using REST API (Docker, self-hosted, local dev)
   */
  private async generateWithRestApi(
    model: string,
    prompt: string,
    width: number,
    height: number,
    request: ResolvedImageRequest
  ): Promise<unknown> {
    if (!this.apiKey || !this.accountId) {
      throw new Error('API token and Account ID required for REST API mode');
    }

    // Check if this model requires multipart format (FLUX.2 models)
    const modelLimits = findModelLimits(model, 'workersai');
    const requiresMultipart = modelLimits?.requiresMultipart ?? false;

    waiLog.debug('REST API generation request', {
      model,
      requiresMultipart,
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 100),
      requestedSize: `${width}x${height}`,
      hasReferenceImages: !!request.referenceImages?.length,
      options: request.options,
    });

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

    try {
      let response: Response;

      if (requiresMultipart) {
        // FLUX.2 models require multipart/form-data format
        response = await this.generateWithMultipart(
          url,
          model,
          prompt,
          width,
          height,
          request,
          controller.signal
        );
      } else {
        // Standard JSON format for other models
        response = await this.generateWithJson(
          url,
          prompt,
          width,
          height,
          request,
          controller.signal
        );
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Try to parse as JSON for more detailed error info
        let errorDetails: unknown;
        try {
          errorDetails = JSON.parse(errorText);
        } catch {
          errorDetails = errorText;
        }
        waiLog.error('Workers AI API error', {
          status: response.status,
          statusText: response.statusText,
          model,
          requiresMultipart,
          errorDetails,
          requestedSize: `${width}x${height}`,
        });
        throw new Error(`Workers AI API error: ${response.status} - ${errorText}`);
      }

      // Workers AI returns the image directly as binary for image models
      // or as JSON with result for other models
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('image/')) {
        // Direct binary image response
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return { image: base64 };
      } else {
        // JSON response
        return response.json();
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const err = error as Error;
      if (err.name === 'AbortError') {
        throw new Error('Workers AI request timed out', { cause: error });
      }
      throw error;
    }
  }

  /**
   * Generate using standard JSON format (most Workers AI models)
   */
  private async generateWithJson(
    url: string,
    prompt: string,
    width: number,
    height: number,
    request: ResolvedImageRequest,
    signal: AbortSignal
  ): Promise<Response> {
    // Build request body
    const body: Record<string, unknown> = {
      prompt,
      width,
      height,
    };

    // Add optional parameters (passed via profile options)
    const steps = request.options?.steps as number | undefined;
    if (steps) {
      body.num_steps = steps;
    }

    // Add reference images for models that support it
    if (request.referenceImages && request.referenceImages.length > 0) {
      const images = request.referenceImages.map((img) => {
        const base64Data = img.data.includes(',') ? img.data.split(',')[1] : img.data;
        return base64Data;
      });
      if (images.length === 1) {
        body.image = images[0];
      } else {
        body.images = images;
      }
    }

    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  /**
   * Generate using multipart/form-data format (FLUX.2 models)
   *
   * FLUX.2 models expect simple form fields:
   * curl --form 'prompt=...' --form 'steps=25' --form 'width=1024' --form 'height=1024'
   *
   * @see https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/
   */
  private async generateWithMultipart(
    url: string,
    model: string,
    prompt: string,
    width: number,
    height: number,
    request: ResolvedImageRequest,
    signal: AbortSignal
  ): Promise<Response> {
    const formData = new FormData();

    // Required fields
    formData.append('prompt', prompt);
    formData.append('width', width.toString());
    formData.append('height', height.toString());

    // Optional parameters
    const steps = request.options?.steps as number | undefined;
    if (steps) {
      formData.append('steps', steps.toString());
    }

    // Add reference images for image-to-image
    if (request.referenceImages && request.referenceImages.length > 0) {
      const img = request.referenceImages[0];
      const base64Data = img.data.includes(',') ? img.data.split(',')[1] : img.data;
      // Convert base64 to blob for form upload
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: img.mimeType || 'image/png' });
      formData.append('image', imageBlob);
    }

    waiLog.debug('Sending FLUX.2 multipart request', {
      model,
      prompt: prompt.slice(0, 100),
      width,
      height,
      steps,
      hasReferenceImages: !!request.referenceImages?.length,
    });

    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        // Let fetch set Content-Type with boundary for FormData
      },
      body: formData,
      signal,
    });
  }

  /**
   * Transform Workers AI result to standard response format
   */
  private transformResult(
    result: unknown,
    model: string,
    request: ResolvedImageRequest
  ): ImageGenerateResponse {
    // Workers AI returns different formats depending on the model
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result as any;

    let b64Json: string | undefined;

    if (data.image) {
      // Direct image in result
      b64Json = data.image;
    } else if (data.result?.image) {
      // Nested result format
      b64Json = data.result.image;
    } else if (typeof data === 'string') {
      // Raw base64 string
      b64Json = data;
    } else if (Buffer.isBuffer(data)) {
      // Raw buffer
      b64Json = data.toString('base64');
    }

    if (!b64Json) {
      waiLog.error('Unexpected response format', { result: JSON.stringify(data).slice(0, 500) });
      throw new Error('Workers AI returned unexpected response format');
    }

    return {
      created: Math.floor(Date.now() / 1000),
      data: [
        {
          b64Json,
          index: 0,
        },
      ],
      provider: this.type,
      model,
      request: {
        prompt: request.prompt,
        size: request.size,
        quality: request.quality,
        style: request.style,
      },
    };
  }

  /**
   * Parse size string into width and height
   */
  private parseSize(size: string): [number, number] {
    if (size === 'auto' || !size.includes('x')) {
      return [1024, 1024];
    }
    const [w, h] = size.split('x').map(Number);
    return [w || 1024, h || 1024];
  }
}
