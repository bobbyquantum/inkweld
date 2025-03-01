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
export class SessionStore extends Store {
  private logger = new Logger(SessionStore.name);
  private readonly defaultExpiration: number;
  private db: any = null;
  private dbReady: boolean = false;
  private connecting: boolean = false;
  private connectionPromise: Promise<any> | null = null;

  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    options: SessionStoreOptions = {},
  ) {
    super();
    this.defaultExpiration = options.expiration || 30 * 24 * 60 * 60 * 1000; // 30 days
    // Initialize connection on construction
    this.ensureConnection();
  }

  /**
   * Ensures database connection is established
   * Returns a promise that resolves when connection is ready
   */
  private async ensureConnection(): Promise<any> {
    // If already connecting, return the existing promise
    if (this.connecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // If connection is already established and ready, return it
    if (this.dbReady && this.db) {
      return this.db;
    }

    // Set connecting flag and create new connection promise
    this.connecting = true;

    this.connectionPromise = new Promise((resolve, reject) => {
      // Get database connection
      this.levelDBManager.getSystemDatabase('sessions')
        .then(db => {
          this.db = db;

          // Test connection with a get operation
          return db.get('__test__').catch(() => {
            // Expected to fail if key doesn't exist, but connection is good
            return null;
          });
        })
        .then(() => {

          this.dbReady = true;
          this.logger.log('Session store database connection established');
          resolve(this.db);
        })
        .catch(error => {
          if (error.code === 'LEVEL_DATABASE_NOT_OPEN') {
            this.logger.warn('Session database not open, will retry on next access');
            this.dbReady = false;
            this.db = null;
            reject(error);
          } else {
            // For other errors, log and reject
            this.logger.error('Failed to connect to session database:', error);
            this.dbReady = false;
            this.db = null;
            reject(error);
          }
        })
        .finally(() => {
          this.connecting = false;
          this.connectionPromise = null;
        });
    });

    return this.connectionPromise;
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      // Get database connection
      const db = await this.ensureConnection();

      let sessionData;
      try {
        sessionData = await db.get(sid);
      } catch (err) {
        if (err.code === 'LEVEL_NOT_FOUND') {
          return callback(null, null);
        }

        if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
          this.dbReady = false;
          this.logger.warn('Session database not open during get, will retry');
          return callback(null, null); // Return null session instead of error
        }

        throw err;
      }

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
      // Get database connection
      const db = await this.ensureConnection().catch(err => {
        this.logger.error('Failed to connect to database in set:', err);
        throw err;
      });

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

      try {
        await db.put(sid, JSON.stringify(sessionData));
      } catch (err) {
        if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
          this.dbReady = false;
          this.logger.warn('Session database not open during set, will retry on next access');
          // Don't return error to client, which would cause authentication failures
          if (callback) callback(null);
          return;
        }
        throw err;
      }

      if (callback) callback(null);
    } catch (err) {
      this.logger.error('Error in session set:', err);
      if (callback) callback(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      // Get database connection
      const db = await this.ensureConnection().catch(err => {
        this.logger.warn('Failed to connect to database in destroy:', err);
        // Don't return error for destroy operations
        if (callback) callback(null);
        return null;
      });

      if (!db) {
        return;
      }

      try {
        await db.del(sid);
      } catch (err) {
        if (err.code === 'LEVEL_NOT_FOUND') {
          if (callback) callback(null);
          return;
        }

        if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
          this.dbReady = false;
          this.logger.warn('Session database not open during destroy, will retry on next access');
          if (callback) callback(null);
          return;
        }

        throw err;
      }

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async touch(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      // Get database connection
      const db = await this.ensureConnection().catch(err => {
        this.logger.warn('Failed to connect to database in touch:', err);
        // Don't return error for touch operations
        if (callback) callback(null);
        return null;
      });

      if (!db) {
        return;
      }

      // Get the current session
      const sessionData = await db.get(sid).catch((err: any) => {
        if (err.code === 'LEVEL_NOT_FOUND') {
          return null;
        }

        if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
          this.dbReady = false;
          this.logger.warn('Session database not open during touch, will retry on next access');
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
    // Get database connection
    const db = await this.ensureConnection().catch(err => {
      this.logger.warn('Failed to connect to database in clearExpiredSessions:', err);
      return null;
    });

    if (!db) {
      return;
    }

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
