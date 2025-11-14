/**
 * Database module exports
 * Re-exports types from the three database implementations
 */
export type { BunDatabaseInstance } from './bun-sqlite';
export type { BetterSqliteDatabaseInstance } from './better-sqlite';
export type { D1DatabaseInstance } from './d1';

// Re-export schema
export * as schema from './schema';

// Export database instance getter for tests (uses Bun SQLite in test environment)
export { getBunDatabase as getDatabase } from './bun-sqlite';
