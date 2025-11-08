import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext, User } from '../types/context.js';

interface SessionData {
  session?: {
    passport?: {
      user?: User;
    };
  };
}

export const requireAuth = async (c: Context<AppContext>, next: Next) => {
  const req = c.req.raw as unknown as SessionData;
  if (!req.session?.passport?.user) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  // Set user in context for downstream handlers
  c.set('user', req.session.passport.user);
  await next();
};

export const requireAdmin = async (c: Context<AppContext>, next: Next) => {
  const req = c.req.raw as unknown as SessionData;
  const user = req.session?.passport?.user;

  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  if (!user.isAdmin) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }

  c.set('user', user);
  await next();
};

export const optionalAuth = async (c: Context<AppContext>, next: Next) => {
  const req = c.req.raw as unknown as SessionData;
  const user = req.session?.passport?.user;

  if (user) {
    c.set('user', user);
  }

  await next();
};
