import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

/**
 * POST /api/revoke on the Yjs Durable Object closes a collaborator's sockets
 * so a removal or role change takes effect on open sessions. Same
 * cloudflare:workers stub approach as yjs-do-close-codes.test.ts.
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

function makeWs(attachment: unknown) {
  const ws = {
    readyState: WebSocket.OPEN,
    sent: [] as string[],
    closes: [] as Array<{ code?: number; reason?: string }>,
    attachment,
    send(message: string) {
      ws.sent.push(message);
    },
    close(code?: number, reason?: string) {
      ws.closes.push({ code, reason });
      ws.readyState = WebSocket.CLOSED;
    },
    serializeAttachment(value: unknown) {
      ws.attachment = value;
    },
    deserializeAttachment() {
      return ws.attachment;
    },
  };
  return ws;
}

let YjsProject: new (state: unknown, env: unknown) => { fetch(req: Request): Promise<Response> };
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let collaborationService: { checkAccess: (...args: unknown[]) => Promise<unknown> };
let closeCodes: typeof import('../src/utils/ws-close-codes');

describe('YjsProject DO POST /api/revoke', () => {
  beforeAll(async () => {
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ projectService } = await import('../src/services/project.service'));
    ({ collaborationService } = await import('../src/services/collaboration.service'));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
  });

  afterEach(() => {
    try {
      (projectService.findByUsernameAndSlug as ReturnType<typeof spyOn>).mockRestore?.();
      (collaborationService.checkAccess as ReturnType<typeof spyOn>).mockRestore?.();
    } catch {
      // not spied in every test
    }
  });

  const exp = () => Math.floor(Date.now() / 1000) + 3600;

  function revoke(sockets: unknown[], token: string, body: unknown): Promise<Response> {
    const state = {
      storage: {},
      getWebSockets: () => sockets,
      setWebSocketAutoResponse: () => {},
    };
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    return doInstance.fetch(
      new Request('https://yjs-do/api/revoke?documentId=alice:proj:elements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }

  it("closes only the named user's sockets, permanently on removal", async () => {
    const bob1 = makeWs({
      documentId: 'alice:proj:elements',
      authenticated: true,
      canWrite: true,
      userId: 'bob',
    });
    const bob2 = makeWs({
      documentId: 'alice:proj:doc-1',
      authenticated: true,
      canWrite: true,
      userId: 'bob',
    });
    const carol = makeWs({
      documentId: 'alice:proj:doc-1',
      authenticated: true,
      canWrite: true,
      userId: 'carol',
    });
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'p1',
      userId: 'owner-1',
    });
    const token = await signJwt({ userId: 'owner-1', username: 'alice', exp: exp() });

    const response = await revoke([bob1, bob2, carol], token, { userId: 'bob', reason: 'removed' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closed: 2 });
    for (const ws of [bob1, bob2]) {
      expect(ws.sent).toEqual(['access-denied:forbidden']);
      expect(ws.closes).toEqual([
        { code: closeCodes.WS_CLOSE_FORBIDDEN, reason: 'Access revoked' },
      ]);
    }
    expect(carol.closes).toEqual([]);
  });

  it('uses the transient access-changed code for a role change', async () => {
    const bob = makeWs({
      documentId: 'alice:proj:elements',
      authenticated: true,
      canWrite: true,
      userId: 'bob',
    });
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'p1',
      userId: 'owner-1',
    });
    const token = await signJwt({ userId: 'owner-1', username: 'alice', exp: exp() });

    const response = await revoke([bob], token, { userId: 'bob', reason: 'changed' });

    expect(response.status).toBe(200);
    expect(bob.sent).toEqual([]);
    expect(bob.closes).toEqual([
      { code: closeCodes.WS_CLOSE_ACCESS_CHANGED, reason: 'Access changed' },
    ]);
  });

  it('refuses an editor', async () => {
    const bob = makeWs({
      documentId: 'alice:proj:elements',
      authenticated: true,
      canWrite: true,
      userId: 'bob',
    });
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'p1',
      userId: 'owner-1',
    });
    spyOn(collaborationService, 'checkAccess').mockResolvedValue({
      isOwner: false,
      canRead: true,
      canWrite: true,
      role: 'editor',
    });
    const token = await signJwt({ userId: 'editor-1', username: 'eve', exp: exp() });

    const response = await revoke([bob], token, { userId: 'bob', reason: 'removed' });

    expect(response.status).toBe(403);
    expect(bob.closes).toEqual([]);
  });

  it('rejects a body without userId', async () => {
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'p1',
      userId: 'owner-1',
    });
    const token = await signJwt({ userId: 'owner-1', username: 'alice', exp: exp() });
    const response = await revoke([], token, { reason: 'removed' });
    expect(response.status).toBe(400);
  });
});
