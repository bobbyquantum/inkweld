/**
 * Test setup file that runs before any tests
 * This ensures environment variables are set before modules are imported
 */

// Set in-memory database for all tests
if (!process.env.DB_DATABASE) {
  process.env.DB_DATABASE = ':memory:';
}

console.log(`[test setup] DB_DATABASE set to: ${process.env.DB_DATABASE}`);
