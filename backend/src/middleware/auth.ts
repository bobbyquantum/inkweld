import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { getDb, type AppContext } from './database.middleware.js';

export const requireAuth = async (c: Context<AppContext>, next: Next) => {
  console.log('[requireAuth] Checking session...');
  console.log('[requireAuth] Cookie header:', c.req.header('cookie'));

  const db = getDb(c);
  const user = await authService.getUserFromSession(db, c);

  console.log('[requireAuth] User from session:', user ? user.username : 'null');

  if (!user) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  // Check if user is approved and enabled
  if (!userService.canLogin(user)) {
    throw new HTTPException(403, { message: 'Account not approved or disabled' });
  }

  // Set user in context for downstream handlers
  c.set('user', user);
  await next();
};

export const optionalAuth = async (c: Context<AppContext>, next: Next) => {
  const db = getDb(c);
  const user = await authService.getUserFromSession(db, c);
  if (user && userService.canLogin(user)) {
    c.set('user', user);
  }
  await next();
};
