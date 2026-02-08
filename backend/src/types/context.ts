/**
 * Type definitions for Hono context variables
 */
import type { BunDatabaseInstance } from '../db/bun-sqlite';
import type { BetterSqliteDatabaseInstance } from '../db/better-sqlite';
import type { D1DatabaseInstance } from '../db/d1';
import type { R2Bucket } from '@cloudflare/workers-types';

export interface User {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  enabled: boolean;
  isAdmin?: boolean;
}

// Union type that accepts any of the three database types
export type DatabaseInstance =
  | BunDatabaseInstance
  | BetterSqliteDatabaseInstance
  | D1DatabaseInstance;

export type AppContext = {
  Variables: {
    db: DatabaseInstance;
    user?: User;
    storage?: R2Bucket; // Optional R2 bucket for file storage
  };
};
