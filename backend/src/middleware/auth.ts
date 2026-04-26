import { type Context, type Next } from 'hono';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { type AppContext } from '../types/context';
import { UnauthorizedError, ForbiddenError } from '../errors';

/**
 * Reject enrolment-scoped tokens. They exist only so a freshly-registered
 * user can complete a WebAuthn ceremony — see authService.createEnrolmentSession.
 * Every other middleware in the app must refuse them outright.
 */
async function rejectEnrolmentScope(c: Context<AppContext>): Promise<void> {
  const session = await authService.getSession(c);
  if (session?.scope === 'enrol') {
    throw new ForbiddenError(
      'Enrolment-scoped session cannot be used for general access. ' +
        'Complete passkey enrolment, wait for admin approval, then log in.'
    );
  }
}

export const requireAuth = async (c: Context<AppContext>, next: Next) => {
  await rejectEnrolmentScope(c);
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
  await rejectEnrolmentScope(c);
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
  // Enrolment-scoped tokens are NOT silently treated as anonymous here —
  // doing so would let the passkey register handlers see them as "no user"
  // and reject the call. Instead we deliberately let the passkey routes
  // resolve the enrolment-scoped session via getSession() themselves;
  // optionalAuth only attaches a user for full-scope tokens belonging to
  // approved+enabled accounts.
  const db = c.get('db');
  const session = await authService.getSession(c);
  if (!session || session.scope === 'enrol') {
    await next();
    return;
  }
  const user = await authService.getUserFromSession(db, c);
  if (user && userService.canLogin(user)) {
    c.set('user', user);
  }
  await next();
};
