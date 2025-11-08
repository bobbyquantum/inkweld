import { Store } from 'express-session';
import { getDatabase } from '../db';
import { userSessions, UserSession, InsertUserSession } from '../db/schema';
import { eq } from 'drizzle-orm';

export class DrizzleSessionStore extends Store {
  private ttl: number;

  constructor(options: { ttl?: number } = {}) {
    super();
    this.ttl = options.ttl || 86400; // Default 24 hours
  }

  /**
   * Get session by ID
   */
  async get(
    sid: string,
    callback: (err?: any, session?: Express.SessionData | null) => void
  ): Promise<void> {
    try {
      const db = getDatabase();
      const result = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sid))
        .limit(1);

      if (!result || result.length === 0) {
        return callback(null, null);
      }

      const session = result[0];
      
      // Check if expired
      if (session.expiredAt < Date.now()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, session.data as Express.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Set/update session
   */
  async set(
    sid: string,
    session: Express.SessionData,
    callback?: (err?: any) => void
  ): Promise<void> {
    try {
      const db = getDatabase();
      const expiredAt = Date.now() + this.ttl * 1000;
      const now = Date.now();

      // Try to update first
      const existing = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sid))
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing session
        await db
          .update(userSessions)
          .set({
            data: session as any,
            expiredAt,
            updatedAt: now,
          })
          .where(eq(userSessions.id, sid));
      } else {
        // Insert new session
        const newSession: InsertUserSession = {
          id: sid,
          data: session as any,
          expiredAt,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(userSessions).values(newSession);
      }

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  /**
   * Destroy session
   */
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      const db = getDatabase();
      await db.delete(userSessions).where(eq(userSessions.id, sid));
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  /**
   * Touch session to update expiration
   */
  async touch(
    sid: string,
    session: Express.SessionData,
    callback?: (err?: any) => void
  ): Promise<void> {
    try {
      const db = getDatabase();
      const expiredAt = Date.now() + this.ttl * 1000;
      
      await db
        .update(userSessions)
        .set({
          expiredAt,
          updatedAt: Date.now(),
        })
        .where(eq(userSessions.id, sid));

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  /**
   * Get all sessions (optional, for admin purposes)
   */
  async all(callback: (err?: any, obj?: { [sid: string]: Express.SessionData } | null) => void): Promise<void> {
    try {
      const db = getDatabase();
      const now = Date.now();
      
      const sessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.expiredAt, now)); // This should be gt() not eq()

      const result: { [sid: string]: Express.SessionData } = {};
      sessions.forEach((session) => {
        if (session.data) {
          result[session.id] = session.data as Express.SessionData;
        }
      });

      callback(null, result);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Get count of all sessions (optional)
   */
  async length(callback: (err?: any, length?: number) => void): Promise<void> {
    try {
      const db = getDatabase();
      const sessions = await db.select().from(userSessions);
      callback(null, sessions.length);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Clear all sessions (optional)
   */
  async clear(callback?: (err?: any) => void): Promise<void> {
    try {
      const db = getDatabase();
      await db.delete(userSessions);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }
}
