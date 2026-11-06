import type { Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { signingSecret } from '../config/signing-secret';
import { userService } from './user.service';
import { isSessionRevoked } from '../utils/session-validity';
import type { User } from '../db/schema/users';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';
import { ingressSessionMatches } from '../utils/ingress';

const authLog = logger.child('Auth');

const TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds
// Enrolment-only sessions exist solely so a freshly-registered, not-yet-
// approved user (in passwordless mode) can complete the WebAuthn ceremony
// before the dialog closes. 15 minutes is well over the human time needed
// for a biometric prompt and short enough to limit blast radius if a token
// is intercepted. They are NOT renewed and cannot be exchanged for a full
// session — see SessionData.scope below.
const ENROLMENT_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds

/**
 * Session capability scope.
 *
 *   - `'full'`   — issued after a normal login or auto-approved registration.
 *                  Grants every authenticated route subject to canLogin().
 *                  Assumed when the field is absent.
 *   - `'enrol'`  — issued only by `/auth/register` when the user requires
 *                  admin approval AND password login is disabled. The user
 *                  has no other way to attach a credential to the new
 *                  account, so we let them run the WebAuthn registration
 *                  ceremony and ONLY that. requireAuth / requireAdmin /
 *                  every other middleware reject this scope outright.
 */
export type SessionScope = 'full' | 'enrol';

export interface SessionData {
  /** Issued-at (unix seconds). Compared against users.sessionsValidFrom. */
  iat?: number;
  userId: string;
  username: string;
  email: string;
  scope?: SessionScope; // omitted == 'full'
  exp?: number; // JWT expiration timestamp
  [key: string]: string | number | undefined; // Index signature for JWT compatibility
}

export type SessionResult =
  | { status: 'valid'; session: SessionData }
  | { status: 'no-auth' } // No Authorization header present
  | { status: 'invalid-token' } // Token present but invalid/expired
  | { status: 'expired-token' }; // Token present but expired

/** The token from an `Authorization: Bearer <token>` header, or null. */
function bearerToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7) || null; // Remove 'Bearer ' prefix
}

/**
 * Auth service using Hono's signed cookies for session management
 */
class AuthService {
  /**
   * The session signing key for this request: from c.env on Cloudflare Workers
   * (secrets only exist there), from the process environment on Bun/Node.
   * Throws SigningSecretError when there is no usable key (see signingSecret).
   */
  private getSecret(c: Context): string {
    return signingSecret((c as unknown as { env?: unknown }).env);
  }

  /**
   * Create a session for a user and return JWT token
   */
  async createSession(c: Context, user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      userId: user.id,
      username: user.username || '',
      email: '', // Omit actual email from JWT to avoid PII leakage in tokens
      scope: 'full',
      iat: now,
      exp: now + TOKEN_EXPIRY, // JWT expiration (30 days)
    };

    // Create JWT token using request-context secret
    const secret = this.getSecret(c);
    const token = await sign(sessionData, secret, 'HS256');
    return token;
  }

  /**
   * Issue a short-lived enrolment-only token.
   *
   * Used by the registration flow when the user requires admin approval and
   * password login is disabled — they have no credential at all yet, so we
   * give them just enough capability to attach a passkey to the new account
   * before being parked at /approval-pending. The token:
   *
   *   - has scope `'enrol'`, so requireAuth / requireAdmin / optionalAuth
   *     all reject it for normal app usage
   *   - expires in 15 minutes (one biometric prompt's worth of patience)
   *   - is honoured ONLY by the passkey register/start + register/finish
   *     handlers, which look it up explicitly via `authService.getSession`
   *     and check `session.scope === 'enrol'`
   *
   * It deliberately does NOT bypass `canLogin` for any other purpose. An
   * unapproved user with this token cannot list passkeys, cannot delete
   * passkeys, cannot read /me, cannot do anything except enrol exactly one
   * credential and then wait.
   */
  createEnrolmentSession(c: Context, user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      userId: user.id,
      username: user.username || '',
      email: '',
      scope: 'enrol',
      iat: now,
      exp: now + ENROLMENT_TOKEN_EXPIRY,
    };
    const secret = this.getSecret(c);
    return sign(sessionData, secret, 'HS256');
  }

  /**
   * Get session data from Authorization header (Bearer token)
   */
  async getSession(c: Context): Promise<SessionData | null> {
    const token = bearerToken(c);
    if (!token) {
      return null;
    }

    // Outside the try: a server without a usable key answers with an error
    // rather than treating every token as invalid.
    const secret = this.getSecret(c);
    try {
      // Verify and decode JWT using request-context secret
      const payload = await verify(token, secret, 'HS256');

      if (!payload) {
        return null;
      }

      const data = payload as SessionData;

      // Validate required fields
      if (!data.userId || !data.username) {
        return null;
      }

      // Check expiration
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return data;
    } catch (err) {
      authLog.error('Failed to get session', err);
      return null;
    }
  }

  /**
   * Get session data with detailed reason for failure.
   * This is used by endpoints like /user/me that need to distinguish between
   * "no auth" (anonymous user) vs "invalid token" (should clear credentials).
   */
  async getSessionWithReason(c: Context): Promise<SessionResult> {
    const token = bearerToken(c);
    if (!token) {
      return { status: 'no-auth' };
    }

    // Outside the try, as in getSession: a missing key is not an invalid token,
    // and the client must not drop its credentials because of it.
    const secret = this.getSecret(c);
    try {
      let payload;
      try {
        payload = await verify(token, secret, 'HS256');
      } catch {
        // JWT verification failed (invalid signature, malformed, etc.)
        return { status: 'invalid-token' };
      }

      if (!payload) {
        return { status: 'invalid-token' };
      }

      const data = payload as SessionData;

      // Validate required fields
      if (!data.userId || !data.username) {
        return { status: 'invalid-token' };
      }

      // Check expiration
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
        return { status: 'expired-token' };
      }

      return { status: 'valid', session: data };
    } catch (err) {
      authLog.error('Failed to get session', err);
      return { status: 'invalid-token' };
    }
  }

  /**
   * Destroy session (no-op for JWT tokens - client removes token)
   */
  destroySession(_c: Context): void {
    // With JWT tokens, logout is handled client-side by removing the token
  }

  /**
   * Authenticate with username and password
   */
  async authenticate(
    db: DatabaseInstance,
    username: string,
    password: string
  ): Promise<User | null> {
    try {
      const user = await userService.findByUsername(db, username);
      if (!user) {
        return null;
      }

      const isValid = await userService.validatePassword(user, password);
      if (!isValid) {
        return null;
      }

      return user;
    } catch (err) {
      authLog.error('Authentication failed', err);
      return null;
    }
  }

  /**
   * Get user from session
   */
  async getUserFromSession(db: DatabaseInstance, c: Context): Promise<User | null> {
    const session = await this.getSession(c);
    if (!session) {
      return null;
    }

    try {
      const user = (await userService.findById(db, session.userId)) ?? null;
      if (user && isSessionRevoked(user, session)) {
        // Issued before the user's revocation watermark (password reset,
        // passkey recovery, admin disable) — treat exactly like no session.
        return null;
      }
      if (user && !ingressSessionMatches(c, user)) {
        // Another Home Assistant user's session on a shared browser.
        return null;
      }
      return user;
    } catch (err) {
      authLog.error('Failed to get user from session', err);
      return null;
    }
  }

  /**
   * Verify a JWT token directly (without needing the Authorization header).
   * Used for WebSocket authentication where the token is sent over the connection.
   * @param token - The JWT token to verify
   * @param c - Hono context (needed for accessing the secret)
   * @returns SessionData if valid, null otherwise
   */
  async verifyToken(token: string, c: Context): Promise<SessionData | null> {
    if (!token) {
      return null;
    }

    // Outside the try, as in getSession.
    const secret = this.getSecret(c);
    try {
      // Verify and decode JWT using request-context secret
      const payload = await verify(token, secret, 'HS256');

      if (!payload) {
        return null;
      }

      const data = payload as SessionData;

      // Validate required fields
      if (!data.userId || !data.username) {
        return null;
      }

      // Check expiration
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return data;
    } catch (err) {
      authLog.error('Failed to verify token', err);
      return null;
    }
  }

  /**
   * Require authentication middleware
   */
  requireAuth() {
    return async (c: Context, next: () => Promise<void>) => {
      const db = c.get('db');
      if (!db) {
        throw new Error('Database not available in context');
      }

      const user = await this.getUserFromSession(db, c);
      if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      // Check if user is approved and enabled
      if (!userService.canLogin(user)) {
        return c.json({ error: 'Account not approved or disabled' }, 403);
      }

      // Store user in context for downstream handlers
      c.set('user', user);
      c.set('session', {
        userId: user.id,
        username: user.username || '',
        email: user.email || '',
      });

      await next();
    };
  }
}

export const authService = new AuthService();
