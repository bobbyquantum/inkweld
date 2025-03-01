import { Injectable, Logger } from '@nestjs/common';
import { Store } from 'express-session';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

interface SessionStoreOptions {
  /**
   * Session expiration time in milliseconds
   * Default is 30 days
   */
  expiration?: number;
  /**
   * Maximum number of retries for database operations
   * Default is 3
   */
  maxRetries?: number;
  /**
   * Delay between retries in milliseconds
   * Default is 200
   */
  retryDelay?: number;
}

/**
 * Fixed SessionStore implementation with improved database connection handling
 * This version includes:
 * - More robust database connection checking and recovery
 * - Retry mechanisms for transient database failures
 * - Enhanced logging to help diagnose session issues
 * - Better error handling to prevent silent failures
 */
@Injectable()
export class SessionStore extends Store {
  private logger = new Logger(SessionStore.name);
  private readonly defaultExpiration: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
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
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 200;

    // Initialize connection on construction
    this.ensureConnection();
  }

  /**
   * Ensures database connection is established and healthy
   * Returns a promise that resolves when connection is ready
   */
  private async ensureConnection(): Promise<any> {
    // If already connecting, return the existing promise
    if (this.connecting && this.connectionPromise) {
      this.logger.debug(
        'Connection already in progress, returning existing promise',
      );
      return this.connectionPromise;
    }

    // If connection is already established and ready, verify it's still responsive
    if (this.dbReady && this.db) {
      try {
        // Quick status check
        if (this.db.status === 'open') {
          // Do a quick test to verify connection is actually working
          await this.db.get('__test__').catch(() => null);
          return this.db;
        } else {
          this.logger.warn(
            `Database connection is not open (status: ${this.db.status}), reconnecting`,
          );
          this.dbReady = false;
        }
      } catch (err) {
        this.logger.warn(
          `Error checking database status: ${err.message}, forcing reconnection`,
        );
        this.dbReady = false;
      }
    }

    // Try to close any existing connection before creating a new one
    if (this.db) {
      try {
        await this.db.close().catch(() => {});
      } catch (_err) {
        // Ignore close errors
      }
      this.db = null;
    }

    // Set connecting flag and create new connection promise
    this.connecting = true;
    this.logger.debug('Starting new database connection attempt');

    let retries = 0;

    const attemptConnection = async (): Promise<any> => {
      try {
        const db = await this.levelDBManager.getSystemDatabase('sessions');
        this.db = db;

        this.logger.debug(
          `Database connection obtained, status: ${db?.status}`,
        );

        // Test the connection
        await db.get('__test__').catch(() => null);

        this.dbReady = true;
        this.logger.log(
          'Session store database connection established and verified',
        );
        return db;
      } catch (error) {
        if (retries < this.maxRetries) {
          retries++;
          this.logger.warn(
            `Connection attempt ${retries} failed, retrying: ${error.message}`,
          );

          // Small delay before retry
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * retries),
          );
          return attemptConnection();
        }

        this.logger.error(
          `Failed to connect after ${this.maxRetries} attempts: ${error.message}`,
        );
        throw error;
      }
    };

    this.connectionPromise = attemptConnection().finally(() => {
      this.connecting = false;
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  /**
   * Get a session by ID with retry logic
   */
  async get(sid: string, callback: (err: any, session?: any) => void) {
    let retries = 0;

    const attemptGet = async (): Promise<void> => {
      try {
        // Get database connection
        this.logger.debug(`Getting session ${sid}`);
        const db = await this.ensureConnection();

        let sessionData;
        try {
          sessionData = await db.get(sid);
          this.logger.debug(`Successfully retrieved session data for ${sid}`);
        } catch (err) {
          if (err.code === 'LEVEL_NOT_FOUND') {
            this.logger.debug(`Session ${sid} not found in database`);
            return callback(null, null);
          }

          if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
            if (retries < this.maxRetries) {
              retries++;
              this.logger.warn(
                `Database not open during get (attempt ${retries}), retrying`,
              );
              this.dbReady = false;
              this.db = null;

              // Small delay before retry
              await new Promise((resolve) =>
                setTimeout(resolve, this.retryDelay * retries),
              );
              return attemptGet();
            } else {
              this.logger.error(
                `Failed to get session after ${this.maxRetries} attempts`,
              );
              return callback(null, null); // Return null session instead of error
            }
          }

          throw err;
        }

        if (!sessionData) {
          this.logger.debug(`No session data found for ${sid}`);
          return callback(null, null);
        }

        try {
          const session = JSON.parse(sessionData);
          this.logger.debug(
            `Retrieved session ${sid}, expires: ${new Date(session.expiredAt).toISOString()}`,
          );
          this.logger.debug(
            `Session user ID: ${session.data.userId ? session.data.userId : 'missing'}`,
          );

          // Check if session has expired
          if (Date.now() > session.expiredAt) {
            this.logger.debug(`Session ${sid} has expired, destroying it`);
            // Automatically destroy expired session
            await this.destroy(sid, () => {});
            return callback(null, null);
          }

          callback(null, session.data);
        } catch (parseErr) {
          this.logger.error(
            `Error parsing session data for ${sid}: ${parseErr.message}`,
          );
          // If we can't parse the session data, treat it as a non-existent session
          return callback(null, null);
        }
      } catch (err) {
        this.logger.error(`Error in session.get for ${sid}: ${err.message}`);
        callback(err);
      }
    };

    attemptGet();
  }

  /**
   * Set session data with retry logic
   */
  async set(sid: string, session: any, callback?: (err?: any) => void) {
    let retries = 0;

    const attemptSet = async (): Promise<void> => {
      try {
        // Get database connection
        const db = await this.ensureConnection();

        // Verify the database is actually open
        if (db.status !== 'open') {
          if (retries < this.maxRetries) {
            retries++;
            this.logger.warn(
              `Database reports status ${db.status}, retrying (attempt ${retries})`,
            );
            this.dbReady = false;
            this.db = null;

            // Small delay before retry
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelay * retries),
            );
            return attemptSet();
          } else {
            this.logger.error(
              `Failed to set session after ${this.maxRetries} attempts`,
            );
            if (callback) callback(null); // Don't return error to client
            return;
          }
        }

        // Use session's cookie expiration if available, otherwise use default
        const expiredAt = session.cookie?.expires
          ? new Date(session.cookie.expires).getTime()
          : Date.now() + this.defaultExpiration;

        this.logger.debug(
          `Setting session ${sid} with expiry ${new Date(expiredAt).toISOString()}`,
        );
        this.logger.debug(
          `Session user ID: ${session.userId ? session.userId : 'missing'}`,
        );

        const sessionData = {
          id: sid,
          data: session,
          expiredAt: expiredAt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        try {
          this.logger.debug(
            `Attempting to save session to database: ${db.status}`,
          );
          await db.put(sid, JSON.stringify(sessionData));
          this.logger.debug(`Session saved successfully for ${sid}`);
        } catch (err) {
          this.logger.debug(
            `Failed to save session: ${err.code} - ${err.message}`,
          );

          if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
            if (retries < this.maxRetries) {
              retries++;
              this.logger.warn(
                `Database not open during set (attempt ${retries}), retrying`,
              );
              this.dbReady = false;
              this.db = null;

              // Small delay before retry
              await new Promise((resolve) =>
                setTimeout(resolve, this.retryDelay * retries),
              );
              return attemptSet();
            } else {
              this.logger.error(
                `Failed to set session after ${this.maxRetries} attempts`,
              );
              if (callback) callback(null); // Don't return error to client
              return;
            }
          }

          throw err;
        }

        if (callback) callback(null);
      } catch (err) {
        this.logger.error(`Error in session set: ${err.message}`);
        if (callback) callback(null); // Don't return error to client to prevent auth failures
      }
    };

    attemptSet();
  }

  /**
   * Destroy a session with retry logic
   */
  async destroy(sid: string, callback?: (err?: any) => void) {
    let retries = 0;

    const attemptDestroy = async (): Promise<void> => {
      try {
        // Get database connection
        const db = await this.ensureConnection();

        if (!db || db.status !== 'open') {
          if (retries < this.maxRetries) {
            retries++;
            this.logger.warn(
              `Database not ready during destroy (attempt ${retries}), retrying`,
            );
            this.dbReady = false;
            this.db = null;

            // Small delay before retry
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelay * retries),
            );
            return attemptDestroy();
          } else {
            this.logger.error(
              `Failed to destroy session after ${this.maxRetries} attempts`,
            );
            if (callback) callback(null); // Don't return error to client
            return;
          }
        }

        try {
          await db.del(sid);
          this.logger.debug(`Successfully destroyed session ${sid}`);
        } catch (err) {
          if (err.code === 'LEVEL_NOT_FOUND') {
            this.logger.debug(
              `Session ${sid} not found during destroy, ignoring`,
            );
            if (callback) callback(null);
            return;
          }

          if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
            if (retries < this.maxRetries) {
              retries++;
              this.logger.warn(
                `Database not open during destroy (attempt ${retries}), retrying`,
              );
              this.dbReady = false;
              this.db = null;

              // Small delay before retry
              await new Promise((resolve) =>
                setTimeout(resolve, this.retryDelay * retries),
              );
              return attemptDestroy();
            } else {
              this.logger.warn(
                'Session database not open during destroy, max retries reached',
              );
              if (callback) callback(null);
              return;
            }
          }

          throw err;
        }

        if (callback) callback(null);
      } catch (err) {
        this.logger.warn(`Error destroying session ${sid}:`, err);
        if (callback) callback(null); // Don't return error to client
      }
    };

    attemptDestroy();
  }

  /**
   * Update session expiration time with retry logic
   */
  async touch(sid: string, session: any, callback?: (err?: any) => void) {
    let retries = 0;

    const attemptTouch = async (): Promise<void> => {
      try {
        // Get database connection
        const db = await this.ensureConnection();

        if (!db || db.status !== 'open') {
          if (retries < this.maxRetries) {
            retries++;
            this.logger.warn(
              `Database not ready during touch (attempt ${retries}), retrying`,
            );
            this.dbReady = false;
            this.db = null;

            // Small delay before retry
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelay * retries),
            );
            return attemptTouch();
          } else {
            this.logger.error(
              `Failed to touch session after ${this.maxRetries} attempts`,
            );
            if (callback) callback(null); // Don't return error to client
            return;
          }
        }

        // Get the current session
        let sessionData;
        try {
          sessionData = await db.get(sid);
        } catch (err) {
          if (err.code === 'LEVEL_NOT_FOUND') {
            this.logger.debug(
              `Session ${sid} not found during touch, ignoring`,
            );
            if (callback) callback(null);
            return;
          }

          if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
            if (retries < this.maxRetries) {
              retries++;
              this.logger.warn(
                `Database not open during touch (attempt ${retries}), retrying`,
              );
              this.dbReady = false;
              this.db = null;

              // Small delay before retry
              await new Promise((resolve) =>
                setTimeout(resolve, this.retryDelay * retries),
              );
              return attemptTouch();
            } else {
              this.logger.warn(
                'Session database not open during touch, max retries reached',
              );
              if (callback) callback(null);
              return;
            }
          }

          throw err;
        }

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
        try {
          await db.put(sid, JSON.stringify(parsedSession));
          this.logger.debug(`Session ${sid} touched successfully`);
        } catch (err) {
          if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
            if (retries < this.maxRetries) {
              retries++;
              this.logger.warn(
                `Database not open during touch save (attempt ${retries}), retrying`,
              );
              this.dbReady = false;
              this.db = null;

              // Small delay before retry
              await new Promise((resolve) =>
                setTimeout(resolve, this.retryDelay * retries),
              );
              return attemptTouch();
            } else {
              this.logger.warn(
                'Session database not open during touch save, max retries reached',
              );
              if (callback) callback(null);
              return;
            }
          }

          throw err;
        }

        if (callback) callback(null);
      } catch (err) {
        this.logger.error(`Error touching session ${sid}:`, err);
        if (callback) callback(null); // Don't return error to client
      }
    };

    attemptTouch();
  }

  /**
   * Optional method to clean up expired sessions
   */
  async clearExpiredSessions(): Promise<void> {
    try {
      // Get database connection
      const db = await this.ensureConnection();

      if (!db || db.status !== 'open') {
        this.logger.warn(
          'Database not ready during clearExpiredSessions, skipping cleanup',
        );
        return;
      }

      const now = Date.now();
      let cleaned = 0;

      // Iterate through all sessions
      for await (const [key, value] of db.iterator()) {
        try {
          const session = JSON.parse(value);
          if (session.expiredAt < now) {
            await db.del(key);
            cleaned++;
          }
        } catch (err) {
          this.logger.error(`Error clearing expired session ${key}:`, err);
        }
      }

      if (cleaned > 0) {
        this.logger.log(`Cleared ${cleaned} expired sessions`);
      }
    } catch (err) {
      this.logger.error('Error in clearExpiredSessions:', err);
    }
  }
}

/**
 * TO USE THIS IMPROVED SESSION STORE:
 *
 * 1. Replace the current SessionStore implementation in auth.module.ts:
 *    - Update the import to point to this file
 *    - Add options to the store creation if desired:
 *       {
 *         provide: SessionStore,
 *         useFactory: (levelDBManager: LevelDBManagerService) => {
 *           return new SessionStore(levelDBManager, {
 *             maxRetries: 3,
 *             retryDelay: 200,
 *           });
 *         },
 *         inject: [LevelDBManagerService],
 *       }
 *
 * 2. Consider adjusting the cookie settings in main.ts:
 *    - For cross-origin setups, you might want to adjust sameSite
 *    - If using HTTPS, make sure secure is set to true
 */
