/**
 * Cloudflare Workers type definitions
 */
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { D1DatabaseInstance } from '../db/d1';

/** Minimal Durable Object identifier interface */
interface DurableObjectId {
  toString(): string;
}

/**
 * Minimal Cloudflare Durable Object stub interface.
 * Uses the standard Request type for compatibility with Hono's c.req.raw.
 */
interface DurableObjectStub {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

/**
 * Minimal Cloudflare Durable Object namespace interface.
 * Typed for the operations actually used in this codebase.
 */
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

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
  YJS_PROJECTS: DurableObjectNamespace;

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
    db: D1DatabaseInstance;
    userId?: string;
  };
};
