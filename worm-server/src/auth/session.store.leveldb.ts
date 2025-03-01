import { Injectable, Logger } from '@nestjs/common';
import { Store } from 'express-session';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

interface SessionStoreOptions {
  /**
   * Session expiration time in milliseconds
   * Default is 30 days
   */
  expiration?: number;
}

@Injectable()
export class LevelDBSessionStore extends Store {
  private logger = new Logger(LevelDBSessionStore.name);
  private readonly defaultExpiration: number;
  private readonly db: Promise<any>;

  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    options: SessionStoreOptions = {},
  ) {
    super();
    this.defaultExpiration = options.expiration || 30 * 24 * 60 * 60 * 1000; // 30 days
    this.db = this.levelDBManager.getSystemDatabase('sessions');
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const db = await this.db;
      const sessionData = await db.get(sid).catch((err: any) => {
        if (err.code === 'LEVEL_NOT_FOUND') {
          return null;
        }
        throw err;
      });

      if (!sessionData) {
        return callback(null, null);
      }

      const session = JSON.parse(sessionData);

      // Check if session has expired
      if (Date.now() > session.expiredAt) {
        // Automatically destroy expired session
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, session.data);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      // Use session's cookie expiration if available, otherwise use default
      const expiredAt = session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.defaultExpiration;

      const sessionData = {
        id: sid,
        data: session,
        expiredAt: expiredAt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const db = await this.db;
      await db.put(sid, JSON.stringify(sessionData));

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      const db = await this.db;
      await db.del(sid).catch((err: any) => {
        if (err.code === 'LEVEL_NOT_FOUND') {
          return;
        }
        throw err;
      });

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async touch(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      const db = await this.db;

      // Get the current session
      const sessionData = await db.get(sid).catch((err: any) => {
        if (err.code === 'LEVEL_NOT_FOUND') {
          return null;
        }
        throw err;
      });

      if (!sessionData) {
        if (callback) callback(null);
        return;
      }

      // Parse the session data
      const parsedSession = JSON.parse(sessionData);

      // Extend session expiration
      const expiredAt = session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.defaultExpiration;

      // Update the session
      parsedSession.expiredAt = expiredAt;
      parsedSession.updatedAt = Date.now();

      // Save the updated session
      await db.put(sid, JSON.stringify(parsedSession));

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  // Optional method to clean up expired sessions
  async clearExpiredSessions(): Promise<void> {
    const db = await this.db;
    const now = Date.now();

    // Iterate through all sessions
    for await (const [key, value] of db.iterator()) {
      try {
        const session = JSON.parse(value);
        if (session.expiredAt < now) {
          await db.del(key);
          this.logger.debug(`Cleared expired session: ${key}`);
        }
      } catch (err) {
        this.logger.error(`Error clearing expired session ${key}:`, err);
      }
    }
  }
}
