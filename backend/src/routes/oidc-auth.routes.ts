import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { RESERVED_USERNAMES } from '../schemas/auth.schemas';
import { authService } from '../services/auth.service';
import { configService } from '../services/config.service';
import { getBaseUrl } from '../services/url.service';
import { logger } from '../services/logger.service';
import { oauthLoginCodeService } from '../services/oauth-login-code.service';
import { oidcAuthService } from '../services/oidc-auth.service';
import { userService } from '../services/user.service';
import type { AppContext } from '../types/context';

const log = logger.child('OIDCAuth');
const oidcAuthRoutes = new Hono<AppContext>();
const STATE_COOKIE = 'inkweld_oidc_state';

function callbackRedirect(baseUrl: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${baseUrl}/oauth/callback?${query.toString()}`;
}

/** Normalize provider profile data into a non-reserved local username stem. */
function usernameBase(value: string): string {
  const username = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32);
  if (username.length >= 3 && !(RESERVED_USERNAMES as readonly string[]).includes(username)) {
    return username;
  }
  return 'oidc-user';
}

/** Prefer a short deterministic suffix; insertion still handles concurrent collisions. */
async function availableUsername(db: AppContext['Variables']['db'], base: string): Promise<string> {
  // Sequential checks ensure the lowest available suffix is selected.
  for (let suffix = 0; suffix < 100; suffix++) {
    const tail = suffix === 0 ? '' : `-${suffix + 1}`;
    const username = `${base.slice(0, 32 - tail.length)}${tail}`;
    if (!(await userService.findByUsername(db, username))) return username;
  }
  return `${base.slice(0, 20)}-${crypto.randomUUID().slice(0, 8)}`;
}

oidcAuthRoutes.get('/oidc', async (c) => {
  const db = c.get('db');
  const [enabled, oidcOnly] = await Promise.all([
    configService.getBoolean(db, 'OIDC_ENABLED'),
    configService.getBoolean(db, 'OIDC_ONLY'),
  ]);
  if (!enabled && !oidcOnly) {
    return c.json({ error: 'OpenID Connect sign-in is not enabled' }, 403);
  }

  const baseUrl = await getBaseUrl(db);
  const providerError = c.req.query('error');
  if (providerError) {
    return c.redirect(callbackRedirect(baseUrl, { error: 'oidc_auth_failed', provider: 'oidc' }));
  }

  const code = c.req.query('code');
  if (!code) {
    try {
      const authorizationUrl = await oidcAuthService.createAuthorizationUrl(db);
      setCookie(c, STATE_COOKIE, authorizationUrl.searchParams.get('state')!, {
        httpOnly: true,
        secure: new URL(authorizationUrl.searchParams.get('redirect_uri')!).protocol === 'https:',
        sameSite: 'Lax',
        path: '/',
        maxAge: 10 * 60,
      });
      return c.redirect(authorizationUrl.toString());
    } catch (error) {
      log.error('Failed to start OIDC authorization:', error);
      return c.json({ error: 'OpenID Connect is not properly configured' }, 500);
    }
  }

  const state = c.req.query('state');
  if (!state || getCookie(c, STATE_COOKIE) !== state) {
    log.warn('Rejected OIDC callback without a matching browser transaction');
    return c.redirect(callbackRedirect(baseUrl, { error: 'oidc_auth_failed', provider: 'oidc' }));
  }
  deleteCookie(c, STATE_COOKIE, { path: '/' });

  try {
    const { issuer, claims } = await oidcAuthService.completeAuthorization(
      db,
      state,
      new URL(c.req.url)
    );
    const verifiedEmail =
      typeof claims.email === 'string' && claims.email_verified === true ? claims.email : undefined;
    const providerUsername =
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      verifiedEmail?.split('@')[0] ||
      (typeof claims.name === 'string' && claims.name) ||
      `oidc-${claims.sub.slice(0, 12)}`;
    const username = await availableUsername(db, usernameBase(providerUsername));
    const name =
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      username;
    const userCount = await userService.countUsers(db);
    const userApprovalRequired = await configService.getBoolean(db, 'USER_APPROVAL_REQUIRED');

    let user;
    try {
      user = await userService.createOrUpdateOidcUser(
        db,
        {
          issuer,
          subject: claims.sub,
          username,
          email: verifiedEmail,
          emailVerified: verifiedEmail !== undefined,
          name,
        },
        { autoApprove: userCount === 0 || !userApprovalRequired }
      );
    } catch (error) {
      // Parallel first sign-ins can race on the issuer/subject unique index.
      user = await userService.findByOidcIdentity(db, issuer, claims.sub);
      if (!user) {
        let cause: unknown = error;
        // Drizzle wraps SQLite/D1 constraint errors in a query error.
        while (cause instanceof Error && cause.cause instanceof Error) cause = cause.cause;
        if (
          !(cause instanceof Error) ||
          !cause.message.includes('UNIQUE constraint failed: users.username')
        ) {
          throw error;
        }
        log.info('Retrying OIDC account creation after a concurrent username collision');
        user = await userService.createOrUpdateOidcUser(
          db,
          {
            issuer,
            subject: claims.sub,
            username: `${username.slice(0, 20)}-${crypto.randomUUID().slice(0, 8)}`,
            email: verifiedEmail,
            emailVerified: verifiedEmail !== undefined,
            name,
          },
          { autoApprove: userCount === 0 || !userApprovalRequired }
        );
      }
    }

    if (!user.approved && user.rejectedAt === null && !userApprovalRequired) {
      await userService.approveUser(db, user.id);
    }
    await userService.setUserAdminIfNoneExists(db, user.id);

    const updatedUser = (await userService.findById(db, user.id)) ?? user;
    if (!userService.canLogin(updatedUser)) {
      if (!updatedUser.enabled) {
        return c.redirect(
          callbackRedirect(baseUrl, { error: 'account_disabled', provider: 'oidc' })
        );
      }
      if (updatedUser.rejectedAt !== null) {
        return c.redirect(`${baseUrl}/approval-pending?status=rejected`);
      }
      return c.redirect(`${baseUrl}/approval-pending`);
    }

    const loginCode = await oauthLoginCodeService.issue(db, updatedUser.id, 'oidc');
    return c.redirect(callbackRedirect(baseUrl, { code: loginCode, provider: 'oidc' }));
  } catch (error) {
    log.error('OIDC sign-in failed:', error);
    return c.redirect(callbackRedirect(baseUrl, { error: 'oidc_auth_failed', provider: 'oidc' }));
  }
});

oidcAuthRoutes.post('/oidc/exchange-code', async (c) => {
  const body = await c.req.json<{ code?: string }>().catch((): { code?: string } => ({}));
  const code = body.code;
  if (typeof code !== 'string' || !code) {
    return c.json({ error: 'Authorization code is required' }, 400);
  }

  const db = c.get('db');
  const userId = await oauthLoginCodeService.redeem(db, code, 'oidc');
  if (!userId) {
    return c.json({ error: 'Invalid or expired authorization code' }, 401);
  }

  const user = await userService.findById(db, userId);
  if (!user || !userService.canLogin(user)) {
    return c.json({ error: 'Invalid or expired authorization code' }, 401);
  }

  const token = await authService.createSession(c, user);
  return c.json({ token });
});

export default oidcAuthRoutes;
