import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as Y from 'yjs';

/**
 * GET /api/revisions on the Yjs Durable Object: the bulk-sync manifest. It
 * enumerates the project's ITEM elements and reports one revision token per
 * document from storage alone. Same cloudflare:workers stub approach as
 * yjs-do-destroy.test.ts, with an in-memory storage that supports the
 * reverse `list` the revision read relies on.
 */

mock.module('cloudflare:workers', () => ({
  DurableObject: class DurableObjectStub {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
(globalThis as Record<string, unknown>).WebSocketRequestResponsePair = class {
  constructor(_request: string, _response: string) {}
};

const SECRET = 'test-database-key-long-enough-for-hmac-32';

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${header}.${body}.${sigB64}`;
}

function makeStorage(entries: Map<string, unknown>) {
  return {
    async get(key: string) {
      return entries.get(key);
    },
    async list(opts: { prefix: string; limit?: number; startAfter?: string; reverse?: boolean }) {
      const keys = [...entries.keys()]
        .filter(
          (k) => k.startsWith(opts.prefix) && (opts.startAfter === undefined || k > opts.startAfter)
        )
        .sort();
      if (opts.reverse) keys.reverse();
      const sliced = opts.limit === undefined ? keys : keys.slice(0, opts.limit);
      return new Map(sliced.map((k) => [k, entries.get(k)]));
    },
    async put(key: string, value: unknown) {
      entries.set(key, value);
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) entries.delete(k);
    },
    async deleteAll() {
      entries.clear();
    },
  };
}

/** Storage holding an `elements` doc snapshot with the given rows. */
function storageWithElements(rows: Array<Record<string, unknown>>) {
  const doc = new Y.Doc();
  doc.getArray('elements').push(rows);
  return new Map<string, unknown>([
    ['doc:alice:proj:elements:snapshot', Y.encodeStateAsUpdate(doc)],
  ]);
}

let YjsProject: new (state: unknown, env: unknown) => { fetch(req: Request): Promise<Response> };
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };

describe('YjsProject DO GET /api/revisions', () => {
  beforeAll(async () => {
    ({ projectService } = await import('../src/services/project.service'));
    ({ userService } = await import('../src/services/user.service'));
    spyOn(userService, 'findById').mockImplementation(async (_db: unknown, id: unknown) => ({
      id,
      username: String(id),
      enabled: true,
      approved: true,
      sessionsValidFrom: null,
    }));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
  });

  // One process runs every test file; do not leak the spy into other suites.
  afterAll(() => {
    (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
  });

  afterEach(() => {
    (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
  });

  const exp = () => Math.floor(Date.now() / 1000) + 3600;

  async function revisions(entries: Map<string, unknown>): Promise<Response> {
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    const token = await signJwt({ userId: 'owner-1', username: 'alice', exp: exp() });
    const state = {
      storage: makeStorage(entries),
      getWebSockets: () => [],
      setWebSocketAutoResponse: () => {},
    };
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    return doInstance.fetch(
      new Request('https://yjs-do/api/revisions?documentId=alice:proj:elements', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
  }

  it('reports one token per ITEM element and ignores folders', async () => {
    const entries = storageWithElements([
      { id: 'folder-1', type: 'FOLDER', name: 'Folder' },
      { id: 'doc-a', type: 'ITEM', name: 'A' },
      { id: 'doc-b', type: 'ITEM', name: 'B' },
    ]);
    entries.set('doc:alice:proj:doc-a:update:1000:00000000:aa', new Uint8Array([0, 2, 0]));
    entries.set('doc:alice:proj:doc-a:update:2000:00000000:bb', new Uint8Array([0, 2, 0]));

    const response = await revisions(entries);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: unknown[] };
    expect(body.documents).toEqual([
      {
        documentId: 'alice:proj:doc-a',
        revision: 'doc:alice:proj:doc-a:update:2000:00000000:bb',
      },
      // Never persisted: nothing to pull.
      { documentId: 'alice:proj:doc-b', revision: null },
    ]);
  });

  it('backfills a revision for a snapshot written without a marker', async () => {
    const entries = storageWithElements([{ id: 'doc-a', type: 'ITEM', name: 'A' }]);
    entries.set('doc:alice:proj:doc-a:snapshot', new Uint8Array([0, 0]));

    const response = await revisions(entries);

    const body = (await response.json()) as {
      documents: Array<{ documentId: string; revision: string | null; unknown?: boolean }>;
    };
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].documentId).toBe('alice:proj:doc-a');
    expect(body.documents[0].revision).toMatch(/^snapshot:/);
    expect(body.documents[0].unknown).toBeUndefined();
    expect(entries.has('doc:alice:proj:doc-a:revision')).toBe(true);
  });

  it('refuses without a token', async () => {
    const state = {
      storage: makeStorage(new Map()),
      getWebSockets: () => [],
      setWebSocketAutoResponse: () => {},
    };
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    const response = await doInstance.fetch(
      new Request('https://yjs-do/api/revisions?documentId=alice:proj:elements')
    );
    expect(response.status).toBe(401);
  });
});
