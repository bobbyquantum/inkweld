import OpenAI from 'openai';
import { config } from '../config/env';

interface ImageGenerateRequest {
  prompt: string;
  model?: 'dall-e-2' | 'dall-e-3';
  n?: number;
  quality?: 'standard' | 'hd';
  response_format?: 'url' | 'b64_json';
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  style?: 'vivid' | 'natural';
}

interface ImageDataDto {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

interface ImageResponseDto {
  created: number;
  data: ImageDataDto[];
  source: string;
}

export class OpenAIImageService {
  private openai: OpenAI | null = null;
  private isEnabled: boolean = false;
  private readonly SOURCE = 'openai';

  constructor() {
    const apiKey = config.openai.apiKey;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not configured. AI image generation disabled.');
      this.isEnabled = false;
    } else {
      this.openai = new OpenAI({ apiKey });
      this.isEnabled = true;
      console.log('OpenAI image service initialized');
    }
  }

  public isAiEnabled(): boolean {
    return this.isEnabled;
  }

  public async generate(request: ImageGenerateRequest): Promise<ImageResponseDto> {
    if (!this.isEnabled || !this.openai) {
      throw new Error(
        'AI image generation features are not available. Please configure OPENAI_API_KEY.'
      );
    }

    console.log(
      `Generating image with prompt: "${request.prompt}", model: ${request.model || 'dall-e-2'}`
    );

    const modelType = request.model || 'dall-e-2';

    // Prepare parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAI SDK accepts dynamic parameters based on model
    const params: any = {
      prompt: request.prompt,
      model: modelType,
      n: request.n,
    };

    // Add model-specific parameters
    if (modelType === 'dall-e-3') {
      params.quality = request.quality;
      params.response_format = request.response_format;
      params.size = request.size;
      params.style = request.style;
    } else {
      params.response_format = request.response_format;
      params.size = request.size;
    }

    // Remove undefined properties
    Object.keys(params).forEach((key) => params[key] === undefined && delete params[key]);

    console.log(`Sending parameters to OpenAI API: ${JSON.stringify(params)}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

      const res = await this.openai.images.generate(params, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`OpenAI image generation response received. Created: ${res.created}`);

      const responseDto: ImageResponseDto = {
        created: res.created,
        data: (res.data ?? []).map((img) => ({
          b64_json: img.b64_json,
          url: img.url,
          revised_prompt: img.revised_prompt,
        })),
        source: this.SOURCE,
      };

      return responseDto;
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAI error structure is complex
      const err = error as any;
      if (err.name === 'AbortError') {
        console.warn(
          `OpenAI image generation timed out after 3 minutes for prompt: "${request.prompt}"`
        );
        throw new Error('Image generation service timed out');
      }

      console.error(
        `Error calling OpenAI image generation for prompt "${request.prompt}": ${err.message || 'Unknown error'}`
      );
      throw new Error('Failed to generate image with OpenAI');
    }
  }
}

// Singleton instance
export const openAIImageService = new OpenAIImageService();
