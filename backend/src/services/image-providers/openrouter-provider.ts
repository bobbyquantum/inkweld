/**
 * OpenRouter image generation provider.
 * Uses the OpenRouter SDK to access various image models (FLUX, Gemini, GPT, etc.).
 * Models are fetched dynamically from OpenRouter's API.
 */
import { CallModelInput, OpenRouter } from '@openrouter/sdk';
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
  formatReferenceImagesForOpenRouter,
} from '../../utils/prompt-utils';

const orLog = logger.child('OpenRouter');

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
    let prompt = this.buildPromptWithContext(request);

    // Size comes in as aspect ratio (e.g., "16:9", "1:1") - use directly
    const aspectRatio = request.size || '1:1';

    // Optimize prompt for model limits
    const promptResult = optimizePromptForModel(prompt, this.type, model);
    if (promptResult.wasOptimized) {
      orLog.warn(`Prompt truncated for model limits`, {
        model,
        originalChars: promptResult.originalChars,
        optimizedChars: promptResult.optimizedChars,
      });
      prompt = promptResult.prompt;
    }

    // Validate and prepare reference images
    const referenceImages = request.referenceImages || [];
    const imageResult = validateReferenceImages(referenceImages, this.type, model);
    if (imageResult.wasLimited) {
      orLog.warn(`Reference images limited for model`, {
        model,
        originalCount: imageResult.originalCount,
        limitedTo: imageResult.images.length,
      });
    }

    orLog.info(`Generating image`, {
      model,
      aspectRatio,
      promptChars: promptResult.optimizedChars,
      referenceImages: imageResult.images.length,
    });

    try {
      const openRouter = new OpenRouter({
        apiKey: this.apiKey!,
        httpReferer: 'https://inkweld.app',
        xTitle: 'Inkweld',
      });

      // Build input content - text prompt + optional reference images
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputContent: any[] = [{ type: 'input_text', text: prompt }];
      if (imageResult.images.length > 0) {
        inputContent.push(...formatReferenceImagesForOpenRouter(imageResult.images));
      }

      const sendOptions: CallModelInput = {
        model,
        imageConfig: {
          aspect_ratio: aspectRatio,
        },
        input: [
          {
            role: 'user',
            type: 'message',
            content: inputContent,
          },
        ],
        truncation: 'auto',
        modalities: ['image', 'text'] as ('image' | 'text')[],
      };

      orLog.info(`Sending request`, {
        model,
        promptLength: prompt.length,
        aspectRatio,
        imageCount: imageResult.images.length,
      });

      const result = await openRouter.callModel(sendOptions);
      const response = await result.getResponse();

      orLog.info(`Received response`, {
        status: response.status,
        outputLength: response.output?.length,
      });

      // Extract images from the responses API format
      const images: Array<{
        b64Json?: string;
        url?: string;
        revisedPrompt?: string;
        index: number;
      }> = [];

      if (response.output && Array.isArray(response.output)) {
        for (let i = 0; i < response.output.length; i++) {
          const item = response.output[i];
          // Image generation results come as { type: 'image_generation_call', result: 'data:image/png;base64,...' }
          if (item.type === 'image_generation_call' && item.result) {
            const dataUrl = item.result as string;
            if (dataUrl.startsWith('data:image/')) {
              // Extract base64 from data URL
              const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
              if (base64Match) {
                images.push({
                  b64Json: base64Match[1],
                  index: i,
                });
              } else {
                images.push({
                  url: dataUrl,
                  index: i,
                });
              }
            }
          }
        }
      }

      if (images.length === 0) {
        // Check for text response (might be a refusal/explanation)
        const textContent = response.outputText?.trim();

        orLog.error('No images in response', undefined, {
          textContent: textContent?.substring(0, 500),
          rawOutput: JSON.stringify(response.output).substring(0, 2000),
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
            textContent:
              textContent.length > 500 ? textContent.substring(0, 500) + '...' : textContent,
          };
        }

        throw new Error('The model did not generate an image and provided no explanation.');
      }

      orLog.info(`Successfully extracted ${images.length} image(s)`);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      const errorMessage = err.message || 'Unknown error';

      // SDK throws ChatError with body as JSON string - parse it
      let parsedBody: any = null;
      if (err.body && typeof err.body === 'string') {
        try {
          parsedBody = JSON.parse(err.body);
        } catch {
          // Body isn't JSON, that's fine
        }
      }

      // Check for moderation block in various places
      const rawMetadata = parsedBody?.error?.metadata?.raw || '';
      const providerName = parsedBody?.error?.metadata?.provider_name || 'the provider';

      if (
        errorMessage.includes('Request Moderated') ||
        errorMessage.includes('Content Moderated') ||
        rawMetadata.includes('Request Moderated') ||
        rawMetadata.includes('Moderated')
      ) {
        throw new Error(
          `MODERATION_BLOCKED: Your request was blocked by ${providerName}'s content filter. Try rephrasing the prompt or using a different model.`
        );
      }

      if (err.name === 'AbortError') {
        throw new Error('OpenRouter image generation timed out');
      }

      orLog.error(`Error generating image: ${errorMessage}`, undefined, {
        errorName: err.name,
        rawError: JSON.stringify(err).substring(0, 1000),
      });

      throw new Error(`Failed to generate image with OpenRouter: ${errorMessage}`);
    }
  }
}
