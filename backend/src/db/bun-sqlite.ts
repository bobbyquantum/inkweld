/**
 * Database initialization for Bun runtime using native bun:sqlite
 * This file can ONLY be imported in Bun-specific code paths
 */
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import * as schema from './schema';
import { config } from '../config/env';

let db: BunSQLiteDatabase<typeof schema> | null = null;
let sqlite: BunDatabase | null = null;
let migrationsApplied = false;

export async function setupBunDatabase(dbPath: string): Promise<BunSQLiteDatabase<typeof schema>> {
  if (db) return db;

  // Ensure directory exists for the database file (unless using :memory:)
  if (dbPath !== ':memory:') {
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
      console.log(`[database] Created directory: ${dbDir}`);
    }
  }

  sqlite = new BunDatabase(dbPath);
  db = drizzle(sqlite, { schema });

  await runMigrations(db);

  // Seed default admin if configured
  await seedDefaultAdmin(db);

  return db;
}

export function getBunDatabase(): BunSQLiteDatabase<typeof schema> {
  if (!db) {
    throw new Error('Bun database not initialized. Call setupBunDatabase() first.');
  }
  return db;
}

export type BunDatabaseInstance = BunSQLiteDatabase<typeof schema>;

async function runMigrations(database: BunDatabaseInstance): Promise<void> {
  if (migrationsApplied) {
    return;
  }

  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_DIR || join(process.cwd(), 'drizzle');

  if (!existsSync(migrationsFolder)) {
    console.warn(
      `[drizzle] migrations folder not found at "${migrationsFolder}". Skipping automatic migrations.`
    );
    migrationsApplied = true;
    return;
  }

  try {
    // Drizzle's migrate function handles tracking which migrations have been applied
    // It will only run migrations that haven't been applied yet via __drizzle_migrations table
    await migrate(database, { migrationsFolder });
    migrationsApplied = true;
    console.log('[drizzle] Migrations completed successfully');
  } catch (error) {
    // If the error is about tables already existing, it's safe to continue
    // This happens when the database is already initialized
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already exists')) {
      console.log('[drizzle] Database tables already exist, skipping migrations');
      migrationsApplied = true;
      return;
    }
    console.error('[drizzle] Failed to run migrations:', error);
    throw error;
  }
}

/**
 * Seed default admin user if configured via environment variables.
 * This is useful for:
 * - Initial deployment bootstrapping (first admin)
 * - E2E testing (pre-configured admin user)
 *
 * Only creates the user if DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD are set.
 * If the user already exists, it ensures they have admin privileges.
 */
async function seedDefaultAdmin(database: BunDatabaseInstance): Promise<void> {
  if (!config.defaultAdmin.enabled) {
    return;
  }

  const { username, password } = config.defaultAdmin;

  // Import userService dynamically to avoid circular dependency
  const { userService } = await import('../services/user.service.js');

  try {
    // Check if user already exists
    const existingUser = await userService.findByUsername(database, username);

    if (existingUser) {
      // Ensure existing user is admin, approved, and enabled
      if (!existingUser.isAdmin || !existingUser.approved || !existingUser.enabled) {
        await userService.setUserAdmin(database, existingUser.id, true);
        await userService.approveUser(database, existingUser.id);
        await userService.setUserEnabled(database, existingUser.id, true);
        console.log(`[seed] Updated existing user "${username}" to admin status`);
      }
    } else {
      // Create new admin user
      const newUser = await userService.create(
        database,
        {
          username,
          password,
          email: `${username}@localhost`,
          name: username,
        },
        { autoApprove: true }
      );

      // Set as admin
      await userService.setUserAdmin(database, newUser.id, true);
      console.log(`[seed] Created default admin user "${username}"`);
    }
  } catch (error) {
    console.error('[seed] Failed to seed default admin:', error);
    // Don't throw - this shouldn't prevent the app from starting
  }
}
