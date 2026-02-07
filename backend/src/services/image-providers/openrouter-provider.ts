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
      // Build message content - text prompt + optional reference images
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageContent: any[] = [{ type: 'text', text: prompt }];
      if (imageResult.images.length > 0) {
        for (const img of imageResult.images) {
          messageContent.push({
            type: 'image_url',
            image_url: {
              url: normalizeImageDataUrl(img.data, img.mimeType),
              detail: 'auto',
            },
          });
        }
      }

      // Build request body for chat/completions API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: any = {
        model,
        modalities: ['text', 'image'],
        messages: [
          {
            role: 'user',
            content: messageContent,
          },
        ],
      };

      // Add image_config for aspect ratio (supported by some models like Gemini)
      if (aspectRatio && aspectRatio !== '1:1') {
        requestBody.image_config = {
          aspect_ratio: aspectRatio,
        };
      }

      orLog.info(`Sending request`, {
        model,
        promptLength: prompt.length,
        aspectRatio,
        imageCount: imageResult.images.length,
      });

      // Use direct fetch instead of SDK to avoid CPU accumulation from streaming infrastructure
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
        const errorBody = await response.text();
        let parsedError: {
          error?: { message?: string; metadata?: { raw?: string; provider_name?: string } };
        } | null = null;
        try {
          parsedError = JSON.parse(errorBody);
        } catch {
          // Not JSON
        }

        // Check for moderation in error response
        const errorMessage = parsedError?.error?.message || errorBody;
        const rawMetadata = parsedError?.error?.metadata?.raw || '';
        const providerName = parsedError?.error?.metadata?.provider_name || 'the provider';

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

        throw new Error(`OpenRouter API error (${response.status}): ${errorMessage}`);
      }

      // OpenRouter response structure
      interface OpenRouterImageResponse {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
            images?: Array<{ url?: string; image_url?: { url: string } }>;
          };
        }>;
      }
      const data = (await response.json()) as OpenRouterImageResponse;

      orLog.info(`Received response`, {
        status: response.status,
        choicesLength: data.choices?.length,
      });

      // Extract images from the chat completions response format
      const images: Array<{
        b64Json?: string;
        url?: string;
        revisedPrompt?: string;
        index: number;
      }> = [];

      const message = data.choices?.[0]?.message;
      if (message?.images && Array.isArray(message.images)) {
        // Images returned in message.images array
        for (let i = 0; i < message.images.length; i++) {
          const img = message.images[i];
          const imageUrl = img.image_url?.url || img.url;
          if (imageUrl) {
            if (imageUrl.startsWith('data:image/')) {
              // Extract base64 from data URL
              const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
              if (base64Match) {
                images.push({
                  b64Json: base64Match[1],
                  index: i,
                });
              } else {
                images.push({
                  url: imageUrl,
                  index: i,
                });
              }
            } else {
              images.push({
                url: imageUrl,
                index: i,
              });
            }
          }
        }
      }

      // Also check for images in content array (alternative format)
      if (images.length === 0 && message?.content && Array.isArray(message.content)) {
        for (let i = 0; i < message.content.length; i++) {
          const item = message.content[i];
          if (item.type === 'image_url' && item.image_url?.url) {
            const imageUrl = item.image_url.url;
            if (imageUrl.startsWith('data:image/')) {
              const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
              if (base64Match) {
                images.push({
                  b64Json: base64Match[1],
                  index: i,
                });
              } else {
                images.push({
                  url: imageUrl,
                  index: i,
                });
              }
            } else {
              images.push({
                url: imageUrl,
                index: i,
              });
            }
          }
        }
      }

      if (images.length === 0) {
        // Check for text response (might be a refusal/explanation)
        let textContent = '';
        if (typeof message?.content === 'string') {
          textContent = message.content.trim();
        } else if (Array.isArray(message?.content)) {
          const textParts = (message.content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '');
          textContent = textParts.join('\n').trim();
        }

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

      // Re-throw moderation errors as-is
      if (errorMessage.startsWith('MODERATION_BLOCKED:')) {
        throw error;
      }

      if (err.name === 'AbortError') {
        throw new Error('OpenRouter image generation timed out', { cause: error });
      }

      orLog.error(`Error generating image: ${errorMessage}`, undefined, {
        errorName: err.name,
        rawError: JSON.stringify(err).substring(0, 1000),
      });

      throw new Error(`Failed to generate image with OpenRouter: ${errorMessage}`, {
        cause: error,
      });
    }
  }
}
