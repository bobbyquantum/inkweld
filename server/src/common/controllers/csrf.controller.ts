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

@ApiTags('CSRF')
@Controller('csrf')
export class CsrfController {
  @Get('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a CSRF token for form submissions' })
  getCsrfToken(@Req() req: Request, @Res() res: Response): void {
    try {
      // Generate a CSRF token (stored in the session)
      const token = req.csrfToken();

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
