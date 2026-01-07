import type { Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { config } from '../config/env';
import { userService } from './user.service';
import type { User } from '../db/schema/users';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';

const authLog = logger.child('Auth');

const TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionData {
  userId: string;
  username: string;
  email: string;
  exp?: number; // JWT expiration timestamp
  [key: string]: string | number | undefined; // Index signature for JWT compatibility
}

export type SessionResult =
  | { status: 'valid'; session: SessionData }
  | { status: 'no-auth' } // No Authorization header present
  | { status: 'invalid-token' } // Token present but invalid/expired
  | { status: 'expired-token' }; // Token present but expired

/**
 * Auth service using Hono's signed cookies for session management
 */
class AuthService {
  /**
   * Get the session secret from request context (for Workers) or config (for Bun/Node)
   * In Cloudflare Workers, env vars are only available via c.env, not process.env
   */
  private getSecret(c: Context): string {
    // Try to get from request context first (Cloudflare Workers)
    // In Hono Workers, c.env is the raw Cloudflare env bindings object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (c as any).env;
    // Support both DATABASE_KEY (new) and SESSION_SECRET (legacy)
    const envSecret =
      env && typeof env.DATABASE_KEY === 'string'
        ? env.DATABASE_KEY
        : env && typeof env.SESSION_SECRET === 'string'
          ? env.SESSION_SECRET
          : undefined;

    if (envSecret && envSecret.length >= 32) {
      return envSecret;
    }

    // Fall back to config (Bun/Node.js with process.env)
    const configSecret = config.databaseKey;
    if (!configSecret || configSecret.length < 32) {
      throw new Error('DATABASE_KEY must be at least 32 characters for secure cookie signing');
    }
    return configSecret;
  }

  /**
   * Create a session for a user and return JWT token
   */
  async createSession(c: Context, user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      userId: user.id,
      username: user.username || '',
      email: user.email || '',
      exp: now + TOKEN_EXPIRY, // JWT expiration (30 days)
    };

    // Create JWT token using request-context secret
    const secret = this.getSecret(c);
    const token = await sign(sessionData, secret);
    return token;
  }

  /**
   * Get session data from Authorization header (Bearer token)
   */
  async getSession(c: Context): Promise<SessionData | null> {
    try {
      const authHeader = c.req.header('Authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (!token) {
        return null;
      }

      // Verify and decode JWT using request-context secret
      const secret = this.getSecret(c);
      const payload = await verify(token, secret);

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
    try {
      const authHeader = c.req.header('Authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { status: 'no-auth' };
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (!token) {
        return { status: 'no-auth' };
      }

      // Verify and decode JWT using request-context secret
      const secret = this.getSecret(c);
      let payload;
      try {
        payload = await verify(token, secret);
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
    // No server-side state to clean up
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
      return (await userService.findById(db, session.userId)) ?? null;
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
    try {
      if (!token) {
        return null;
      }

      // Verify and decode JWT using request-context secret
      const secret = this.getSecret(c);
      const payload = await verify(token, secret);

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
