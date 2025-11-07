import { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const req = c.req.raw as any;
  const session = req.session;

  if (!session?.passport?.user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  c.set('user', session.passport.user);
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const req = c.req.raw as any;
  const session = req.session;
  const user = session?.passport?.user;

  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  if (!user.isAdmin) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }

  c.set('user', user);
  await next();
};

export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const req = c.req.raw as any;
  const session = req.session;

  if (session?.passport?.user) {
    c.set('user', session.passport.user);
  }

  await next();
};
