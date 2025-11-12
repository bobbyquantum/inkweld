import type { Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { config } from '../config/env.js';
import { userService } from './user.service.js';
import type { User } from '../db/schema/users.js';
import type { DatabaseInstance } from '../middleware/database.middleware.js';

const TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionData {
  userId: string;
  username: string;
  email: string;
  exp?: number; // JWT expiration timestamp
  [key: string]: string | number | undefined; // Index signature for JWT compatibility
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

    // Create JWT token
    const token = await sign(sessionData, this.secret);
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

      // Verify and decode JWT
      const payload = await verify(token, this.secret);

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
      console.error('Failed to get session:', err);
      return null;
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
      console.error('Authentication failed:', err);
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
      return await userService.findById(db, session.userId);
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
