import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

/**
 * Close-code contract tests for the Yjs Durable Object's denial paths.
 *
 * y-websocket 3.1 classifies server close codes: 4400-4499 is the permanent
 * band (the client stops reconnecting and emits `closed`), 4500-4599 is the
 * transient "try again later" band. The frontend relies on that split (see
 * frontend/src/app/services/sync/access-denial.ts), so every DO denial path
 * must emit the exact code this file pins down — a hard denial drifting out
 * of the 44xx band would let y-websocket storm the DO again, and a transient
 * failure drifting into it would bench healthy clients until refresh.
 *
 * The DO base class lives in `cloudflare:workers`, which Bun can't import, so
 * the module is stubbed before the DO is loaded and the class is exercised
 * directly with fake WebSockets (the same approach as ws-guards.test.ts).
 */

mock.module('cloudflare:workers', () => ({
  // The real base class exposes `ctx`/`env` as instance fields; the DO reads
  // `this.env`, so the stub must assign them.
  DurableObject: class DurableObjectStub {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
// Workers global used by the DO constructor for the presence keepalive
// auto-response.
(globalThis as Record<string, unknown>).WebSocketRequestResponsePair = class {
  constructor(
    _request: string,
    _response: string
  ) {}
};

const SECRET = 'test-database-key-long-enough-for-hmac-32';

interface FakeWebSocket {
  readyState: number;
  sent: string[];
  closes: Array<{ code?: number; reason?: string }>;
  attachment: unknown;
  send: (message: string) => void;
  close: (code?: number, reason?: string) => void;
  serializeAttachment: (attachment: unknown) => void;
  deserializeAttachment: () => unknown;
}

function makeWs(): FakeWebSocket {
  const ws: FakeWebSocket = {
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

function makeConnInfo(documentId: string): unknown {
  return {
    documentId,
    authenticated: false,
    userId: undefined,
    username: undefined,
    canWrite: false,
    pendingMessages: [],
    awarenessClientIds: new Set(),
    sharedDoc: undefined,
  };
}

/**
 * Sign a JWT the same way the backend does (HMAC-SHA256 over
 * `header.payload`), so the DO's own verifyToken accepts it.
 */
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
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${header}.${body}`)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${header}.${body}.${sigB64}`;
}

// Loaded in beforeAll, AFTER the cloudflare:workers stub above is in place.
let YjsProject: new (state: unknown, env: unknown) => unknown;
let projectService: {
  findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown>;
};
let collaborationService: {
  checkAccess: (...args: unknown[]) => Promise<unknown>;
};
let closeCodes: typeof import('../src/utils/ws-close-codes');

function makeDO(env: Record<string, unknown> = {}): Record<string, unknown> {
  const state = {
    storage: {},
    setWebSocketAutoResponse: () => {},
  };
  return new YjsProject(state, { DATABASE_KEY: SECRET, ...env }) as unknown as Record<
    string,
    unknown
  >;
}

function callAuth(
  doInstance: Record<string, unknown>,
  ws: FakeWebSocket,
  connInfo: unknown,
  token: string
): Promise<void> {
  return (
    doInstance as unknown as {
      handleAuthMessage: (ws: unknown, connInfo: unknown, token: string) => Promise<void>;
    }
  ).handleAuthMessage(ws, connInfo, token);
}

function callMessage(
  doInstance: Record<string, unknown>,
  ws: FakeWebSocket,
  message: string
): Promise<void> {
  return (
    doInstance as unknown as {
      webSocketMessage: (ws: unknown, message: string) => Promise<void>;
    }
  ).webSocketMessage(ws, message);
}

describe('YjsProject DO denial close codes', () => {
  beforeAll(async () => {
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ projectService } = await import('../src/services/project.service'));
    ({ collaborationService } = await import('../src/services/collaboration.service'));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: new (state: unknown, env: unknown) => unknown;
    });
  });

  afterEach(() => {
    // Service spies are per-test; always restore so the singleton objects
    // don't leak mocks into other test files.
    try {
      (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
      (collaborationService.checkAccess as ReturnType<typeof spyOn>).mockRestore?.();
    } catch {
      // Not spied in every test.
    }
  });

  it('closes invalid-token with the permanent 4401 code', async () => {
    const doInstance = makeDO();
    const ws = makeWs();

    await callAuth(doInstance, ws, makeConnInfo('alice:proj:elements'), 'not-a-jwt');

    expect(ws.sent).toEqual(['access-denied:invalid-token']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_INVALID_TOKEN, reason: 'Invalid token' },
    ]);
  });

  it('closes invalid-document with the permanent 4400 code', async () => {
    const doInstance = makeDO();
    const ws = makeWs();
    const token = await signJwt({
      sub: 'user-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    // No colon in the documentId -> parseDocumentOwner fails.
    await callAuth(doInstance, ws, makeConnInfo('malformed'), token);

    expect(ws.sent).toEqual(['access-denied:invalid-document']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_INVALID_DOCUMENT, reason: 'Invalid document ID' },
    ]);
  });

  it('closes legacy (no D1) forbidden with the permanent 4403 code', async () => {
    // No env.DB -> getDb() returns null -> owner-only legacy check.
    const doInstance = makeDO();
    const ws = makeWs();
    const token = await signJwt({
      sub: 'user-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await callAuth(doInstance, ws, makeConnInfo('bob:proj:elements'), token);

    expect(ws.sent).toEqual(['access-denied:forbidden']);
    expect(ws.closes).toEqual([{ code: closeCodes.WS_CLOSE_FORBIDDEN, reason: 'Access denied' }]);
  });

  it('closes project-not-found with the permanent 4404 code', async () => {
    const doInstance = makeDO({ DB: {} });
    const ws = makeWs();
    const token = await signJwt({
      sub: 'user-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue(undefined);

    await callAuth(doInstance, ws, makeConnInfo('alice:missing:elements'), token);

    expect(ws.sent).toEqual(['access-denied:project-not-found']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_PROJECT_NOT_FOUND, reason: 'Project not found' },
    ]);
  });

  it('closes D1 forbidden with the permanent 4403 code', async () => {
    const doInstance = makeDO({ DB: {} });
    const ws = makeWs();
    const token = await signJwt({
      sub: 'user-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'someone-else',
    });
    spyOn(collaborationService, 'checkAccess').mockResolvedValue({
      isOwner: false,
      canRead: false,
      canWrite: false,
      role: null,
    });

    await callAuth(doInstance, ws, makeConnInfo('bob:proj:elements'), token);

    expect(ws.sent).toEqual(['access-denied:forbidden']);
    expect(ws.closes).toEqual([{ code: closeCodes.WS_CLOSE_FORBIDDEN, reason: 'Access denied' }]);
  });

  it('closes server-side auth failures with the transient 4500 code', async () => {
    const doInstance = makeDO({ DB: {} });
    const ws = makeWs();
    const token = await signJwt({
      sub: 'user-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    spyOn(projectService, 'findByUsernameAndSlug').mockRejectedValue(
      new Error('D1 exploded')
    );

    await callAuth(doInstance, ws, makeConnInfo('alice:proj:elements'), token);

    // A server-side failure says nothing about this client's access, so it
    // must stay transient (45xx) — the client keeps retrying with backoff.
    expect(ws.sent).toEqual(['access-denied:error']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_SERVER_ERROR, reason: 'Authentication error' },
    ]);
  });

  it('closes rate-limited reconnects with the transient 4529 code', async () => {
    const doInstance = makeDO();
    const ws = makeWs();
    const token = await signJwt({
      sub: 'user-1',
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    // Saturate the sliding window: 3 recent attempts -> the next one is
    // denied inside its 5s cooldown.
    const now = Date.now();
    (doInstance as unknown as { lastWsAcceptMs: Map<string, number[]> }).lastWsAcceptMs.set(
      'alice:proj:elements',
      [now - 1000, now - 900, now - 800]
    );

    await callAuth(doInstance, ws, makeConnInfo('alice:proj:elements'), token);

    // Auth itself succeeds first; the throttle fires afterwards.
    expect(ws.sent).toEqual(['authenticated', 'access-denied:rate-limited']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_RATE_LIMITED, reason: 'access-denied:rate-limited' },
    ]);
  });

  it('closes unknown connections with the transient 4500 code', async () => {
    const doInstance = makeDO();
    const ws = makeWs(); // no attachment -> rehydrateConnection returns null

    await callMessage(doInstance, ws, 'anything');

    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_SERVER_ERROR, reason: 'Unknown connection' },
    ]);
  });

  it('closes message-handling errors with the transient 4500 code', async () => {
    const doInstance = makeDO();
    const ws = makeWs();
    ws.deserializeAttachment = () => {
      throw new Error('corrupt attachment');
    };

    await callMessage(doInstance, ws, 'anything');

    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_SERVER_ERROR, reason: 'Message handling error' },
    ]);
  });
});
