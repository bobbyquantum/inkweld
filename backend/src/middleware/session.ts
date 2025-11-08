import { MiddlewareHandler } from 'hono';
import session from 'express-session';
import { config } from '../config/env';
import { getDataSource } from '../config/database';
import { UserSession } from '../entities/session.entity';
import { TypeormStore } from 'connect-typeorm';

let sessionMiddleware: any = null;

function getSessionMiddleware() {
  if (!sessionMiddleware) {
    // Lazy initialization - only when actually needed (not during import)
    const dataSource = getDataSource();
    const sessionRepository = dataSource.getRepository(UserSession);

    sessionMiddleware = session({
      store: new TypeormStore({
        cleanupLimit: 2,
        ttl: config.session.maxAge / 1000,
      }).connect(sessionRepository),
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.session.secure,
        maxAge: config.session.maxAge,
        sameSite: 'lax',
        domain: config.session.domain,
      },
    });
  }
  return sessionMiddleware;
}

export function setupSession(): MiddlewareHandler {
  return async (c, next) => {
    // Get session middleware on first request, not during setup
    const middleware = getSessionMiddleware();
    const req = c.req.raw as any;
    const res = {
      getHeader: () => undefined,
      setHeader: () => {},
      end: () => {},
    };

    await new Promise<void>((resolve, reject) => {
      middleware(req, res as any, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await next();
  };
}
