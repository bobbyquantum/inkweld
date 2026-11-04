import { describe, expect, it } from 'bun:test';
import app from '../src/routes/yjs-worker.routes';
import type { CloudflareEnv } from '../src/types/cloudflare';

/**
 * The Worker route picks a project's Durable Object from the document id, so
 * it reads the id with the same parser as the object and the Bun route, and
 * refuses a malformed one with a 400 before contacting any object.
 */

interface Capture {
  /** Names passed to `idFromName`, i.e. the objects that were chosen. */
  names: string[];
  /** Requests forwarded to an object. */
  calls: number;
}

function makeEnv(): { env: CloudflareEnv; captured: Capture } {
  const captured: Capture = { names: [], calls: 0 };
  const stub = {
    fetch: (): Promise<Response> => {
      captured.calls += 1;
      return Promise.resolve(new Response('{}', { status: 200 }));
    },
  };
  const env = {
    YJS_PROJECTS: {
      idFromName: (name: string) => {
        captured.names.push(name);
        return { toString: () => name };
      },
      get: () => stub,
    },
  } as unknown as CloudflareEnv;
  return { env, captured };
}

// The sub-app is mounted at /api/v1/ws in worker-app.ts; request its own
// paths directly since the router is instantiated in isolation.
const BASE = 'http://localhost';

const MALFORMED_IDS = [
  'alice:novel',
  'alice:novel:',
  'alice:novel:/',
  'alice:novel:elements//',
  'alice::elements',
  ':novel:elements',
];

const VALID_IDS = [
  'alice:novel:elements',
  'alice:novel:elements/',
  'alice:novel:V1StGXR8_Z5jdHi6B-myT',
  'alice:novel:V1StGXR8_Z5jdHi6B-myT/',
];

function wsPath(documentId: string): string {
  return `${BASE}/yjs?documentId=${encodeURIComponent(documentId)}`;
}

function proxyPath(documentId: string): string {
  return `${BASE}/yjs/do/stats?documentId=${encodeURIComponent(documentId)}`;
}

/** Send one request per id, each with its own env, and return what each saw. */
function requestEach(
  ids: string[],
  path: (documentId: string) => string
): Promise<Array<{ id: string; status: number; captured: Capture }>> {
  return Promise.all(
    ids.map(async (id) => {
      const { env, captured } = makeEnv();
      const res = await app.request(path(id), undefined, env);
      return { id, status: res.status, captured };
    })
  );
}

describe('Worker Yjs route document ids', () => {
  it('refuses a malformed id on the socket route without choosing an object', async () => {
    const results = await requestEach(MALFORMED_IDS, wsPath);
    for (const { id, status, captured } of results) {
      expect({ id, status }).toEqual({ id, status: 400 });
      expect(captured.names).toEqual([]);
      expect(captured.calls).toBe(0);
    }
  });

  it('refuses a malformed id on the diagnostics proxy', async () => {
    const results = await requestEach(MALFORMED_IDS, proxyPath);
    for (const { id, status, captured } of results) {
      expect({ id, status }).toEqual({ id, status: 400 });
      expect(captured.calls).toBe(0);
    }
  });

  it("forwards every id form real clients send to the project's object", async () => {
    const results = await requestEach(VALID_IDS, wsPath);
    for (const { id, status, captured } of results) {
      expect({ id, status }).toEqual({ id, status: 200 });
      expect(captured.names).toEqual(['alice:novel']);
      expect(captured.calls).toBe(1);
    }
  });

  it('chooses the object from the first two segments, as the object reads the id', async () => {
    const { env, captured } = makeEnv();
    const res = await app.request(wsPath('worldbuilding:alice:novel:character-1'), undefined, env);
    expect(res.status).toBe(200);
    expect(captured.names).toEqual(['worldbuilding:alice']);
  });
});
