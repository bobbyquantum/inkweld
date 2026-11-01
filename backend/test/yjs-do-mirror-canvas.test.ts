import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { readCanvasContents, writeCanvasEdit, type CanvasContents } from '@inkweld/canvas';
import * as Y from 'yjs';

/**
 * POST /api/document with `mirrorCanvas` on the real Durable Object: an edit
 * made on a Worker's copy of the elements document is mirrored onto its element
 * by the object, which is the one place that has the merged canvas. Same
 * cloudflare:workers stub approach as yjs-do-revisions.test.ts.
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
const DOCUMENT = 'alice:proj:elements/';

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

function pin(id: string) {
  return {
    id,
    layerId: 'l1',
    type: 'pin' as const,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    label: id,
    icon: 'place',
    color: '#000',
  };
}

const LAYER = { id: 'l1', name: 'L', visible: true, locked: false, opacity: 1, order: 0 };

let YjsProject: new (state: unknown, env: unknown) => { fetch(req: Request): Promise<Response> };
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };

describe('YjsProject DO mirrorCanvas', () => {
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

  /** A project object whose elements document holds one canvas element. */
  async function projectObject() {
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    const seed = new Y.Doc();
    seed.getArray('elements').push([{ id: 'map', type: 'CANVAS', name: 'Map' }]);
    const entries = new Map<string, unknown>([
      ['doc:alice:proj:elements:snapshot', Y.encodeStateAsUpdate(seed)],
    ]);
    const object = new YjsProject(
      {
        storage: makeStorage(entries),
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
      `https://yjs-do${path}?documentId=${encodeURIComponent(DOCUMENT)}`;
    const headers = { Authorization: `Bearer ${token}` };

    /** What a Worker works on: a copy of the object's current state. */
    async function copy(): Promise<Y.Doc> {
      const response = await object.fetch(new Request(url('/api/document-state'), { headers }));
      expect(response.status).toBe(200);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(await response.arrayBuffer()));
      return doc;
    }

    /** Draw on a copy and post the change, the way `commit()` does. */
    async function post(doc: Y.Doc, id: string, mirrorCanvas?: string): Promise<void> {
      const before = Y.encodeStateVector(doc);
      writeCanvasEdit(Y, doc, 'map', { layers: [LAYER], upserts: [pin(id)] });
      const response = await object.fetch(
        new Request(url('/api/document'), {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yUpdate: toBase64(Y.encodeStateAsUpdate(doc, before)),
            mirrorCanvas,
          }),
        })
      );
      expect(response.status).toBe(200);
    }

    return { copy, post };
  }

  function elementsOf(doc: Y.Doc) {
    return doc.getArray<{ id: string; metadata?: Record<string, string> }>('elements').toArray();
  }

  it('mirrors what the object holds, not what the copy saw', async () => {
    const { copy, post } = await projectObject();
    const first = await copy();
    const second = await copy();

    await post(first, 'one');
    await post(second, 'two', 'map');

    const after = await copy();
    const contents = readCanvasContents(after, 'map') as CanvasContents;
    expect(contents.objects.map((o) => o.id).sort()).toEqual(['one', 'two']);
    const [element] = elementsOf(after);
    expect(JSON.parse(element.metadata?.canvasConfig ?? '{}')).toEqual(contents);
  });

  it('keeps one element when overlapping edits each ask for a mirror', async () => {
    const { copy, post } = await projectObject();
    const first = await copy();
    const second = await copy();

    await Promise.all([post(first, 'one', 'map'), post(second, 'two', 'map')]);

    const after = await copy();
    const elements = elementsOf(after);
    expect(elements).toHaveLength(1);
    expect(JSON.parse(elements[0].metadata?.canvasConfig ?? '{}')).toEqual(
      readCanvasContents(after, 'map')
    );
  });

  it('leaves the element alone unless asked', async () => {
    const { copy, post } = await projectObject();
    await post(await copy(), 'one');
    expect(elementsOf(await copy())[0].metadata).toBeUndefined();
  });
});
