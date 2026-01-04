/**
 * Test setup file that runs before any tests
 * This ensures environment variables are set before modules are imported
 */

import { join } from 'node:path';

// Set in-memory database for all tests
if (!process.env.DB_DATABASE) {
  process.env.DB_DATABASE = ':memory:';
}

// Set migrations directory
if (!process.env.DRIZZLE_MIGRATIONS_DIR) {
  process.env.DRIZZLE_MIGRATIONS_DIR = join(__dirname, '../drizzle');
}

console.log(`[test setup] DB_DATABASE set to: ${process.env.DB_DATABASE}`);
console.log(`[test setup] DRIZZLE_MIGRATIONS_DIR set to: ${process.env.DRIZZLE_MIGRATIONS_DIR}`);
