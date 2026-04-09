import { Hono } from 'hono';
import { githubAuth } from '@hono/oauth-providers/github';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { configService } from '../services/config.service';
import { getBaseUrl } from '../services/url.service';
import type { AppContext } from '../types/context';
import { logger } from '../services/logger.service';

const log = logger.child('GitHubAuth');

const githubAuthRoutes = new Hono<AppContext>();

/**
 * One-time authorization codes for secure token exchange.
 * Instead of passing the JWT in a query parameter (which leaks in browser history,
 * Referer headers, and server logs), we pass a short-lived opaque code that the
 * frontend exchanges for the JWT via a POST request.
 */
const pendingCodes = new Map<string, { token: string; expiresAt: number }>();
const CODE_TTL_MS = 60_000; // 60 seconds

function generateAuthCode(token: string): string {
  const code = crypto.randomUUID();
  pendingCodes.set(code, { token, expiresAt: Date.now() + CODE_TTL_MS });

  // Lazy cleanup of expired codes
  if (pendingCodes.size > 100) {
    const now = Date.now();
    for (const [key, value] of pendingCodes) {
      if (value.expiresAt <= now) pendingCodes.delete(key);
    }
  }

  return code;
}

function consumeAuthCode(code: string): string | null {
  const entry = pendingCodes.get(code);
  if (!entry) return null;
  pendingCodes.delete(code);
  if (entry.expiresAt <= Date.now()) return null;
  return entry.token;
}

/**
 * GET /github
 *
 * Initiates or completes the GitHub OAuth flow using @hono/oauth-providers.
 *
 * Flow:
 * 1. First request (no code param): Redirects the user to GitHub's authorization page
 * 2. GitHub redirects back with ?code=...&state=...
 * 3. The middleware exchanges the code for an access token and fetches user info
 * 4. Our handler creates/updates the user and redirects to the frontend with a JWT token
 */
githubAuthRoutes.get(
  '/github',
  async (c, next) => {
    const db = c.get('db');

    // Check if GitHub OAuth is enabled (from DB config, falling back to env)
    const githubEnabled = await configService.getBoolean(db, 'GITHUB_ENABLED');
    if (!githubEnabled) {
      return c.json({ error: 'GitHub OAuth is not enabled' }, 403);
    }

    // Read credentials from DB config (falls back to env vars automatically)
    const clientIdConfig = await configService.get(db, 'GITHUB_CLIENT_ID');
    const clientSecretConfig = await configService.get(db, 'GITHUB_CLIENT_SECRET');

    const clientId = clientIdConfig.value;
    const clientSecret = clientSecretConfig.value;

    if (!clientId || !clientSecret) {
      log.error('GitHub OAuth credentials not configured');
      return c.json({ error: 'GitHub OAuth is not properly configured' }, 500);
    }

    // Determine the redirect URI (callback URL) from DB config, env, or headers
    const callbackUrlConfig = await configService.get(db, 'GITHUB_CALLBACK_URL');
    const callbackUrl =
      (callbackUrlConfig.source !== 'default' && callbackUrlConfig.value) ||
      `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}/api/v1/auth/github`;

    // Apply the GitHub OAuth middleware dynamically with DB-sourced credentials
    const middleware = githubAuth({
      client_id: clientId,
      client_secret: clientSecret,
      scope: ['read:user', 'user:email'],
      oauthApp: true,
      redirect_uri: callbackUrl,
    });

    return middleware(c, next);
  },
  async (c) => {
    // This handler runs after the OAuth middleware has completed the token exchange
    const db = c.get('db');
    const githubUser = c.get('user-github');
    const baseUrl = await getBaseUrl(db);

    if (!githubUser?.id) {
      log.error('GitHub OAuth callback: no user data received');
      return c.redirect(`${baseUrl}/?error=github_auth_failed`);
    }

    log.info(`GitHub OAuth callback for user: ${githubUser.login} (ID: ${githubUser.id})`);

    try {
      // Check user approval setting
      const userApprovalRequired = await configService.getBoolean(db, 'USER_APPROVAL_REQUIRED');

      // Create or update the GitHub user in our database
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: String(githubUser.id),
        username: githubUser.login || `github-${githubUser.id}`,
        email: githubUser.email || '',
        name: githubUser.name || githubUser.login || '',
      });

      // Check if this is the first user — auto-approve and make admin
      const userCount = await userService.countUsers(db);
      if (userCount === 1) {
        // This is the only user, make them admin and approve
        await userService.setUserAdmin(db, user.id, true);
        await userService.approveUser(db, user.id);
      } else if (!user.approved && !userApprovalRequired) {
        // Auto-approve if approval is not required
        await userService.approveUser(db, user.id);
      }

      // Re-fetch user to get updated approval/admin status
      const updatedUser = (await userService.findById(db, user.id)) ?? user;

      // Check if user can log in
      if (!userService.canLogin(updatedUser)) {
        if (!updatedUser.enabled) {
          log.warn(`GitHub user ${githubUser.login} account is disabled`);
          return c.redirect(`${baseUrl}/?error=account_disabled`);
        }
        if (!updatedUser.approved) {
          log.info(`GitHub user ${githubUser.login} requires approval`);
          return c.redirect(`${baseUrl}/approval-pending`);
        }
      }

      // Create JWT session
      const token = await authService.createSession(c, updatedUser);

      // Generate a one-time authorization code (avoids leaking JWT in URL)
      const code = generateAuthCode(token);

      // Redirect to frontend with the opaque code
      return c.redirect(`${baseUrl}/oauth/callback?code=${encodeURIComponent(code)}`);
    } catch (error) {
      log.error('GitHub OAuth user creation failed:', error);
      return c.redirect(`${baseUrl}/?error=github_auth_failed`);
    }
  }
);

/**
 * POST /exchange-code
 *
 * Exchanges a one-time authorization code for a JWT token.
 * The code is generated during the OAuth callback and is valid for 60 seconds.
 */
githubAuthRoutes.post('/exchange-code', async (c) => {
  const body = await c.req.json<{ code?: string }>().catch(() => ({}) as { code?: string });
  const code = body.code;

  if (!code || typeof code !== 'string') {
    return c.json({ error: 'Authorization code is required' }, 400);
  }

  const token = consumeAuthCode(code);
  if (!token) {
    return c.json({ error: 'Invalid or expired authorization code' }, 401);
  }

  return c.json({ token });
});

export default githubAuthRoutes;
