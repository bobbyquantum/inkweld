/**
 * Test setup file that runs before any tests
 * This ensures environment variables are set before modules are imported
 */

import { join } from 'node:path';
import { setupBunDatabase } from '../src/db/bun-sqlite';

// Set in-memory database for all tests
if (!process.env.DB_DATABASE) {
  process.env.DB_DATABASE = ':memory:';
}

// Set migrations directory
if (!process.env.DRIZZLE_MIGRATIONS_DIR) {
  process.env.DRIZZLE_MIGRATIONS_DIR = join(__dirname, '../drizzle');
}

// Disable user approval for tests
if (!process.env.USER_APPROVAL_REQUIRED) {
  process.env.USER_APPROVAL_REQUIRED = 'false';
}

console.log(`[test setup] DB_DATABASE set to: ${process.env.DB_DATABASE}`);
console.log(`[test setup] DRIZZLE_MIGRATIONS_DIR set to: ${process.env.DRIZZLE_MIGRATIONS_DIR}`);

// Eagerly initialize the shared Bun SQLite database before test modules are
// imported. Several integration tests call getDatabase() at module load time
// (e.g. `const db = getDatabase();`), so the singleton must be ready before
// those imports execute.
await setupBunDatabase(process.env.DB_DATABASE);
