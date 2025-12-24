import { Context, Next } from 'hono';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { type AppContext } from '../types/context';
import { UnauthorizedError, ForbiddenError } from '../errors';

export const requireAuth = async (c: Context<AppContext>, next: Next) => {
  const db = c.get('db');
  const user = await authService.getUserFromSession(db, c);

  if (!user) {
    throw new UnauthorizedError();
  }

  // Check if user is approved and enabled
  if (!userService.canLogin(user)) {
    throw new ForbiddenError('Account not approved or disabled');
  }

  // Set user in context for downstream handlers
  c.set('user', user);
  await next();
};

export const requireAdmin = async (c: Context<AppContext>, next: Next) => {
  const db = c.get('db');
  const user = await authService.getUserFromSession(db, c);

  if (!user) {
    throw new UnauthorizedError();
  }

  // Check if user is approved and enabled
  if (!userService.canLogin(user)) {
    throw new ForbiddenError('Account not approved or disabled');
  }

  // Check if user is admin
  if (!user.isAdmin) {
    throw new ForbiddenError('Admin access required');
  }

  // Set user in context for downstream handlers
  c.set('user', user);
  await next();
};

export const optionalAuth = async (c: Context<AppContext>, next: Next) => {
  const db = c.get('db');
  const user = await authService.getUserFromSession(db, c);
  if (user && userService.canLogin(user)) {
    c.set('user', user);
  }
  await next();
};
