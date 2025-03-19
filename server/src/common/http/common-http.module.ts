import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CsrfController } from '../controllers/csrf.controller.js';
import { ConfigService } from '@nestjs/config';
import csurf from 'csurf';
import type { Request, Response, NextFunction } from 'express';

@Module({
  controllers: [CsrfController],
  providers: [ConfigService],
})
export class CommonHttpModule implements NestModule {
  constructor(private configService: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    // Create CSRF middleware with proper configuration using session storage (not cookies)
    const csrfMiddleware = csurf({
      sessionKey: 'session', // The name of the session object on the request
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
      value: (req: Request) => {
        // Check for the token in the header the frontend is using
        return req.header('X-CSRF-TOKEN') || '';
      },
    });

    // Create a middleware that skips CSRF protection for the token endpoint
    const csrfMiddlewareWithExceptions = (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      // Skip CSRF check for the token endpoint
      if (req.path === '/csrf/token') {
        return next();
      }

      // Otherwise apply CSRF protection
      return csrfMiddleware(req, res, next);
    };

    // Apply the middleware to all routes
    consumer.apply(csrfMiddlewareWithExceptions).forRoutes('*');
  }
}
