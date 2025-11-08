import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import { config } from '../config/env.js';
import { userService } from './user.service.js';
import type { User } from '../entities/user.entity.js';

const SESSION_COOKIE_NAME = 'inkweld_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionData {
  userId: string;
  username: string;
  email: string;
  [key: string]: string; // Index signature for JWT compatibility
}

/**
 * Auth service using Hono's signed cookies for session management
 */
class AuthService {
  private readonly secret: string;

  constructor() {
    this.secret = config.session.secret;
    if (!this.secret || this.secret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters for secure cookie signing');
    }
  }

  /**
   * Create a session for a user
   */
  async createSession(c: Context, user: User): Promise<void> {
    const sessionData: SessionData = {
      userId: user.id,
      username: user.username || '',
      email: user.email || '',
    };

    // Create JWT token for the session
    const token = await sign(sessionData, this.secret);

    // Store in signed, httpOnly cookie
    await setSignedCookie(c, SESSION_COOKIE_NAME, token, this.secret, {
      httpOnly: true,
      secure: config.session.secure,
      sameSite: 'Lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }

  /**
   * Get session data from signed cookie
   */
  async getSession(c: Context): Promise<SessionData | null> {
    try {
      const token = await getSignedCookie(c, this.secret, SESSION_COOKIE_NAME);

      if (!token) {
        return null;
      }

      // Verify and decode JWT
      const { decode } = await import('hono/jwt');
      const payload = decode(token);

      if (!payload || !payload.payload) {
        return null;
      }

      const data = payload.payload as SessionData;

      // Validate required fields
      if (!data.userId || !data.username) {
        return null;
      }

      return data;
    } catch (err) {
      console.error('Failed to get session:', err);
      return null;
    }
  }

  /**
   * Destroy session
   */
  destroySession(c: Context): void {
    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: '/',
      secure: config.session.secure,
    });
  }

  /**
   * Authenticate with username and password
   */
  async authenticate(username: string, password: string): Promise<User | null> {
    try {
      const user = await userService.findByUsername(username);
      if (!user) {
        return null;
      }

      const isValid = await userService.validatePassword(user, password);
      if (!isValid) {
        return null;
      }

      return user;
    } catch (err) {
      console.error('Authentication failed:', err);
      return null;
    }
  }

  /**
   * Get user from session
   */
  async getUserFromSession(c: Context): Promise<User | null> {
    const session = await this.getSession(c);
    if (!session) {
      return null;
    }

    try {
      return await userService.findById(session.userId);
    } catch (err) {
      console.error('Failed to get user from session:', err);
      return null;
    }
  }

  /**
   * Require authentication middleware
   */
  requireAuth() {
    return async (c: Context, next: () => Promise<void>) => {
      const user = await this.getUserFromSession(c);
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
