import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import { Y_MESSAGE_PRESENCE } from '@inkweld/presence';

/**
 * Sockets that were attached to a document before the Durable Object
 * hibernated must be re-attached when it wakes, whatever wakes it.
 *
 * Regression: a binary presence frame woke the object with `skipDocLoad`, so
 * the socket was recorded without a document. Every later frame found that
 * cached entry and was dropped ("No document state"), and nothing was
 * broadcast to the socket. An HTTP request (an MCP write) that woke the object
 * didn't re-attach sleeping sockets either. The app kept editing a local copy
 * the server never saw while MCP edited the server's, and the two whole-array
 * rewrites merged into duplicated folders once the user refreshed.
 *
 * Same cloudflare:workers stub approach as yjs-do-get-document.test.ts.
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
const DOC_ID = 'alice:proj:elements';
const Y_MESSAGE_SYNC = 0;

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

/** A socket Cloudflare kept open while the object hibernated. */
function makeHibernatedSocket() {
  const sent: unknown[] = [];
  const closes: { code?: number; reason?: string }[] = [];
  return {
    sent,
    closes,
    readyState: WebSocket.OPEN,
    send(data: unknown) {
      sent.push(data);
    },
    close(code?: number, reason?: string) {
      closes.push({ code, reason });
    },
    serializeAttachment() {},
    deserializeAttachment() {
      return {
        documentId: DOC_ID,
        authenticated: true,
        userId: 'owner-1',
        username: 'alice',
        canWrite: true,
      };
    },
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** A sync update frame adding one element, as the app sends on a create. */
function elementUpdateFrame(id: string): ArrayBuffer {
  const source = new Y.Doc();
  source.getArray('elements').push([{ id, name: id, type: 'ITEM', level: 0, order: 0 }]);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(source));
  return toArrayBuffer(encoding.toUint8Array(encoder));
}

/** A presence frame: the outer tag is all the object reads before rehydrating. */
function presenceFrame(): ArrayBuffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_PRESENCE);
  encoding.writeVarUint(encoder, 0);
  return toArrayBuffer(encoding.toUint8Array(encoder));
}

interface DoInstance {
  fetch(req: Request): Promise<Response>;
  webSocketMessage(ws: unknown, message: ArrayBuffer | string): Promise<void>;
  documents: Map<string, Promise<Y.Doc>>;
  connections: Map<unknown, Record<string, unknown>>;
  dispatchAuthenticatedFrame(ws: unknown, connInfo: unknown, message: ArrayBuffer): void;
}

let YjsProject: new (state: unknown, env: unknown) => DoInstance;
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };

describe('YjsProject DO re-attaches hibernated sockets on wake', () => {
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

  afterAll(() => {
    (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
  });

  afterEach(() => {
    (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
  });

  /** A freshly woken object (empty in-memory state) with one sleeping socket. */
  function wakeWithSocket() {
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    const seed = new Y.Doc();
    seed.getArray('elements').push([{ id: 'act-1', name: 'Act 1', type: 'FOLDER', level: 0 }]);
    const entries = new Map<string, unknown>([
      [`doc:${DOC_ID}:snapshot`, Y.encodeStateAsUpdate(seed)],
    ]);
    const ws = makeHibernatedSocket();
    const state = {
      storage: makeStorage(entries),
      getWebSockets: () => [ws],
      setWebSocketAutoResponse: () => {},
    };
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    return { doInstance, ws };
  }

  async function elementIds(doInstance: DoInstance): Promise<string[]> {
    const doc = await doInstance.documents.get(DOC_ID);
    return (doc?.getArray('elements').toArray() ?? []).map((e) => (e as { id: string }).id);
  }

  async function replaceAll(doInstance: DoInstance, elements: unknown[]): Promise<void> {
    const token = await signJwt({
      userId: 'owner-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await doInstance.fetch(
      new Request(`https://yjs-do/api/elements?documentId=${encodeURIComponent(DOC_ID)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'replace_all', elements }),
      })
    );
    expect(res.status).toBe(200);
  }

  const binarySends = (ws: { sent: unknown[] }) =>
    ws.sent.filter((m) => typeof m !== 'string').length;

  it('applies updates sent after a presence frame woke the object', async () => {
    const { doInstance, ws } = wakeWithSocket();

    await doInstance.webSocketMessage(ws, presenceFrame());
    await doInstance.webSocketMessage(ws, elementUpdateFrame('quinara'));

    expect(await elementIds(doInstance)).toContain('quinara');
    expect(ws.closes).toEqual([]);
  });

  it('broadcasts to the socket after a presence-frame wake, exactly once per update', async () => {
    const { doInstance, ws } = wakeWithSocket();

    await doInstance.webSocketMessage(ws, presenceFrame());
    await doInstance.webSocketMessage(ws, elementUpdateFrame('quinara'));
    const before = binarySends(ws);

    await replaceAll(doInstance, [{ id: 'act-1', name: 'Act 1', type: 'FOLDER', level: 0 }]);

    expect(binarySends(ws) - before).toBe(1);
  });

  it('broadcasts an HTTP write that woke the object to the sleeping socket', async () => {
    const { doInstance, ws } = wakeWithSocket();

    await replaceAll(doInstance, [
      { id: 'act-1', name: 'Act 1', type: 'FOLDER', level: 0 },
      { id: 'nessa', name: 'Nessa', type: 'WORLDBUILDING', level: 0 },
    ]);

    expect(binarySends(ws)).toBe(1);

    // The socket's own frames reach the document too, without a second
    // subscription (one broadcast per later update).
    await doInstance.webSocketMessage(ws, elementUpdateFrame('quinara'));
    expect(await elementIds(doInstance)).toContain('quinara');
    const before = binarySends(ws);
    await replaceAll(doInstance, [{ id: 'act-1', name: 'Act 1', type: 'FOLDER', level: 0 }]);
    expect(binarySends(ws) - before).toBe(1);
  });

  it('closes a socket with no document instead of dropping its frame', () => {
    const { doInstance, ws } = wakeWithSocket();
    const connInfo = {
      documentId: DOC_ID,
      authenticated: true,
      canWrite: true,
      userId: 'owner-1',
      pendingMessages: [],
      awarenessClientIds: new Set(),
    };
    doInstance.connections.set(ws, connInfo);

    doInstance.dispatchAuthenticatedFrame(ws, connInfo, elementUpdateFrame('lost'));

    expect(ws.closes).toEqual([{ code: 4500, reason: 'Document not attached' }]);
  });
});
