/**
 * Tests for the Yjs diagnostics proxy route.
 *
 * Security regression: the proxy previously interpolated the raw
 * user-controlled `:endpoint` path parameter into the URL handed to
 * stub.fetch(). A request like /yjs/do/..%2F..%2Fx decoded to "../.." and,
 * after URL normalization, escaped the intended /api/* prefix. The forwarded
 * URL is now assembled entirely from trusted constants (fixed synthetic
 * origin + literal path selected via an allowlist record); the only carried
 * query parameter is `documentId`, explicitly set via searchParams.
 */
import { describe, expect, it } from 'bun:test';
import app from './yjs-worker.routes';
import type { CloudflareEnv } from '../types/cloudflare';

interface FetchCapture {
  url: URL | undefined;
  calls: number;
}

function makeEnv(): { env: CloudflareEnv; captured: FetchCapture } {
  const captured: FetchCapture = { url: undefined, calls: 0 };
  const stub = {
    fetch: (input: string | URL | Request): Promise<Response> => {
      captured.calls += 1;
      captured.url =
        typeof input === 'string'
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    },
  };
  const env = {
    YJS_PROJECTS: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => stub,
    },
  } as unknown as CloudflareEnv;
  return { env, captured };
}

// The sub-app is mounted at /api/v1/ws in worker-app.ts; request its own
// paths directly since we instantiate the router in isolation.
const BASE = 'http://localhost';

describe('GET /yjs/do/:endpoint', () => {
  it('forwards allowlisted endpoints to the DO under /api/<endpoint>', async () => {
    for (const endpoint of ['stats', 'elements', 'document', 'storage-keys', 'storage-size']) {
      const { env, captured } = makeEnv();
      const res = await app.request(
        `${BASE}/yjs/do/${endpoint}?documentId=alice:novel:elements`,
        undefined,
        env
      );

      expect(res.status).toBe(200);
      expect(captured.calls).toBe(1);
      expect(captured.url?.pathname).toBe(`/api/${endpoint}`);
      // Query string (documentId) is preserved for the DO
      expect(captured.url?.searchParams.get('documentId')).toBe('alice:novel:elements');
    }
  });

  it('builds the forwarded URL from a fixed synthetic origin, not the incoming host', async () => {
    const { env, captured } = makeEnv();
    await app.request(`${BASE}/yjs/do/stats?documentId=alice:novel:elements`, undefined, env);

    // The DO routes on path/query only; the origin must be the constant,
    // never derived from the request URL (host, port or scheme).
    expect(captured.url?.origin).toBe('https://yjs-project-do.internal');
    expect(captured.url?.username).toBe('');
    expect(captured.url?.password).toBe('');
  });

  it('forwards only the documentId query parameter, dropping everything else', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(
      `${BASE}/yjs/do/stats?documentId=alice:novel:elements&evil=..%2F..%2F&format=x`,
      undefined,
      env
    );

    expect(res.status).toBe(200);
    expect(captured.url?.searchParams.get('documentId')).toBe('alice:novel:elements');
    expect(captured.url?.searchParams.get('evil')).toBeNull();
    expect(captured.url?.searchParams.get('format')).toBeNull();
    expect(captured.url?.search).toBe('?documentId=alice%3Anovel%3Aelements');
  });

  it('rejects unknown endpoint names without contacting the DO', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(
      `${BASE}/yjs/do/nope?documentId=alice:novel:elements`,
      undefined,
      env
    );

    expect(res.status).toBe(404);
    expect(captured.calls).toBe(0);
  });

  it('rejects encoded path traversal in the endpoint parameter', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(
      `${BASE}/yjs/do/..%2F..%2Fsecret?documentId=alice:novel:elements`,
      undefined,
      env
    );

    expect([404, 400]).toContain(res.status);
    expect(captured.calls).toBe(0);
  });

  it('rejects endpoint names smuggling extra path segments', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(
      `${BASE}/yjs/do/elements%2Fextra?documentId=alice:novel:elements`,
      undefined,
      env
    );

    expect([404, 400]).toContain(res.status);
    expect(captured.calls).toBe(0);
  });

  it('returns 400 when documentId is missing', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(`${BASE}/yjs/do/stats`, undefined, env);

    expect(res.status).toBe(400);
    expect(captured.calls).toBe(0);
  });

  it('returns 400 for an invalid documentId format', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(`${BASE}/yjs/do/stats?documentId=no-colon-here`, undefined, env);

    expect(res.status).toBe(400);
    expect(captured.calls).toBe(0);
  });

  it('returns 503 when the YJS_PROJECTS binding is missing', async () => {
    const res = await app.request(
      `${BASE}/yjs/do/stats?documentId=alice:novel:elements`,
      undefined,
      {} as unknown as CloudflareEnv
    );

    expect(res.status).toBe(503);
  });
});
