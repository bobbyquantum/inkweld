import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as Y from 'yjs';

/**
 * Relationship fields on Cloudflare Workers. A Worker edits a copy of the
 * project elements document and sends the change to the project Durable
 * Object, so two concurrent `update_worldbuilding` calls on one
 * `multiple: false` field, each planning on its own copy, would each add a
 * link and both links would survive the merge. The object's `reconcile`
 * relationships action plans on its shared document instead, which
 * serialises them. Same cloudflare:workers stub approach as
 * yjs-do-mirror-canvas.test.ts.
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
const ELEMENTS_DOC = 'alice:rising:elements/';
const TYPE_ID = 'fieldrel-made';

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
        .sort((a, b) => a.localeCompare(b));
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
    setAlarm: () => Promise.resolve(),
    getAlarm: () => Promise.resolve(null),
  };
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes));
}

const assetSchema = {
  id: 'asset',
  name: 'Asset',
  icon: 'category',
  description: '',
  version: 1,
  tabs: [
    {
      key: 'general',
      label: 'General',
      fields: [
        {
          key: 'madeWith',
          label: 'Made with',
          type: 'relationship',
          multiple: false,
          relationshipTypeId: TYPE_ID,
        },
      ],
    },
  ],
};

function element(id: string, name: string) {
  return {
    id,
    name,
    type: 'WORLDBUILDING',
    schemaId: 'asset',
    parentId: null,
    level: 0,
    order: 0,
    version: 0,
    metadata: {},
  };
}

function link(id: string, target: string) {
  const at = '2026-11-06T10:10:28.622Z';
  return {
    id,
    sourceElementId: 'tyre',
    targetElementId: target,
    relationshipTypeId: TYPE_ID,
    createdAt: at,
    updatedAt: at,
  };
}

type ObjectInstance = { fetch(req: Request): Promise<Response> };

let YjsProject: new (state: unknown, env: unknown) => ObjectInstance;
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };
let activityService: { record: (...args: unknown[]) => Promise<unknown> };
let handleMcpRequest: (c: never) => Promise<Response>;

describe('YjsProject DO relationship reconcile', () => {
  beforeAll(async () => {
    await import('../src/mcp');
    ({ handleMcpRequest } = (await import('../src/mcp/mcp.handler')) as unknown as {
      handleMcpRequest: typeof handleMcpRequest;
    });
    ({ projectService } = await import('../src/services/project.service'));
    ({ userService } = await import('../src/services/user.service'));
    ({ activityService } = await import('../src/services/activity.service'));
    spyOn(userService, 'findById').mockImplementation((_db: unknown, id: unknown) =>
      Promise.resolve({
        id,
        username: String(id),
        enabled: true,
        approved: true,
        sessionsValidFrom: null,
      })
    );
    spyOn(activityService, 'record').mockResolvedValue(undefined);
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
  });

  // One process runs every test file; do not leak the spies into other suites.
  afterAll(() => {
    (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
    (activityService.record as ReturnType<typeof spyOn>).mockRestore?.();
  });

  afterEach(() => {
    (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
  });

  /**
   * A project object holding a tyre, a buggy and a truck (Assets); the tyre
   * has a single-valued `madeWith` relationship field.
   */
  async function projectObject(relationships: unknown[] = []) {
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    const elements = new Y.Doc();
    elements
      .getArray('elements')
      .push([element('tyre', 'Tyre'), element('buggy', 'Buggy'), element('truck', 'Truck')]);
    elements.getArray('schemas').push([assetSchema]);
    elements.getArray('relationships').push(relationships as never[]);
    const tyre = new Y.Doc();
    tyre.getMap('worldbuilding').set('schemaId', 'asset');
    tyre.getMap('schema').set('snapshot', assetSchema);

    const object = new YjsProject(
      {
        storage: makeStorage(
          new Map<string, unknown>([
            ['doc:alice:rising:elements:snapshot', Y.encodeStateAsUpdate(elements)],
            ['doc:alice:rising:tyre:snapshot', Y.encodeStateAsUpdate(tyre)],
          ])
        ),
        getWebSockets: () => [],
        setWebSocketAutoResponse: () => {},
      },
      { DATABASE_KEY: SECRET, DB: {} }
    );
    const token = await signJwt({
      userId: 'owner-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const url = (path: string) =>
      `https://yjs-do${path}?documentId=${encodeURIComponent(ELEMENTS_DOC)}`;
    const headers = { Authorization: `Bearer ${token}` };

    /** What a Worker works on: a copy of the object's current state. */
    async function copy(): Promise<Y.Doc> {
      const response = await object.fetch(new Request(url('/api/document-state'), { headers }));
      expect(response.status).toBe(200);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(await response.arrayBuffer()));
      return doc;
    }

    function post(body: unknown): Promise<Response> {
      return object.fetch(
        new Request(url('/api/document'), {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    async function links(): Promise<Array<Record<string, unknown>>> {
      return (await copy())
        .getArray<Record<string, unknown>>('relationships')
        .toArray()
        .filter((r) => r.relationshipTypeId === TYPE_ID);
    }

    return { object, token, copy, post, links };
  }

  /**
   * Two concurrent `update_worldbuilding` calls over MCP on Workers. Their
   * writes to the relationships are held until both have been sent, so each
   * call has read the project before either write lands, as two Workers
   * holding copies of the same initial state would.
   */
  async function raceUpdates(
    object: ObjectInstance,
    token: string,
    values: [string, string]
  ): Promise<Array<{ isError?: boolean }>> {
    const held: Array<() => void> = [];
    const namespace = {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        fetch: async (request: Request) => {
          const { pathname, searchParams } = new URL(request.url);
          if (
            request.method === 'POST' &&
            pathname === '/api/document' &&
            searchParams.get('documentId') === ELEMENTS_DOC
          ) {
            const body = (await request.clone().json()) as Record<string, unknown>;
            if (body.relationships || body.yUpdate) {
              await new Promise<void>((release) => {
                held.push(release);
                if (held.length === 2) held.forEach((go) => go());
              });
            }
          }
          return object.fetch(request);
        },
      }),
    };
    const mcpContext = {
      type: 'oauth',
      userId: 'owner-1',
      username: 'alice',
      authToken: token,
      env: { YJS_PROJECTS: namespace },
      grants: [
        {
          projectId: 'project-1',
          username: 'alice',
          slug: 'rising',
          role: 'editor',
          permissions: ['read:elements', 'read:worldbuilding', 'write:worldbuilding'],
        },
      ],
    };
    const call = async (target: string) => {
      const body = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 1,
        params: {
          name: 'update_worldbuilding',
          arguments: { project: 'alice/rising', elementId: 'tyre', fields: { madeWith: target } },
        },
      };
      const c = {
        req: { header: () => undefined, json: () => Promise.resolve(body) },
        get: (key: string) => (key === 'mcpContext' ? mcpContext : {}),
        json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
      };
      const res = await handleMcpRequest(c as never);
      return ((await res.json()) as { result: { isError?: boolean } }).result;
    };
    return Promise.all(values.map(call));
  }

  it('two updates from copies of the same initial state each add a link (the CRDT limit)', async () => {
    const { copy, post, links } = await projectObject();
    const first = await copy();
    const second = await copy();

    // Each Worker plans on its copy: neither sees the other's link
    for (const [doc, target] of [
      [first, 'buggy'],
      [second, 'truck'],
    ] as const) {
      const before = Y.encodeStateVector(doc);
      doc.getArray('relationships').push([link(`r-${target}`, target)]);
      const response = await post({ yUpdate: toBase64(Y.encodeStateAsUpdate(doc, before)) });
      expect(response.status).toBe(200);
    }
    expect(await links()).toHaveLength(2);

    // A reconcile with the field's value keeps one link per wanted target
    const response = await post({
      relationships: {
        action: 'reconcile',
        fields: [{ sourceElementId: 'tyre', relationshipTypeId: TYPE_ID, desiredIds: ['truck'] }],
      },
    });
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: Array<{ added: unknown[]; removed: Array<{ id: string }> }>;
    };
    expect(results[0].added).toEqual([]);
    expect(results[0].removed.map((r) => r.id)).toEqual(['r-buggy']);
    expect((await links()).map((r) => r.id)).toEqual(['r-truck']);
  });

  it('serialises two concurrent update_worldbuilding calls on a single-valued field', async () => {
    const { object, token, links } = await projectObject();

    const results = await raceUpdates(object, token, ['buggy', 'truck']);

    expect(results.map((r) => r.isError)).toEqual([undefined, undefined]);
    const after = await links();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ sourceElementId: 'tyre', relationshipTypeId: TYPE_ID });
    expect(['buggy', 'truck']).toContain(after[0].targetElementId as string);
  });

  it('heals a field left with two links by concurrent copies on its next write', async () => {
    const { object, token, links } = await projectObject([
      link('r-buggy', 'buggy'),
      link('r-truck', 'truck'),
    ]);

    await raceUpdates(object, token, ['truck', 'truck']);

    expect((await links()).map((r) => r.id)).toEqual(['r-truck']);
  });

  it('refuses a malformed reconcile request and leaves the relationships alone', async () => {
    const { post, links } = await projectObject([link('r-buggy', 'buggy')]);

    for (const fields of [undefined, [], [{ sourceElementId: 'tyre', desiredIds: ['truck'] }]]) {
      const response = await post({ relationships: { action: 'reconcile', fields } });
      expect(response.status).toBe(400);
    }
    expect((await links()).map((r) => r.id)).toEqual(['r-buggy']);
  });
});
