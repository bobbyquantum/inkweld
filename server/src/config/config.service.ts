import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SystemFeatures {
  aiLinting: boolean;
  aiImageGeneration: boolean;
}

@Injectable()
export class SystemConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the current system features configuration
   * @returns SystemFeatures object indicating which features are enabled
   */
  getSystemFeatures(): SystemFeatures {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    const hasOpenAI = !!openaiApiKey && openaiApiKey.trim().length > 0;

    return {
      aiLinting: hasOpenAI,
      aiImageGeneration: hasOpenAI,
    };
  }
} 