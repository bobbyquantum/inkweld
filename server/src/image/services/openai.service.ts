import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ImageGenerateRequestDto } from '../dto/image-generate-request.dto.js';
import { ImageResponseDto } from '../dto/image-response.dto.js';

@Injectable()
export class OpenAiImageService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAiImageService.name);
  private readonly SOURCE = 'openai';

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not defined in environment variables. Image generation will fail.');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate images based on a prompt.
   */
  async generate(request: ImageGenerateRequestDto): Promise<ImageResponseDto> {
    this.logger.debug(`Generating image with prompt: "${request.prompt}", model: ${request.model || 'default'}`);

    // Make a copy of the request to avoid mutating the original
    const modelType = request.model || 'dall-e-2'; // Default to dall-e-2 if not specified
    
    // Map DTO to OpenAI parameters with model-specific filtering
    const params: any = {
        prompt: request.prompt,
        model: modelType,
        n: request.n,
        user: request.user,
    };

    // Add model-specific parameters
    if (modelType === 'gpt-image-1') {
      // GPT Image Generator parameters
      params.quality = request.quality;
      params.size = request.size === 'auto' ? undefined : request.size;
      params.background = request.background;
      params.moderation = request.moderation;
      params.output_compression = request.output_compression;
      params.output_format = request.output_format;
      // Note: response_format is not supported for gpt-image-1 which always returns base64
    } else if (modelType === 'dall-e-3') {
      // DALL-E 3 parameters
      params.quality = request.quality;
      params.response_format = request.response_format;
      params.size = request.size === 'auto' ? undefined : request.size;
      params.style = request.style;
    } else {
      // DALL-E 2 parameters
      params.response_format = request.response_format;
      params.size = request.size === 'auto' ? undefined : request.size;
    }

    // Remove undefined properties
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

    this.logger.debug(`Sending parameters to OpenAI API: ${JSON.stringify(params)}`);

    try {
      // Create an abort controller with a 60-second timeout (image gen can be slow)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds

      const res = await this.openai.images.generate(params, {
        signal: controller.signal as AbortSignal,
      });

      // Clear the timeout since we got a response
      clearTimeout(timeoutId);

      this.logger.debug(`OpenAI image generation response received. Created: ${res.created}`);

      // Adapt OpenAI response to our DTO
      const responseDto: ImageResponseDto = {
        created: res.created,
        data: res.data.map(img => ({
          b64_json: img.b64_json,
          url: img.url,
          revised_prompt: img.revised_prompt,
        })),
        // Usage is optional and specific to gpt-image-1 in the latest API
        usage: (res as any).usage ? {
          total_tokens: (res as any).usage.total_tokens,
          input_tokens: (res as any).usage.input_tokens,
          output_tokens: (res as any).usage.output_tokens,
          input_tokens_details: (res as any).usage.input_tokens_details ? {
            text_tokens: (res as any).usage.input_tokens_details.text_tokens,
            image_tokens: (res as any).usage.input_tokens_details.image_tokens,
          } : undefined,
        } : undefined,
        source: this.SOURCE,
      };

      return responseDto;

    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        this.logger.warn(`OpenAI image generation timed out after 60 seconds for prompt: "${request.prompt}"`);
        throw new InternalServerErrorException('Image generation service timed out', {
          cause: err,
          description: 'The image generation service took too long to respond',
        });
      }

      this.logger.error(`Error calling OpenAI image generation for prompt "${request.prompt}": ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed to generate image with OpenAI', {
        cause: err,
      });
    }
  }

  // TODO: Implement edit and variation methods when needed
}
