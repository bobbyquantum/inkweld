import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  version?: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns basic server health status and information',
  })
  @ApiOkResponse({
    description: 'Server is healthy',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          example: 'ok',
          description: 'Health status of the server'
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'Current server timestamp'
        },
        uptime: {
          type: 'number',
          description: 'Server uptime in seconds'
        },
        version: {
          type: 'string',
          description: 'Application version'
        }
      }
    }
  })
  getHealth(): HealthResponse {
    const now = Date.now();
    const uptimeMs = now - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    return {
      status: 'ok',
      timestamp: new Date(now).toISOString(),
      uptime: uptimeSeconds,
      version: process.env.INKWELD_VERSION || '1.0.0'
    };
  }
} 