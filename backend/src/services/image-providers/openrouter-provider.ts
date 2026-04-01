/**
 * OpenRouter image generation provider.
 * Uses direct fetch to the chat/completions API for Cloudflare Workers compatibility.
 * The SDK's Responses API accumulates CPU time through streaming, exceeding Workers limits.
 */
import type {
  ResolvedImageRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderType,
} from '../../types/image-generation';
import { BaseImageProvider } from './base-provider';
import { logger } from '../logger.service';
import {
  optimizePromptForModel,
  validateReferenceImages,
  normalizeImageDataUrl,
} from '../../utils/prompt-utils';

const orLog = logger.child('OpenRouter');

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: OpenRouterMessage;
  }>;
}

interface OpenRouterMessage {
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  images?: Array<{ url?: string; image_url?: { url: string } }>;
}

export class OpenRouterImageProvider extends BaseImageProvider {
  readonly type: ImageProviderType = 'openrouter';
  readonly name = 'OpenRouter';

  private configuredModels: ImageModelInfo[] = [];

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

  async generate(request: ResolvedImageRequest): Promise<ImageGenerateResponse> {
    if (!this.isAvailable()) {
      throw new Error('OpenRouter image generation is not available. Please configure API key.');
    }

    const model = request.model;
    const aspectRatio = request.size || '1:1';
    const { prompt, imageResult } = this.prepareRequest(request, model);

    orLog.info(`Generating image`, {
      model,
      aspectRatio,
      promptChars: prompt.length,
      referenceImages: imageResult.images.length,
    });

    try {
      const requestBody = this.buildRequestBody(model, prompt, imageResult, aspectRatio);

      orLog.info(`Sending request`, {
        model,
        promptLength: prompt.length,
        aspectRatio,
        imageCount: imageResult.images.length,
      });

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://inkweld.app',
          'X-Title': 'Inkweld',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as OpenRouterImageResponse;

      orLog.info(`Received response`, {
        status: response.status,
        choicesLength: data.choices?.length,
      });

      const message = data.choices?.[0]?.message;
      const images = this.extractImagesFromMessage(message);

      if (images.length === 0) {
        return this.handleNoImages(message, request, model);
      }

      orLog.info(`Successfully extracted ${images.length} image(s)`);

      return this.buildSuccessResponse(images, request, model);
    } catch (error: unknown) {
      throw this.wrapError(error);
    }
  }

  private prepareRequest(
    request: ResolvedImageRequest,
    model: string
  ): {
    prompt: string;
    imageResult: ReturnType<typeof validateReferenceImages>;
  } {
    let prompt = this.buildPromptWithContext(request);

    const promptResult = optimizePromptForModel(prompt, this.type, model);
    if (promptResult.wasOptimized) {
      orLog.warn(`Prompt truncated for model limits`, {
        model,
        originalChars: promptResult.originalChars,
        optimizedChars: promptResult.optimizedChars,
      });
      prompt = promptResult.prompt;
    }

    const referenceImages = request.referenceImages || [];
    const imageResult = validateReferenceImages(referenceImages, this.type, model);
    if (imageResult.wasLimited) {
      orLog.warn(`Reference images limited for model`, {
        model,
        originalCount: imageResult.originalCount,
        limitedTo: imageResult.images.length,
      });
    }

    return { prompt, imageResult };
  }

  private buildRequestBody(
    model: string,
    prompt: string,
    imageResult: ReturnType<typeof validateReferenceImages>,
    aspectRatio: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageContent: any[] = [{ type: 'text', text: prompt }];
    for (const img of imageResult.images) {
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: normalizeImageDataUrl(img.data, img.mimeType),
          detail: 'auto',
        },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      model,
      modalities: ['text', 'image'],
      messages: [{ role: 'user', content: messageContent }],
    };

    if (aspectRatio && aspectRatio !== '1:1') {
      body.image_config = { aspect_ratio: aspectRatio };
    }

    return body;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorBody = await response.text();
    let parsedError: {
      error?: { message?: string; metadata?: { raw?: string; provider_name?: string } };
    } | null = null;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      // Not JSON
    }

    const errorMessage = parsedError?.error?.message || errorBody;
    const rawMetadata = parsedError?.error?.metadata?.raw || '';
    const providerName = parsedError?.error?.metadata?.provider_name || 'the provider';

    const isModerated =
      errorMessage.includes('Request Moderated') ||
      errorMessage.includes('Content Moderated') ||
      rawMetadata.includes('Request Moderated') ||
      rawMetadata.includes('Moderated');

    if (isModerated) {
      throw new Error(
        `MODERATION_BLOCKED: Your request was blocked by ${providerName}'s content filter. Try rephrasing the prompt or using a different model.`
      );
    }

    throw new Error(`OpenRouter API error (${response.status}): ${errorMessage}`);
  }

  private parseImageUrl(
    imageUrl: string,
    index: number
  ): { b64Json?: string; url?: string; mimeType?: string; revisedPrompt?: string; index: number } {
    if (imageUrl.startsWith('data:image/')) {
      const base64Match = /^data:(image\/[^;]+);base64,(.+)$/.exec(imageUrl);
      if (base64Match) {
        return { b64Json: base64Match[2], mimeType: base64Match[1], index };
      }
    }
    return { url: imageUrl, index };
  }

  private extractImagesFromMessage(message: OpenRouterMessage | undefined): Array<{
    b64Json?: string;
    url?: string;
    mimeType?: string;
    revisedPrompt?: string;
    index: number;
  }> {
    if (!message) return [];

    // Try message.images array first
    if (message.images && Array.isArray(message.images)) {
      const images = message.images.flatMap((img, i) => {
        const imageUrl = img.image_url?.url || img.url;
        return imageUrl ? [this.parseImageUrl(imageUrl, i)] : [];
      });
      if (images.length > 0) return images;
    }

    // Fall back to content array
    if (Array.isArray(message.content)) {
      return message.content.flatMap((item, i) => {
        if (item.type === 'image_url' && item.image_url?.url) {
          return [this.parseImageUrl(item.image_url.url, i)];
        }
        return [];
      });
    }

    return [];
  }

  private extractTextContent(message: OpenRouterMessage | undefined): string {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content.trim();
    if (Array.isArray(message.content)) {
      return message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')
        .trim();
    }
    return '';
  }

  private handleNoImages(
    message: OpenRouterMessage | undefined,
    request: ResolvedImageRequest,
    model: string
  ): ImageGenerateResponse {
    const textContent = this.extractTextContent(message);

    orLog.error('No images in response', undefined, {
      textContent: textContent?.substring(0, 500),
      rawMessage: JSON.stringify(message).substring(0, 2000),
    });

    if (textContent) {
      return {
        created: Math.floor(Date.now() / 1000),
        data: [],
        provider: this.type,
        model,
        request: {
          prompt: request.prompt,
          size: request.size,
          quality: request.quality,
          style: request.style,
        },
        textContent: textContent.length > 500 ? textContent.substring(0, 500) + '...' : textContent,
      };
    }

    throw new Error('The model did not generate an image and provided no explanation.');
  }

  private buildSuccessResponse(
    images: Array<{
      b64Json?: string;
      url?: string;
      mimeType?: string;
      revisedPrompt?: string;
      index: number;
    }>,
    request: ResolvedImageRequest,
    model: string
  ): ImageGenerateResponse {
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
  }

  private wrapError(error: unknown): Error {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    const errorMessage = err.message || 'Unknown error';

    if (errorMessage.startsWith('MODERATION_BLOCKED:')) {
      return err;
    }

    if (err.name === 'AbortError') {
      return new Error('OpenRouter image generation timed out', { cause: error });
    }

    orLog.error(`Error generating image: ${errorMessage}`, undefined, {
      errorName: err.name,
      rawError: JSON.stringify(err).substring(0, 1000),
    });

    return new Error(`Failed to generate image with OpenRouter: ${errorMessage}`, {
      cause: error,
    });
  }
}
