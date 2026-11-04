import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { sign } from 'hono/jwt';
import { DEV_FALLBACK_SECRET, SAMPLE_SECRETS } from '../src/config/env';
import { SigningSecretError } from '../src/config/signing-secret';

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
let userService: { findById: (...args: unknown[]) => Promise<unknown> };

interface DoInternals {
  fetch(request: Request): Promise<Response>;
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
    ({ userService } = await import('../src/services/user.service'));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: new (state: unknown, env: unknown) => unknown;
    });
  });

  afterEach(() => {
    try {
      (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
      (collaborationService.checkAccess as ReturnType<typeof spyOn>).mockRestore?.();
      (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
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
    const doInstance = makeDO({ DB: {} });
    const ws = makeWs();
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
    });
    spyOn(userService, 'findById').mockResolvedValue({
      id: 'user-1',
      enabled: true,
      approved: true,
      sessionsValidFrom: 0,
    });
    const token = await signJwt({
      userId: 'user-1',
      username: 'alice',
      email: '',
      scope: 'full',
      exp: exp(),
    });

    await doInstance.handleAuthMessage(ws, makeConnInfo('alice:proj:elements'), token);

    // The owner is admitted: auth succeeds before any doc setup.
    expect(ws.sent[0]).toBe('authenticated');
  });

  describe('without a usable signing key', () => {
    // A server error, not an invalid token: the client keeps its token and
    // retries instead of treating the session as revoked.
    const sessionToken = () => signJwt({ userId: 'user-1', username: 'alice', exp: exp() });

    it('reports a key shorter than 32 characters as an error', async () => {
      const token = await sessionToken();
      await expect(makeDO({ DATABASE_KEY: 'short' }).verifyToken(token)).rejects.toThrow(
        SigningSecretError
      );
    });

    it('answers the WebSocket with a server error', async () => {
      const ws = makeWs();
      await makeDO({ DATABASE_KEY: 'short' }).handleAuthMessage(
        ws,
        makeConnInfo('alice:proj:elements'),
        await sessionToken()
      );

      expect(ws.sent).toEqual(['access-denied:error']);
      expect(ws.closes).toEqual([
        { code: closeCodes.WS_CLOSE_SERVER_ERROR, reason: 'Authentication error' },
      ]);
    });

    it('answers an HTTP request with a 500', async () => {
      const res = await makeDO({ DATABASE_KEY: 'short' }).fetch(
        new Request('https://yjs-do/api/document?documentId=alice:proj:elements', {
          headers: { Authorization: `Bearer ${await sessionToken()}` },
        })
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal server error' });
    });

    it('still treats a malformed token as invalid once the key is usable', async () => {
      expect(await makeDO().verifyToken('not-a-jwt')).toBeNull();
    });
  });

  it('verifies with the development key only in development and test', async () => {
    const token = await sign(
      { userId: 'user-1', username: 'alice', exp: exp() },
      DEV_FALLBACK_SECRET,
      'HS256'
    );
    const withDevKey = (NODE_ENV: string) =>
      makeDO({ DATABASE_KEY: DEV_FALLBACK_SECRET, NODE_ENV });

    await expect(withDevKey('production').verifyToken(token)).rejects.toThrow(SigningSecretError);
    await expect(withDevKey('preview').verifyToken(token)).rejects.toThrow(SigningSecretError);
    expect((await withDevKey('development').verifyToken(token))?.userId).toBe('user-1');
  });

  it('refuses the sample keys from the docs outside development and test', async () => {
    const withSample = (key: string, NODE_ENV: string) =>
      makeDO({ DATABASE_KEY: undefined, SESSION_SECRET: key, NODE_ENV });
    await Promise.all(
      SAMPLE_SECRETS.map(async (key) => {
        const token = await sign({ userId: 'user-1', username: 'alice', exp: exp() }, key, 'HS256');
        await expect(withSample(key, 'production').verifyToken(token)).rejects.toThrow(
          SigningSecretError
        );
        expect((await withSample(key, 'test').verifyToken(token))?.userId).toBe('user-1');
      })
    );
  });

  it('signs with SESSION_SECRET when DATABASE_KEY is too short', async () => {
    const token = await signJwt({ userId: 'user-1', username: 'alice', exp: exp() });
    const doInstance = makeDO({ DATABASE_KEY: 'short', SESSION_SECRET: SECRET });
    expect((await doInstance.verifyToken(token))?.userId).toBe('user-1');
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
