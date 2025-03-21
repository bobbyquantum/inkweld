import {
  Controller,
  Get,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@ApiTags('CSRF')
@Controller('csrf')
export class CsrfController {
  constructor(private configService: ConfigService) {}

  @Get('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a CSRF token for form submissions' })
  getCsrfToken(@Req() _req: Request, @Res() res: Response): void {
    try {
      // Get the secret from config or use a default
      const secret =
        this.configService.get<string>('CSRF_SECRET') || 'inkweld-csrf-secret';

      // Generate a token using Bun.CSRF - default expiry is 1 hour
      const token = Bun.CSRF.generate(secret, {
        encoding: 'hex', // Optional: could be 'base64url' (default) or 'hex'
        expiresIn: 60 * 60 * 1000, // 1 hour in milliseconds
      });

      // Return the token in the response body
      res.json({ token });
    } catch (error: any) {
      console.error('Error generating CSRF token:', error);
      res.status(500).json({
        message: 'Failed to generate CSRF token',
        error:
          process.env.NODE_ENV === 'production' ? undefined : error.message,
      });
    }
  }
}
