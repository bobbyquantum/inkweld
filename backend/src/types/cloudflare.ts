/**
 * Cloudflare Workers type definitions
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DurableObjectNamespace<_T = unknown> = any;

/** Minimal Cloudflare Durable Object stub interface (placeholder until @cloudflare/workers-types is available) */
interface DurableObjectStub {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

// Re-export types for use in other modules
export type { DurableObjectNamespace, DurableObjectStub };

/**
 * Environment bindings for Cloudflare Workers
 */
export interface CloudflareEnv {
  // D1 Database
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DB: any;

  // R2 Storage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  STORAGE: any;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    userId?: string;
  };
};
