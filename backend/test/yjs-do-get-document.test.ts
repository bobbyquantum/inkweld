import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as Y from 'yjs';

/**
 * GET /api/document on the Yjs Durable Object: the JSON view MCP tools read on
 * Cloudflare Workers. It must carry every shared type those tools read,
 * including the project-level ones the frontend keeps in the elements doc.
 * Same cloudflare:workers stub approach as yjs-do-revisions.test.ts.
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
    get: (key: string) => Promise.resolve(entries.get(key)),
    list: (opts: { prefix: string; limit?: number; startAfter?: string; reverse?: boolean }) => {
      const keys = [...entries.keys()]
        .filter(
          (k) => k.startsWith(opts.prefix) && (opts.startAfter === undefined || k > opts.startAfter)
        )
        .sort();
      if (opts.reverse) keys.reverse();
      const sliced = opts.limit === undefined ? keys : keys.slice(0, opts.limit);
      return Promise.resolve(new Map(sliced.map((k) => [k, entries.get(k)])));
    },
    put: (key: string, value: unknown) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    delete: (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) entries.delete(k);
      return Promise.resolve();
    },
    deleteAll: () => {
      entries.clear();
      return Promise.resolve();
    },
  };
}

let YjsProject: new (state: unknown, env: unknown) => { fetch(req: Request): Promise<Response> };
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };

describe('YjsProject DO GET /api/document', () => {
  beforeAll(async () => {
    ({ projectService } = await import('../src/services/project.service'));
    ({ userService } = await import('../src/services/user.service'));
    spyOn(userService, 'findById').mockImplementation((_db: unknown, id: unknown) =>
      Promise.resolve({
        id,
        username: String(id),
        enabled: true,
        approved: true,
        sessionsValidFrom: null,
      })
    );
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

  /** Read `documentId` from a DO whose storage holds `doc` as that document's snapshot. */
  async function readDocument(documentId: string, doc?: Y.Doc): Promise<Record<string, unknown>> {
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    const entries = new Map<string, unknown>();
    if (doc) entries.set(`doc:${documentId}:snapshot`, Y.encodeStateAsUpdate(doc));
    const token = await signJwt({
      userId: 'owner-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const state = {
      storage: makeStorage(entries),
      getWebSockets: () => [],
      setWebSocketAutoResponse: () => {},
    };
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    const res = await doInstance.fetch(
      new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(documentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, unknown>;
  }

  it('returns the project-level shared types of the elements doc', async () => {
    const schema = { id: 'character', name: 'Character', tabs: [{ key: 'bio', fields: [] }] };
    const plan = { id: 'plan-1', name: 'Paperback', items: [{ id: 'i1', type: 'toc' }] };
    const relType = { id: 'rival', name: 'Rival', inverseLabel: 'Rival of' };

    const doc = new Y.Doc();
    doc.getArray('elements').push([{ id: 'e1', name: 'Hero', type: 'WORLDBUILDING' }]);
    doc.getArray('schemas').push([schema]);
    doc.getArray('publishPlans').push([plan]);
    doc.getArray('customRelationshipTypes').push([relType]);
    doc.getMap('projectMeta').set('name', 'My Novel');
    doc.getMap('projectMeta').set('coverMediaId', 'cover-1');

    const data = await readDocument('alice:proj:elements', doc);
    expect(data.schemas).toEqual([schema]);
    expect(data.publishPlans).toEqual([plan]);
    expect(data.customRelationshipTypes).toEqual([relType]);
    expect(data.projectMeta).toEqual({ name: 'My Novel', coverMediaId: 'cover-1' });
    expect(data.elements).toHaveLength(1);
  });

  it("returns a worldbuilding element's schema copy alongside its data", async () => {
    const doc = new Y.Doc();
    doc.getMap('worldbuilding').set('age', '34');
    doc.getMap('identity').set('description', 'A hero');
    doc.getMap('schema').set('baseHash', 'abc123');
    doc.getMap('schema').set('snapshot', { id: 'character', name: 'Character' });

    const data = await readDocument('alice:proj:e1', doc);
    expect(data.worldbuilding).toEqual({ age: '34' });
    expect(data.identity).toEqual({ description: 'A hero' });
    expect(data.schema).toEqual({
      baseHash: 'abc123',
      snapshot: { id: 'character', name: 'Character' },
    });
  });

  it('omits shared types that hold no data', async () => {
    expect(await readDocument('alice:proj:elements')).toEqual({});
  });
});
