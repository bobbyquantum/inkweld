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

    // Create a complete mock response object that express-session can work with
    let setCookieHeader: string | undefined;
    const headerListeners: Array<() => void> = [];

    const res = {
      // Header management
      getHeader: (name: string) => {
        if (name.toLowerCase() === 'set-cookie') {
          return setCookieHeader;
        }
        return undefined;
      },
      setHeader: (name: string, value: string) => {
        console.log(`Session middleware setHeader: ${name} = ${value.substring(0, 50)}...`);
        if (name.toLowerCase() === 'set-cookie') {
          setCookieHeader = value;
        }
        return res;
      },
      removeHeader: () => res,

      // Response lifecycle methods that on-headers uses
      writeHead: (..._args: unknown[]) => {
        // Call header listeners before writing head
        headerListeners.forEach((fn) => fn());
        return res;
      },
      end: (..._args: unknown[]) => {
        // Call header listeners before ending
        headerListeners.forEach((fn) => fn());
        return res;
      },
      write: () => res,

      // Allow on-headers to register listeners
      on: (event: string, listener: () => void) => {
        if (event === 'header' || event === 'finish') {
          headerListeners.push(listener);
        }
        return res;
      },
      once: (event: string, listener: () => void) => {
        if (event === 'header' || event === 'finish') {
          headerListeners.push(listener);
        }
        return res;
      },
      emit: () => true,

      // Status tracking
      statusCode: 200,
      headersSent: false,
      finished: false,
    };

    // Initialize session
    await new Promise<void>((resolve, reject) => {
      middleware(req, res as unknown, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('Session initialized:', {
      id: req.session?.id,
      hasPassport: !!req.session?.passport,
      hasListeners: headerListeners.length,
    });

    // Process the request
    await next();

    console.log('After request, session state:', {
      id: req.session?.id,
      hasPassport: !!req.session?.passport,
      modified: req.session?.cookie?.expires,
    });

    // Manually trigger header listeners to force cookie setting
    console.log(`Triggering ${headerListeners.length} header listeners`);
    headerListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('Error in header listener:', err);
      }
    });

    // Forward Set-Cookie header if it was set
    console.log('Final setCookieHeader:', setCookieHeader?.substring(0, 100));
    if (setCookieHeader) {
      c.header('Set-Cookie', setCookieHeader);
    }
  };
}
