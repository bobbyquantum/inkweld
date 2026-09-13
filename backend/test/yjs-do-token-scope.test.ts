import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

/**
 * Token-scope tests for the Yjs Durable Object's auth handshake.
 *
 * The DO shares a signing secret with two other token kinds:
 *   - first-party session JWTs (`userId`, `username`, `exp`)
 *   - MCP OAuth access tokens (`sub`, `client_id`, `session_id`, ... — no `userId`)
 *
 * OAuth access tokens are scoped to per-project consent grants that the DO
 * cannot see: it resolves access from a user id alone. The DO used to accept
 * them through a `payload.sub` fallback, so a client granted viewer on
 * project A could open a socket to project B as the user and write. Only
 * session-shaped tokens may authenticate a socket; the Worker mints one of
 * those for MCP tool calls (mintDoJwt) instead of forwarding the OAuth token.
 *
 * Same `cloudflare:workers` stub approach as yjs-do-close-codes.test.ts.
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

function makeWs() {
  const ws = {
    readyState: WebSocket.OPEN,
    sent: [] as string[],
    closes: [] as Array<{ code?: number; reason?: string }>,
    send(message: string) {
      ws.sent.push(message);
    },
    close(code?: number, reason?: string) {
      ws.closes.push({ code, reason });
      ws.readyState = WebSocket.CLOSED;
    },
    serializeAttachment() {},
    deserializeAttachment() {
      return null;
    },
  };
  return ws;
}

function makeConnInfo(documentId: string): unknown {
  return {
    documentId,
    authenticated: false,
    canWrite: false,
    pendingMessages: [],
    awarenessClientIds: new Set(),
  };
}

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

const exp = () => Math.floor(Date.now() / 1000) + 3600;

let YjsProject: new (state: unknown, env: unknown) => unknown;
let closeCodes: typeof import('../src/utils/ws-close-codes');
let mintDoJwt: typeof import('../src/mcp/mcp.auth').mintDoJwt;
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let collaborationService: { checkAccess: (...args: unknown[]) => Promise<unknown> };

interface DoInternals {
  handleAuthMessage(ws: unknown, connInfo: unknown, token: string): Promise<void>;
  verifyToken(token: string): Promise<Record<string, unknown> | null>;
}

function makeDO(env: Record<string, unknown> = {}): DoInternals {
  const state = { storage: {}, setWebSocketAutoResponse: () => {} };
  return new YjsProject(state, { DATABASE_KEY: SECRET, ...env }) as unknown as DoInternals;
}

describe('YjsProject DO token scope', () => {
  beforeAll(async () => {
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ mintDoJwt } = await import('../src/mcp/mcp.auth'));
    ({ projectService } = await import('../src/services/project.service'));
    ({ collaborationService } = await import('../src/services/collaboration.service'));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: new (state: unknown, env: unknown) => unknown;
    });
  });

  afterEach(() => {
    try {
      (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
      (collaborationService.checkAccess as ReturnType<typeof spyOn>).mockRestore?.();
    } catch {
      // Not spied in every test.
    }
  });

  it('rejects an MCP OAuth access token (sub + client_id + session_id, no userId)', async () => {
    const doInstance = makeDO({ DB: {} });
    const ws = makeWs();
    // Shape of McpAccessTokenPayload as issued by McpOAuthService.
    const token = await signJwt({
      iss: 'inkweld',
      sub: 'owner-1',
      aud: 'https://api.example.com/mcp',
      exp: exp(),
      iat: Math.floor(Date.now() / 1000),
      jti: 'jti-1',
      session_id: 'oauth-session-1',
      client_id: 'client-1',
      username: 'alice',
      grants: [],
    });
    // Would be the owner if the token were honoured — the lookup must never run.
    const lookup = spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-b',
      userId: 'owner-1',
    });

    await doInstance.handleAuthMessage(ws, makeConnInfo('alice:project-b:elements'), token);

    expect(ws.sent).toEqual(['access-denied:invalid-token']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_INVALID_TOKEN, reason: 'Invalid token' },
    ]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a sub-only token even without OAuth markers', async () => {
    const doInstance = makeDO();
    const ws = makeWs();
    const token = await signJwt({ sub: 'user-1', username: 'alice', exp: exp() });

    await doInstance.handleAuthMessage(ws, makeConnInfo('alice:proj:elements'), token);

    expect(ws.sent).toEqual(['access-denied:invalid-token']);
  });

  it('rejects a token that carries userId but also OAuth markers', async () => {
    const doInstance = makeDO();
    const token = await signJwt({
      userId: 'user-1',
      sub: 'user-1',
      username: 'alice',
      client_id: 'client-1',
      exp: exp(),
    });

    expect(await doInstance.verifyToken(token)).toBeNull();
  });

  it('accepts a first-party session token', async () => {
    const doInstance = makeDO();
    const ws = makeWs();
    const token = await signJwt({
      userId: 'user-1',
      username: 'alice',
      email: '',
      scope: 'full',
      exp: exp(),
    });

    await doInstance.handleAuthMessage(ws, makeConnInfo('alice:proj:elements'), token);

    // Legacy owner-only path (no D1): auth succeeds before any doc setup.
    expect(ws.sent[0]).toBe('authenticated');
  });

  it('accepts the DO JWT the Worker mints for MCP tool calls', async () => {
    const doInstance = makeDO();
    const token = await mintDoJwt('alice', 'user-1', { DATABASE_KEY: SECRET });

    const payload = await doInstance.verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user-1');
    expect(payload?.username).toBe('alice');
    // The minted token must not look like an OAuth access token.
    expect(payload?.client_id).toBeUndefined();
    expect(payload?.session_id).toBeUndefined();
  });
});
