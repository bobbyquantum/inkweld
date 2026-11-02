import { Hono } from 'hono';
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

function callbackRedirect(baseUrl: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${baseUrl}/oauth/callback?${query.toString()}`;
}

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
      return c.redirect(authorizationUrl.toString());
    } catch (error) {
      log.error('Failed to start OIDC authorization:', error);
      return c.json({ error: 'OpenID Connect is not properly configured' }, 500);
    }
  }

  const state = c.req.query('state');
  if (!state) {
    return c.redirect(callbackRedirect(baseUrl, { error: 'oidc_auth_failed', provider: 'oidc' }));
  }

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
      if (!user) throw error;
    }

    const countAfterSignIn = await userService.countUsers(db);
    const oidcOnly = await configService.getBoolean(db, 'OIDC_ONLY');
    if (oidcOnly) {
      await userService.setUserAdminIfNoneExists(db, user.id);
    } else if (countAfterSignIn === 1) {
      await userService.setUserAdmin(db, user.id, true);
    }
    if (countAfterSignIn === 1) {
      await userService.approveUser(db, user.id);
    } else if (!user.approved && user.rejectedAt === null && !userApprovalRequired) {
      await userService.approveUser(db, user.id);
    }

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
