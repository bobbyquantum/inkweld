import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { Context } from 'hono';
import { createEncoder, toUint8Array, writeVarUint } from 'lib0/encoding';
import { writeUpdate } from 'y-protocols/sync';
import * as Y from 'yjs';
import type { AppContext } from '../src/types/context';
import { createObjectBucket } from './r2-bucket-mock';

/**
 * Project rename and data removal on Cloudflare Workers, run against real
 * YjsProject Durable Object instances (behind a fake namespace, each with in-memory storage) and
 * an in-memory R2 bucket. Same cloudflare:workers stub as the other
 * yjs-do-*.test.ts files.
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

/** Durable Object storage in memory, with the real `list` ordering and paging. */
function memoryStorage() {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async list<T>(opts: {
      prefix: string;
      limit?: number;
      startAfter?: string;
      reverse?: boolean;
    }) {
      const keys = [...data.keys()]
        .filter((k) => k.startsWith(opts.prefix) && (!opts.startAfter || k > opts.startAfter))
        .sort();
      if (opts.reverse) keys.reverse();
      return new Map(keys.slice(0, opts.limit ?? Infinity).map((k) => [k, data.get(k) as T]));
    },
    async put<T>(key: string, value: T) {
      data.set(key, value);
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    },
    async deleteAll() {
      data.clear();
    },
  };
}

type DoInstance = { fetch(request: Request): Promise<Response> };

let YjsProject: new (state: unknown, env: unknown) => DoInstance;
let moveProjectData: typeof import('../src/services/project-data.service').moveProjectData;
let removeProjectData: typeof import('../src/services/project-data.service').removeProjectData;
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let collaborationService: { checkAccess: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };
let closeCodes: typeof import('../src/utils/ws-close-codes');

/** A namespace that creates one real Durable Object per name, on demand. */
function durableObjects() {
  const storages = new Map<string, ReturnType<typeof memoryStorage>>();
  const instances = new Map<string, DoInstance>();
  const instance = (name: string): DoInstance => {
    let found = instances.get(name);
    if (!found) {
      const storage = memoryStorage();
      storages.set(name, storage);
      found = new YjsProject(
        { storage, getWebSockets: () => [], setWebSocketAutoResponse: () => {} },
        { DATABASE_KEY: SECRET, DB: {} }
      );
      instances.set(name, found);
    }
    return found;
  };
  const storage = (name: string) => {
    instance(name);
    const found = storages.get(name);
    if (!found) throw new Error(`No storage for ${name}`);
    return found;
  };
  const namespace = {
    idFromName: (name: string) => ({ name }),
    get: (id: { name: string }) => ({
      fetch: (request: Request) => instance(id.name).fetch(request),
    }),
  };
  return { namespace, instance, storage };
}

/** A prose document's snapshot plus one later edit stored as an update row. */
function proseRows(text: string, more: string): { snapshot: Uint8Array; frame: Uint8Array } {
  const doc = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  const content = new Y.XmlText(text);
  paragraph.insert(0, [content]);
  doc.getXmlFragment('prosemirror').insert(0, [paragraph]);
  const snapshot = Y.encodeStateAsUpdate(doc);
  let update = new Uint8Array();
  doc.once('update', (u: Uint8Array) => {
    update = u;
  });
  content.insert(text.length, more);
  const encoder = createEncoder();
  writeVarUint(encoder, 0); // sync message
  writeUpdate(encoder, update);
  return { snapshot, frame: toUint8Array(encoder) };
}

describe('Project data on Workers', () => {
  let token: string;
  /** The slug the fake database currently has for alice's project. */
  let slugInDatabase: string;
  let objects: ReturnType<typeof durableObjects>;
  let files: ReturnType<typeof createObjectBucket>;

  beforeAll(async () => {
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ projectService } = await import('../src/services/project.service'));
    ({ collaborationService } = await import('../src/services/collaboration.service'));
    ({ userService } = await import('../src/services/user.service'));
    ({ moveProjectData, removeProjectData } = await import('../src/services/project-data.service'));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
    token = await signJwt({
      userId: 'owner-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  beforeEach(() => {
    slugInDatabase = 'old';
    spyOn(projectService, 'findByUsernameAndSlug').mockImplementation(
      async (_db: unknown, username: unknown, slug: unknown) =>
        slug === slugInDatabase ? { id: 'project-1', userId: 'owner-1', slug, username } : undefined
    );
    spyOn(userService, 'findById').mockImplementation(async (_db: unknown, id: unknown) => ({
      id,
      enabled: true,
      approved: true,
      sessionsValidFrom: null,
    }));

    objects = durableObjects();
    const old = objects.storage('alice:old');
    const { snapshot, frame } = proseRows('Hello from the server', ', twice');
    old.data.set('doc:alice:old:doc-1:snapshot', snapshot);
    old.data.set('doc:alice:old:doc-1:update:1700000000000:00000000:aa', frame);
    old.data.set('doc:alice:old:elements:snapshot', Y.encodeStateAsUpdate(new Y.Doc()));
    files = createObjectBucket();
    files.seed('alice/old/media/pic.png', 'PNG', 'image/png');
    files.seed('alice/old/cover.jpg', 'JPG', 'image/jpeg');
  });

  afterEach(() => {
    (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
    (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
    try {
      (collaborationService.checkAccess as ReturnType<typeof spyOn>).mockRestore?.();
    } catch {
      // Not spied in every test.
    }
  });

  function context(): Context<AppContext> {
    return {
      env: { YJS_PROJECTS: objects.namespace },
      req: { header: (name: string) => (name === 'Authorization' ? `Bearer ${token}` : undefined) },
      get: (key: string) => (key === 'storage' ? files.bucket : undefined),
    } as unknown as Context<AppContext>;
  }

  function request(
    slug: string,
    path: string,
    init: { method?: string; query?: Record<string, string> } = {}
  ): Promise<Response> {
    const url = new URL(`https://yjs-do${path}`);
    url.searchParams.set('documentId', `alice:${slug}:doc-1`);
    for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
    return objects.instance(`alice:${slug}`).fetch(
      new Request(url.href, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
    );
  }

  async function documentXml(slug: string): Promise<string> {
    const response = await request(slug, '/api/document');
    expect(response.status).toBe(200);
    return ((await response.json()) as { prosemirror?: string }).prosemirror ?? '';
  }

  it('moves documents and files to the new slug, then wipes the old object', async () => {
    const commit = mock(async () => {
      slugInDatabase = 'new';
    });

    await moveProjectData(context(), 'alice', 'old', 'new', commit);

    expect(commit).toHaveBeenCalledTimes(1);
    expect([...objects.storage('alice:new').data.keys()].sort()).toEqual([
      'doc:alice:new:doc-1:snapshot',
      'doc:alice:new:doc-1:update:1700000000000:00000000:aa',
      'doc:alice:new:elements:snapshot',
    ]);
    expect(objects.storage('alice:old').data.size).toBe(0);
    expect(await documentXml('new')).toContain('Hello from the server, twice');
    expect([...files.store.keys()].sort()).toEqual([
      'alice/new/cover.jpg',
      'alice/new/media/pic.png',
    ]);
  });

  it('replaces whatever a previous project left in the new object', async () => {
    objects.storage('alice:new').data.set('doc:alice:new:stale:snapshot', new Uint8Array([1]));

    await moveProjectData(context(), 'alice', 'old', 'new', async () => {
      slugInDatabase = 'new';
    });

    expect(objects.storage('alice:new').data.has('doc:alice:new:stale:snapshot')).toBe(false);
    expect(objects.storage('alice:new').data.size).toBe(3);
  });

  it("clears what an earlier project left under a new project's slug", async () => {
    // A project created as alice/old, where a rename made before renames
    // moved the Durable Object left the old object and files behind.
    files.seed('alice/old-two/media/keep.png', 'PNG');

    await removeProjectData(context(), 'alice', 'old');

    expect(objects.storage('alice:old').data.size).toBe(0);
    expect(await documentXml('old')).toBe('');
    expect([...files.store.keys()]).toEqual(['alice/old-two/media/keep.png']);
  });

  it('fails when the Durable Object will not be cleared', async () => {
    // Only the project's owner may wipe its object, and only while it exists.
    slugInDatabase = 'elsewhere';

    await expect(removeProjectData(context(), 'alice', 'old')).rejects.toThrow(
      'Failed to remove project documents (404)'
    );
    expect(objects.storage('alice:old').data.size).toBe(3);
  });

  it('puts everything back when the database update fails', async () => {
    const before = new Map(objects.storage('alice:old').data);

    await expect(
      moveProjectData(context(), 'alice', 'old', 'new', async () => {
        throw new Error('database down');
      })
    ).rejects.toThrow('database down');

    expect(objects.storage('alice:old').data).toEqual(before);
    expect(objects.storage('alice:new').data.size).toBe(0);
    expect([...files.store.keys()].sort()).toEqual([
      'alice/old/cover.jpg',
      'alice/old/media/pic.png',
    ]);
    // Unlocked: the project serves its documents again.
    expect(await documentXml('old')).toContain('Hello from the server, twice');
  });

  it('puts the documents back when moving the files fails', async () => {
    files.options.failPutAfter = 0;

    await expect(
      moveProjectData(context(), 'alice', 'old', 'new', async () => {
        slugInDatabase = 'new';
      })
    ).rejects.toThrow('Too many subrequests');

    expect(slugInDatabase).toBe('old');
    expect(objects.storage('alice:new').data.size).toBe(0);
    expect(objects.storage('alice:old').data.size).toBe(3);
    expect([...files.store.keys()].sort()).toEqual([
      'alice/old/cover.jpg',
      'alice/old/media/pic.png',
    ]);
  });

  describe('while the old object is locked', () => {
    const rename = { from: 'old', to: 'new' };

    it('refuses reads and new sockets, and only exports while locked', async () => {
      const notLocked = await request('old', '/api/rename/export', { query: rename });
      expect(notLocked.status).toBe(409);

      const lock = await request('old', '/api/rename/lock', { method: 'POST', query: rename });
      expect(lock.status).toBe(200);

      expect((await request('old', '/api/document')).status).toBe(423);

      const ws = {
        readyState: WebSocket.OPEN,
        sent: [] as string[],
        closes: [] as Array<{ code?: number; reason?: string }>,
        send(message: string) {
          ws.sent.push(message);
        },
        close(code?: number, reason?: string) {
          ws.closes.push({ code, reason });
        },
        serializeAttachment() {},
      };
      const internals = objects.instance('alice:old') as unknown as {
        handleAuthMessage(ws: unknown, connInfo: unknown, token: string): Promise<void>;
      };
      await internals.handleAuthMessage(
        ws,
        { documentId: 'alice:old:doc-1', authenticated: false, awarenessClientIds: new Set() },
        token
      );
      expect(ws.sent).toEqual(['access-denied:error']);
      expect(ws.closes).toEqual([
        { code: closeCodes.WS_CLOSE_SERVER_ERROR, reason: 'Project is being renamed' },
      ]);

      const unlock = await request('old', '/api/rename/unlock', { method: 'POST', query: rename });
      expect(unlock.status).toBe(200);
      expect((await request('old', '/api/document')).status).toBe(200);
    });
  });

  describe('rename step authorization', () => {
    const rename = { from: 'old', to: 'new' };

    it('only wipes the old object once the database has the new slug', async () => {
      const early = await request('old', '/api/rename/complete', { method: 'POST', query: rename });
      expect(early.status).toBe(409);
      expect(objects.storage('alice:old').data.size).toBe(3);
    });

    it('never imports into a slug another project already has', async () => {
      const otherProjectSlugs = new Set(['old', 'new']);
      (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockImplementation(
        async (_db: unknown, username: unknown, slug: unknown) =>
          otherProjectSlugs.has(slug as string)
            ? { id: `project-${String(slug)}`, userId: 'owner-1', slug, username }
            : undefined
      );
      const discard = await request('new', '/api/rename/discard', {
        method: 'POST',
        query: rename,
      });
      expect(discard.status).toBe(409);
    });

    it('refuses an editor and a step sent to the wrong object', async () => {
      spyOn(collaborationService, 'checkAccess').mockResolvedValue({
        isOwner: false,
        isCollaborator: true,
        role: 'editor',
        canRead: true,
        canWrite: true,
        canAdmin: false,
      });
      const editorToken = await signJwt({
        userId: 'editor-1',
        username: 'ed',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const asEditor = await objects
        .instance('alice:old')
        .fetch(
          new Request(
            'https://yjs-do/api/rename/lock?documentId=alice:old:elements&from=old&to=new',
            { method: 'POST', headers: { Authorization: `Bearer ${editorToken}` } }
          )
        );
      expect(asEditor.status).toBe(403);

      const wrongObject = await request('new', '/api/rename/lock', {
        method: 'POST',
        query: rename,
      });
      expect(wrongObject.status).toBe(400);
    });
  });
});
