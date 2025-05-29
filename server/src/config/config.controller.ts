import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemConfigService } from './config.service.js';
import type { SystemFeatures } from './config.service.js';

@ApiTags('config')
@Controller('api/config')
export class ConfigController {
  constructor(private readonly configService: SystemConfigService) {}

  @Get('features')
  @ApiOperation({
    summary: 'Get system features configuration',
    description:
      'Returns which system features are currently enabled based on environment configuration',
  })
  @ApiOkResponse({
    description: 'System features configuration',
    schema: {
      type: 'object',
      properties: {
        aiLinting: {
          type: 'boolean',
          description: 'Whether AI-powered linting is available',
        },
        aiImageGeneration: {
          type: 'boolean',
          description: 'Whether AI-powered image generation is available',
        },
        captcha: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            siteKey: { type: 'string' },
          },
          description: 'ReCaptcha configuration for registration',
        },
      },
    },
  })
  getSystemFeatures(): SystemFeatures {
    return this.configService.getSystemFeatures();
  }
}
