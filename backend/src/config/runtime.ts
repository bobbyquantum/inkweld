/**
 * Runtime detection utilities
 * Determines which platform the application is running on
 */

export enum RuntimePlatform {
  BUN = 'bun',
  CLOUDFLARE_WORKERS = 'cloudflare-workers',
  NODE = 'node',
  UNKNOWN = 'unknown',
}

/**
 * Detect the current runtime platform
 */
export function detectRuntime(): RuntimePlatform {
  // Check for Cloudflare Workers - these globals only exist in Workers runtime
  // @ts-expect-error - WebSocketPair and caches are Cloudflare Workers globals
  if (typeof WebSocketPair !== 'undefined' && typeof caches !== 'undefined') {
    return RuntimePlatform.CLOUDFLARE_WORKERS;
  }

  // Check for Bun
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    return RuntimePlatform.BUN;
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return RuntimePlatform.NODE;
  }

  return RuntimePlatform.UNKNOWN;
}

/**
 * Check if running on Cloudflare Workers
 */
export function isCloudflareWorkers(): boolean {
  return detectRuntime() === RuntimePlatform.CLOUDFLARE_WORKERS;
}

/**
 * Check if running on Bun
 */
export function isBun(): boolean {
  return detectRuntime() === RuntimePlatform.BUN;
}

/**
 * Check if running on Node.js
 */
export function isNode(): boolean {
  return detectRuntime() === RuntimePlatform.NODE;
}

/**
 * Get current runtime as string
 */
export function getCurrentRuntime(): string {
  return detectRuntime();
}
