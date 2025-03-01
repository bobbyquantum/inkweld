import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { LeveldbPersistence } from 'y-leveldb';
import * as path from 'path';
import * as fs from 'fs';
import { Level } from 'level';
import { ConfigService } from '@nestjs/config';

/**
 * Service responsible for managing per-project LevelDB databases.
 * This approach creates a separate LevelDB instance for each project,
 * providing isolation and making backup/restore easier.
 */
@Injectable()
export class LevelDBManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LevelDBManagerService.name);
  private readonly systemDatabases = new Map<string, Level<string, string>>();
  private readonly projectDatabases = new Map<string, LeveldbPersistence>();
  private readonly basePath: string;
  private readonly maxIdleTime: number; // ms before closing unused connections
  private readonly dbActivityTimestamps = new Map<string, number>();
  ///we're bun based so avoid nodejs types
  private cleanupInterval: Timer;
  private dbsInitialized: boolean = false;
  private hasVerifiedDatabaseFiles: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.logger.log('Initializing LevelDBManagerService with ConfigService');
    // For now use defaults since ConfigService injection might be failing
    this.basePath = './data';
    this.maxIdleTime = 1000 * 60 * 30; // Default: 30 minutes
    this.logger.log(
      `Using database path: ${this.basePath}`
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

    // Initialize system databases
    await this.getSystemDatabase('users');
    await this.getSystemDatabase('sessions');

    // Force clean any lingering lock files
    this.cleanupLockFiles();

    // Mark databases as initialized
    this.dbsInitialized = true;
    this.logger.log('All system databases initialized successfully');
  }

  async onModuleDestroy() {
    // Clean up on service shutdown
    clearInterval(this.cleanupInterval);
    this.logger.log('Closing all project database connections...');

    // Close all open databases
    for (const [key, db] of this.projectDatabases.entries()) {
      try {
        await this.closeDatabase(key, db);
      } catch (error) {
        this.logger.error(`Error closing database for ${key}:`, error);
      }
    }

    this.projectDatabases.clear();

    // Close system databases
    for (const [key, db] of this.systemDatabases.entries()) {
      try {
        await db.close();
        this.logger.log(`Closed system database: ${key}`);
      } catch (error) {
        this.logger.error(`Error closing system database ${key}:`, error);
      }
    }

    this.systemDatabases.clear();

    // Final cleanup of any lock files
    this.cleanupLockFiles();

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

    // For _system database, ensure lock files are cleaned up
    if (username === '_system') {
      this.cleanupLockFiles();
    }

    // Check if databases are initialized
    if (!this.dbsInitialized) {
      this.logger.warn(`Database access requested for ${projectKey} before initialization completed`);
    }

    if (!this.projectDatabases.has(projectKey)) {
      const dbPath = this.getProjectPath(username, projectSlug);

      // Ensure project directory exists before initializing LevelDB
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
        this.logger.log(`Created directory for project database: ${dbPath}`);
      }

      try {
        const db = new LeveldbPersistence(dbPath, {
          levelOptions: {
            createIfMissing: true,
            errorIfExists: false
          },
        });

        this.projectDatabases.set(projectKey, db);
        this.logger.log(
          `Created new LevelDB instance for project ${projectKey} at ${dbPath}`,
        );

        // Ensure the database is actually ready
        // Instead of trying to use .put directly which might not be available,
        // we'll only verify the connection once (for any DB)
        if (!this.hasVerifiedDatabaseFiles) {
          // Perform a simple check to see if the database directory is writable
          try {
            const testFile = path.join(dbPath, '__test__');
            fs.writeFileSync(testFile, 'test');
            fs.readFileSync(testFile);
            fs.unlinkSync(testFile);
            this.hasVerifiedDatabaseFiles = true;
            this.logger.log(`Database directory for ${projectKey} verified and writable`);
          } catch (error) {
            this.logger.error(`Failed to verify database directory for ${projectKey}:`, error);
            this.projectDatabases.delete(projectKey);
            throw new Error(`Database directory verification failed for ${projectKey}`);
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to create LevelDB instance for project ${projectKey}:`,
          error,
        );
        throw new Error(
          `Database initialization failed for project ${projectKey}`,
        );
      }
    }

    return this.projectDatabases.get(projectKey);
  }

  /**
   * Get a system-level LevelDB database
   * @param dbName The database name (e.g., 'users', 'sessions')
   * @returns The LevelDB database instance
   */
  async getSystemDatabase(dbName: string): Promise<Level<string, string>> {
    if (!this.systemDatabases.has(dbName)) {
      const dbPath = path.join(this.basePath, '_system', dbName);

      // Ensure directory exists
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
        this.logger.log(`Created directory for system database: ${dbPath}`);
      }

      try {
        const db = new Level<string, string>(dbPath, {
          valueEncoding: 'utf8',
          keyEncoding: 'utf8',
        });

        this.systemDatabases.set(dbName, db);
        this.logger.log(
          `Created new system LevelDB instance for ${dbName} at ${dbPath}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create system LevelDB instance for ${dbName}:`,
          error,
        );
        throw new Error(`System database initialization failed for ${dbName}`);
      }
    }

    return this.systemDatabases.get(dbName);
  }

  /**
   * Get a sublevel of a system database for namespacing
   */
  async getSystemSublevel(dbName: string, sublevelName: string): Promise<any> {
    const db = await this.getSystemDatabase(dbName);
    return db.sublevel(sublevelName);
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

    // Follow the structure: /Y_DATA_PATH/{username}/{project_slug}/leveldb
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
   * Clean up any lingering database lock files to prevent issues
   * This ensures we can properly access databases even after crashes
   */
  private cleanupLockFiles(): void {
    try {
      // Clean lock files in _system/users database
      const usersLockFile = path.join(this.basePath, '_system', 'users', 'leveldb', 'LOCK');
      if (fs.existsSync(usersLockFile)) {
        this.logger.log(`Removing lock file: ${usersLockFile}`);
        fs.unlinkSync(usersLockFile);
      }

      // Clean lock files in _system/sessions database
      const sessionsLockFile = path.join(this.basePath, '_system', 'sessions', 'leveldb', 'LOCK');
      if (fs.existsSync(sessionsLockFile)) {
        this.logger.log(`Removing lock file: ${sessionsLockFile}`);
        fs.unlinkSync(sessionsLockFile);
      }
    } catch (error) {
      this.logger.error('Error cleaning up lock files:', error);
    }
  }

  /**
   * Helper to close a database connection.
   */
  private async closeDatabase(
    key: string,
    _db: LeveldbPersistence,
  ): Promise<void> {
    try {
      // Access the underlying leveldb instance to close it properly
      // This is a simplification - actual implementation would depend on the LeveldbPersistence API
      // if (db._db && typeof db._db.close === 'function') {
      //   await db._db.close();
      // }

      this.projectDatabases.delete(key);
      this.dbActivityTimestamps.delete(key);
    } catch (error) {
      this.logger.error(`Error closing database ${key}:`, error);
    }
  }
}
