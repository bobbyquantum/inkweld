/**
 * Shared test setup - import this at the top of every test file
 */
import { setupDatabase, closeDatabase } from '../src/config/database.js';
import * as fs from 'fs/promises';

// Ensure data directory exists
await fs.mkdir('./data', { recursive: true }).catch(() => {});

// Initialize database once (shared across all tests)
if (!globalThis.__TEST_DB_INITIALIZED__) {
  await setupDatabase();
  console.log('✅ Test database initialized (shared)');
  globalThis.__TEST_DB_INITIALIZED__ = true;
}

// Import app after database is ready
export const { app } = await import('../src/index.js');

// Note: We don't close the database here - it's shared across all test files
// Bun will clean it up when all tests complete
