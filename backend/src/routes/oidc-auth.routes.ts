import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { IDToken } from 'openid-client';
import { RESERVED_USERNAMES } from '../schemas/auth.schemas';
import { authService } from '../services/auth.service';
import { configService } from '../services/config.service';
import { getBaseUrl } from '../services/url.service';
import { logger } from '../services/logger.service';
import { oauthLoginCodeService } from '../services/oauth-login-code.service';
import { oidcAuthService } from '../services/oidc-auth.service';
import { userService } from '../services/user.service';
import { trimCharacters } from '../utils/string-utils';
import type { AppContext, DatabaseInstance } from '../types/context';

const log = logger.child('OIDCAuth');
const oidcAuthRoutes = new Hono<AppContext>();
const STATE_COOKIE = 'inkweld_oidc_state';

type OidcIdentity = Parameters<typeof userService.createOrUpdateOidcUser>[1];

function callbackRedirect(baseUrl: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${baseUrl}/oauth/callback?${query.toString()}`;
}

function failedSignInRedirect(baseUrl: string): string {
  return callbackRedirect(baseUrl, { error: 'oidc_auth_failed', provider: 'oidc' });
}

/** Normalize provider profile data into a non-reserved local username stem. */
function usernameBase(value: string): string {
  const separated = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, '-')
    .replaceAll(/-{2,}/g, '-');
  const username = trimCharacters(separated, '-_').slice(0, 32);
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

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Map the ID token to the account details; only a verified email is kept. */
async function oidcIdentity(
  db: DatabaseInstance,
  issuer: string,
  claims: IDToken
): Promise<OidcIdentity> {
  const email = claims.email_verified === true ? stringClaim(claims.email) : undefined;
  const preferredUsername = stringClaim(claims.preferred_username);
  const displayName = stringClaim(claims.name);
  const providerUsername =
    preferredUsername || email?.split('@')[0] || displayName || `oidc-${claims.sub.slice(0, 12)}`;
  const username = await availableUsername(db, usernameBase(providerUsername));
  return {
    issuer,
    subject: claims.sub,
    username,
    email,
    emailVerified: email !== undefined,
    name: displayName || preferredUsername || username,
  };
}

/** Whether an account could not be created because another sign-in took its username. */
function isUsernameCollision(error: unknown): boolean {
  let cause = error;
  // Drizzle wraps SQLite/D1 constraint errors in a query error.
  while (cause instanceof Error && cause.cause instanceof Error) cause = cause.cause;
  return (
    cause instanceof Error && cause.message.includes('UNIQUE constraint failed: users.username')
  );
}

async function resolveOidcUser(
  db: DatabaseInstance,
  identity: OidcIdentity,
  options: { autoApprove: boolean }
) {
  try {
    return await userService.createOrUpdateOidcUser(db, identity, options);
  } catch (error) {
    // Parallel first sign-ins can race on the issuer/subject unique index.
    const existing = await userService.findByOidcIdentity(db, identity.issuer, identity.subject);
    if (existing) return existing;
    if (!isUsernameCollision(error)) throw error;
    log.info('Retrying OIDC account creation after a concurrent username collision');
    const username = `${identity.username.slice(0, 20)}-${crypto.randomUUID().slice(0, 8)}`;
    return await userService.createOrUpdateOidcUser(db, { ...identity, username }, options);
  }
}

/** Finish a validated callback and return where to send the browser next. */
async function finishSignIn(
  db: DatabaseInstance,
  baseUrl: string,
  state: string,
  responseUrl: URL
): Promise<string> {
  const { issuer, claims } = await oidcAuthService.completeAuthorization(db, state, responseUrl);
  const identity = await oidcIdentity(db, issuer, claims);
  const userCount = await userService.countUsers(db);
  const userApprovalRequired = await configService.getBoolean(db, 'USER_APPROVAL_REQUIRED');
  const user = await resolveOidcUser(db, identity, {
    autoApprove: userCount === 0 || !userApprovalRequired,
  });

  if (!user.approved && user.rejectedAt === null && !userApprovalRequired) {
    await userService.approveUser(db, user.id);
  }
  // Only a fresh instance elects an admin, as the other sign-up paths do. An
  // instance that lost its last admin must not hand the role to the next sign-in.
  if (userCount === 0) await userService.setUserAdminIfNoneExists(db, user.id);

  const updatedUser = (await userService.findById(db, user.id)) ?? user;
  if (userService.canLogin(updatedUser)) {
    const loginCode = await oauthLoginCodeService.issue(db, updatedUser.id, 'oidc');
    return callbackRedirect(baseUrl, { code: loginCode, provider: 'oidc' });
  }
  if (!updatedUser.enabled) {
    return callbackRedirect(baseUrl, { error: 'account_disabled', provider: 'oidc' });
  }
  if (updatedUser.rejectedAt !== null) return `${baseUrl}/approval-pending?status=rejected`;
  return `${baseUrl}/approval-pending`;
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
  if (c.req.query('error')) return c.redirect(failedSignInRedirect(baseUrl));

  if (!c.req.query('code')) {
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
    return c.redirect(failedSignInRedirect(baseUrl));
  }
  deleteCookie(c, STATE_COOKIE, { path: '/' });

  try {
    return c.redirect(await finishSignIn(db, baseUrl, state, new URL(c.req.url)));
  } catch (error) {
    log.error('OIDC sign-in failed:', error);
    return c.redirect(failedSignInRedirect(baseUrl));
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
