import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

/**
 * The Yjs Durable Object reads every document id with the parser the Worker
 * route and the Bun route share. A malformed id is refused on the socket
 * upgrade and on the HTTP API before any socket is accepted or any project is
 * looked up, and every id form real clients send keeps working. Same
 * cloudflare:workers stub approach as yjs-do-get-document.test.ts.
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

function makeStorage() {
  const entries = new Map<string, unknown>();
  return {
    get: (key: string) => Promise.resolve(entries.get(key)),
    list: (opts: { prefix: string; limit?: number; startAfter?: string; reverse?: boolean }) => {
      const keys = [...entries.keys()].filter((k) => k.startsWith(opts.prefix)).sort();
      if (opts.reverse) keys.reverse();
      const sliced = opts.limit === undefined ? keys : keys.slice(0, opts.limit);
      return Promise.resolve(new Map(sliced.map((k) => [k, entries.get(k)])));
    },
    put: (key: string, value: unknown) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    delete: () => Promise.resolve(),
  };
}

interface FakeSocket {
  readyState: number;
  sent: string[];
  closes: Array<{ code?: number; reason?: string }>;
  attachment: unknown;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(attachment: unknown): void;
  deserializeAttachment(): unknown;
}

function makeWs(): FakeSocket {
  const ws: FakeSocket = {
    readyState: WebSocket.OPEN,
    sent: [],
    closes: [],
    attachment: null,
    send(message: string) {
      ws.sent.push(message);
    },
    close(code?: number, reason?: string) {
      ws.closes.push({ code, reason });
      ws.readyState = WebSocket.CLOSED;
    },
    serializeAttachment(attachment: unknown) {
      ws.attachment = attachment;
    },
    deserializeAttachment() {
      return ws.attachment;
    },
  };
  return ws;
}

interface DoInstance {
  fetch(request: Request): Promise<Response>;
  handleHttpApi(request: Request, url: URL): Promise<Response>;
  handleAuthMessage(ws: unknown, connInfo: unknown, token: string): Promise<void>;
  projectKeyForDocumentId(documentId: string): string | null;
  isElementsDocumentId(documentId: string): boolean;
}

let YjsProject: new (state: unknown, env: unknown) => DoInstance;
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };
let closeCodes: typeof import('../src/utils/ws-close-codes');

/** A Durable Object whose accepted sockets are recorded with their tags. */
function makeDO(env: Record<string, unknown> = {}) {
  const accepted: Array<{ ws: FakeSocket; tags: string[] }> = [];
  const state = {
    storage: makeStorage(),
    getWebSockets: () => accepted.map((a) => a.ws),
    acceptWebSocket: (ws: FakeSocket, tags: string[]) => accepted.push({ ws, tags }),
    setWebSocketAutoResponse: () => {},
  };
  const instance = new YjsProject(state, { DATABASE_KEY: SECRET, ...env });
  return { instance, accepted };
}

const MALFORMED_IDS = [
  'alice:proj',
  'alice:proj:',
  'alice:proj:/',
  'alice:proj:elements//',
  'alice::elements',
  ':proj:elements',
  'malformed',
];

const VALID_IDS: Array<{ id: string; bare: string }> = [
  { id: 'alice:proj:elements', bare: 'alice:proj:elements' },
  { id: 'alice:proj:elements/', bare: 'alice:proj:elements' },
  { id: 'alice:proj:doc-1', bare: 'alice:proj:doc-1' },
  { id: 'alice:proj:doc-1/', bare: 'alice:proj:doc-1' },
];

function upgradeRequest(documentId: string): Request {
  return new Request(`https://yjs-do/api/v1/ws/yjs?documentId=${encodeURIComponent(documentId)}`, {
    headers: { Upgrade: 'websocket' },
  });
}

async function ownerToken(): Promise<string> {
  return signJwt({
    userId: 'owner-1',
    username: 'alice',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

/** `GET /api/document` for each id, signed in as the owner; returns each status. */
async function getDocumentStatuses(
  instance: DoInstance,
  ids: string[]
): Promise<Array<{ id: string; status: number }>> {
  const headers = { Authorization: `Bearer ${await ownerToken()}` };
  return Promise.all(
    ids.map(async (id) => {
      const res = await instance.fetch(
        new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(id)}`, {
          headers,
        })
      );
      return { id, status: res.status };
    })
  );
}

describe('YjsProject DO document ids', () => {
  beforeAll(async () => {
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ projectService } = await import('../src/services/project.service'));
    ({ userService } = await import('../src/services/user.service'));
    spyOn(userService, 'findById').mockImplementation((_db: unknown, id: unknown) =>
      Promise.resolve({ id, enabled: true, approved: true, sessionsValidFrom: null })
    );
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
  });

  // One process runs every test file; do not leak spies into other suites.
  afterAll(() => {
    (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
  });

  afterEach(() => {
    (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
  });

  describe('socket upgrade', () => {
    it('refuses a malformed id before accepting a socket', async () => {
      const { instance, accepted } = makeDO();
      const statuses = await Promise.all(
        MALFORMED_IDS.map(async (id) => ({
          id,
          status: (await instance.fetch(upgradeRequest(id))).status,
        }))
      );
      expect(statuses).toEqual(MALFORMED_IDS.map((id) => ({ id, status: 400 })));
      expect(accepted).toEqual([]);
    });

    it('accepts every id form real clients send, tracked without the trailing slash', async () => {
      const globals = globalThis as Record<string, unknown>;
      const hadPair = 'WebSocketPair' in globals;
      const savedPair = globals.WebSocketPair;
      globals.WebSocketPair = class {
        constructor() {
          return [makeWs(), makeWs()];
        }
      };
      try {
        const results = await Promise.all(
          VALID_IDS.map(async ({ id, bare }) => {
            const { instance, accepted } = makeDO();
            const res = await instance.fetch(upgradeRequest(id));
            return { id, bare, status: res.status, accepted };
          })
        );
        for (const { id, bare, status, accepted } of results) {
          expect({ id, status }).toEqual({ id, status: 101 });
          expect(accepted).toHaveLength(1);
          expect(accepted[0].tags).toEqual([bare]);
          expect((accepted[0].ws.attachment as { documentId: string }).documentId).toBe(bare);
        }
      } finally {
        if (hadPair) globals.WebSocketPair = savedPair;
        else delete globals.WebSocketPair;
      }
    });
  });

  describe('HTTP API', () => {
    it('refuses a malformed id before looking the project up', async () => {
      const { instance } = makeDO({ DB: {} });
      const lookup = spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
        id: 'project-1',
        userId: 'owner-1',
      });
      const statuses = await getDocumentStatuses(instance, MALFORMED_IDS);
      expect(statuses).toEqual(MALFORMED_IDS.map((id) => ({ id, status: 400 })));
      expect(lookup).not.toHaveBeenCalled();
    });

    it('serves every id form real clients send', async () => {
      const { instance } = makeDO({ DB: {} });
      spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
        id: 'project-1',
        userId: 'owner-1',
      });
      const ids = VALID_IDS.map(({ id }) => id);
      const statuses = await getDocumentStatuses(instance, ids);
      expect(statuses).toEqual(ids.map((id) => ({ id, status: 200 })));
    });

    it('answers 500 when a handler rejects, instead of rejecting the request', async () => {
      const { instance } = makeDO();
      instance.handleHttpApi = () => Promise.reject(new Error('simulated failure'));
      const res = await instance.fetch(new Request('https://yjs-do/api/document'));
      expect(res.status).toBe(500);
    });
  });

  describe('sign-in and presence', () => {
    it('refuses an owner:slug id at sign-in with the permanent invalid-document code', async () => {
      const { instance } = makeDO();
      const ws = makeWs();
      const connInfo = {
        documentId: 'alice:proj',
        authenticated: false,
        canWrite: false,
        pendingMessages: [],
        awarenessClientIds: new Set(),
      };

      await instance.handleAuthMessage(ws, connInfo, await ownerToken());

      expect(ws.sent).toEqual(['access-denied:invalid-document']);
      expect(ws.closes).toEqual([
        { code: closeCodes.WS_CLOSE_INVALID_DOCUMENT, reason: 'Invalid document ID' },
      ]);
    });

    it('scopes presence to the first two segments and only to the elements tree', () => {
      const { instance } = makeDO();
      expect(instance.projectKeyForDocumentId('alice:proj:elements')).toBe('alice:proj');
      expect(instance.projectKeyForDocumentId('worldbuilding:alice:proj:elements')).toBe(
        'worldbuilding:alice'
      );
      expect(instance.projectKeyForDocumentId('alice:proj')).toBeNull();
      expect(instance.isElementsDocumentId('alice:proj:elements')).toBe(true);
      expect(instance.isElementsDocumentId('alice:proj:elements/')).toBe(true);
      expect(instance.isElementsDocumentId('alice:proj:doc:elements')).toBe(false);
      expect(instance.isElementsDocumentId('alice:proj')).toBe(false);
    });
  });
});
