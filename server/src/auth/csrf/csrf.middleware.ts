import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Skip CSRF check for the token endpoint and for methods that don't modify data
    if (
      req.path === '/csrf/token' ||
      ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    ) {
      return next();
    }

    // Get the secret from config or use a default
    const secret =
      this.configService.get<string>('CSRF_SECRET') || 'inkweld-csrf-secret';

    // Get the token from the X-CSRF-TOKEN header
    const token = req.header('X-CSRF-TOKEN') || '';

    // Verify the token using Bun.CSRF - must match the encoding used in generation
    if (
      !token ||
      !Bun.CSRF.verify(token, {
        secret,
        encoding: 'hex', // Must match the encoding used in CsrfController
      })
    ) {
      return res.status(403).json({
        message: 'Invalid CSRF token',
      });
    }

    // Store the secret in the request for token generation
    (req as any).csrfSecret = secret;

    next();
  }
}
