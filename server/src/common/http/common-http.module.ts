import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CsrfController } from '../controllers/csrf.controller.js';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';

@Module({
  controllers: [CsrfController],
  providers: [ConfigService],
})
export class CommonHttpModule implements NestModule {
  constructor(private configService: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    // Get the secret from config or use a default
    const secret =
      this.configService.get<string>('CSRF_SECRET') || 'inkweld-csrf-secret';

    // Create a middleware that handles CSRF protection using Bun.CSRF
    const csrfMiddleware = (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      // Skip CSRF check for the token endpoint and for methods that don't modify data
      if (
        req.path === '/csrf/token' ||
        ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      ) {
        return next();
      }

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
    };

    // Apply the middleware to all routes
    consumer.apply(csrfMiddleware).forRoutes('*');
  }
}
