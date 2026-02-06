/**
 * Cloudflare Workers type definitions
 */

// Re-export Cloudflare Worker types when available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R2Bucket = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DurableObjectNamespace<_T = unknown> = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DurableObjectStub = any;

// Re-export types for use in other modules
export type { DurableObjectNamespace, DurableObjectStub };

/**
 * Environment bindings for Cloudflare Workers
 */
export interface CloudflareEnv {
  // D1 Database
  DB: D1Database;

  // R2 Storage
  STORAGE: R2Bucket;

  // Durable Objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  YJS_PROJECTS: DurableObjectNamespace<any>;

  // Environment variables
  NODE_ENV: string;
  PORT: string;
  DB_TYPE: string;
  ALLOWED_ORIGINS: string;
  USER_APPROVAL_REQUIRED: string;
  GITHUB_ENABLED: string;

  // Optional secrets
  SESSION_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

/**
 * Hono context with Cloudflare bindings
 */
export type CloudflareAppContext = {
  Bindings: CloudflareEnv;
  Variables: {
    db: D1Database;
    userId?: string;
  };
};
