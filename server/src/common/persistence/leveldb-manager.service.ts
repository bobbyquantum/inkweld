import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { LeveldbPersistence } from 'y-leveldb';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';

/**
 * Service responsible for managing per-project LevelDB databases.
 * This approach creates a separate LevelDB instance for each project,
 * providing isolation and making backup/restore easier.
 */
@Injectable()
export class LevelDBManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LevelDBManagerService.name);
  private readonly projectDatabases = new Map<string, LeveldbPersistence>();
  private readonly basePath: string;
  private readonly maxIdleTime: number; // ms before closing unused connections
  private readonly dbActivityTimestamps = new Map<string, number>();
  ///we're bun based so avoid nodejs types
  private cleanupInterval: Timer;

  constructor(private readonly configService: ConfigService) {
    // Get configuration from environment
    this.basePath = this.configService.get<string>('DATA_PATH', './data');
    this.maxIdleTime = this.configService.get<number>(
      'LEVELDB_MAX_IDLE_TIME',
      1000 * 60 * 30,
    ); // Default: 30 minutes

    // Ensure base directory exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      this.logger.log(
        `Created base directory for project databases: ${this.basePath}`,
      );
    }
  }

  async onModuleInit() {
    // Start cleanup timer to close idle database connections
    this.cleanupInterval = setInterval(
      () => this.cleanupIdleDatabases(),
      1000 * 60 * 5,
    ); // Check every 5 minutes
    this.logger.log(
      `LevelDB Manager initialized with base path: ${this.basePath}`,
    );
  }

  async onModuleDestroy() {
    // Clean up on service shutdown
    clearInterval(this.cleanupInterval);
    this.logger.log('Closing all project database connections...');

    // Close all open databases
    for (const [key, db] of this.projectDatabases.entries()) {
      try {
        // Note: LeveldbPersistence doesn't have a standard close method,
        // but accessing the underlying db would allow proper closing
        // This is a simplification - real implementation would handle this properly
        await this.closeDatabase(key, db);
      } catch (error) {
        this.logger.error(`Error closing database for ${key}:`, error);
      }
    }

    this.projectDatabases.clear();
    this.logger.log('All project database connections closed');
  }

  /**
   * Get a LevelDB instance for a specific project.
   * Creates the database if it doesn't exist.
   */
  async getProjectDatabase(
    username: string,
    projectSlug: string,
  ): Promise<LeveldbPersistence> {
    const projectKey = this.getProjectKey(username, projectSlug);
    this.updateActivityTimestamp(projectKey);

    // If we already have this database open, return it
    if (this.projectDatabases.has(projectKey)) {
      return this.projectDatabases.get(projectKey);
    }

    // Database not open, we need to create a new instance
    const dbPath = this.getProjectPath(username, projectSlug);

    // Ensure project directory exists before initializing LevelDB
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
      this.logger.log(`Created directory for project database: ${dbPath}`);
    }

    // Try to open/create the database with retries for concurrent access
    let retries = 3;
    let db: LeveldbPersistence = null;

    while (retries > 0 && !db) {
      try {
        db = new LeveldbPersistence(dbPath, {
          levelOptions: {
            createIfMissing: true,
            errorIfExists: false,
            // Add options to help with concurrent access issues
            lockTimeout: 10000, // 10 seconds
            retryTimeout: 2000, // 2 seconds
          },
        });

        this.projectDatabases.set(projectKey, db);
        this.logger.log(
          `Created new LevelDB instance for project ${projectKey} at ${dbPath}`,
        );
      } catch (error) {
        retries--;

        // Check if it's a lock file error (Type-safe error handling)
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('LOCK')) {
          this.logger.warn(
            `LockFile issue for project ${projectKey} (${retries} retries left):`,
            errorMessage,
          );

          // Wait a bit before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (4 - retries)),
          );

          // If we still have retries, continue to the next attempt
          if (retries > 0) continue;
        }

        this.logger.error(
          `Failed to create LevelDB instance for project ${projectKey}:`,
          error,
        );
        throw new Error(
          `Database initialization failed for project ${projectKey}: ${errorMessage}`,
        );
      }
    }

    return db;
  }

  /**
   * Close a specific project database.
   * Usually called when a project is deleted or on very low memory situations.
   */
  async closeProjectDatabase(
    username: string,
    projectSlug: string,
  ): Promise<void> {
    const projectKey = this.getProjectKey(username, projectSlug);

    if (this.projectDatabases.has(projectKey)) {
      const db = this.projectDatabases.get(projectKey);
      await this.closeDatabase(projectKey, db);
    }
  }

  /**
   * Delete a project database entirely.
   * This should be called when a project is deleted.
   */
  async deleteProjectDatabase(
    username: string,
    projectSlug: string,
  ): Promise<void> {
    await this.closeProjectDatabase(username, projectSlug);

    const dbPath = this.getProjectPath(username, projectSlug);

    // Delete the entire directory - this is a simplification
    // In production, you'd want to properly delete all LevelDB files
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
      this.logger.log(
        `Deleted database for project ${username}/${projectSlug} at ${dbPath}`,
      );
    }
  }

  /**
   * List all projects that have a database.
   * This can be used for maintenance and admin tasks.
   */
  async listProjects(): Promise<string[]> {
    // This is a simplistic implementation
    // In production, you'd want to parse directory names more carefully
    try {
      const dirs = fs.readdirSync(this.basePath);
      return dirs.filter((dir) =>
        fs.statSync(path.join(this.basePath, dir)).isDirectory(),
      );
    } catch (error) {
      this.logger.error('Failed to list project databases:', error);
      return [];
    }
  }

  /**
   * Generate a consistent key for a project.
   */
  private getProjectKey(username: string, projectSlug: string): string {
    return `${username}:${projectSlug}`;
  }

  /**
   * Get the filesystem path for a project database.
   */
  private getProjectPath(username: string, projectSlug: string): string {
    // Sanitize username and slug to be safe for file paths
    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeSlug = projectSlug.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Follow the structure: /DATA_PATH/{username}/{project_slug}/leveldb
    return path.join(this.basePath, safeUsername, safeSlug, 'leveldb');
  }

  /**
   * Update the last access time for a database.
   */
  private updateActivityTimestamp(projectKey: string): void {
    this.dbActivityTimestamps.set(projectKey, Date.now());
  }

  /**
   * Close databases that haven't been used for a while.
   */
  private async cleanupIdleDatabases(): Promise<void> {
    const now = Date.now();

    for (const [key, timestamp] of this.dbActivityTimestamps.entries()) {
      if (
        now - timestamp > this.maxIdleTime &&
        this.projectDatabases.has(key)
      ) {
        const db = this.projectDatabases.get(key);
        await this.closeDatabase(key, db);
        this.logger.log(`Closed idle database connection for ${key}`);
      }
    }
  }

  /**
   * Helper to close a database connection.
   */
  private async closeDatabase(
    key: string,
    db: LeveldbPersistence,
  ): Promise<void> {
    let retries = 3;
    while (retries > 0) {
      try {
        const anyDb = db as any;
        if (anyDb._db && typeof anyDb._db.close === 'function') {
          await anyDb._db.close();
          this.logger.log(`Explicitly closed database connection for ${key}`);
        } else {
          this.logger.warn(
            `Could not explicitly close database for ${key} - relying on garbage collection`,
          );
        }
        this.projectDatabases.delete(key);
        this.dbActivityTimestamps.delete(key);
        return;
      } catch (error) {
        retries--;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('LOCK') && retries > 0) {
          this.logger.warn(
            `LockFile issue while closing database ${key} (${retries} retries left):`,
            errorMessage,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (4 - retries)),
          );
        } else {
          this.logger.error(
            `Error closing database ${key}: ${errorMessage}`,
            error,
          );
          throw error;
        }
      }
    }
  }
}
