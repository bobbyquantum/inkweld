import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

/**
 * POST /api/destroy on the Yjs Durable Object: project deletion must wipe the
 * DO's storage (a re-created username:slug maps to the same DO) and close its
 * sockets, and only the owner may trigger it. Same cloudflare:workers stub
 * approach as yjs-do-close-codes.test.ts.
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

function makeState(sockets: unknown[]) {
  const storage = { deleteAll: mock(async () => {}) };
  return {
    storage,
    getWebSockets: () => sockets,
    setWebSocketAutoResponse: () => {},
  };
}

let YjsProject: new (state: unknown, env: unknown) => { fetch(req: Request): Promise<Response> };
let projectService: { findByUsernameAndSlug: (...args: unknown[]) => Promise<unknown> };
let collaborationService: { checkAccess: (...args: unknown[]) => Promise<unknown> };
let userService: { findById: (...args: unknown[]) => Promise<unknown> };
let closeCodes: typeof import('../src/utils/ws-close-codes');

describe('YjsProject DO POST /api/destroy', () => {
  beforeAll(async () => {
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ projectService } = await import('../src/services/project.service'));
    ({ collaborationService } = await import('../src/services/collaboration.service'));
    ({ userService } = await import('../src/services/user.service'));
    // resolveProjectAccess re-checks the user row behind the token; there is
    // no database here, so answer with an enabled, approved account.
    spyOn(userService, 'findById').mockImplementation(async (_db: unknown, id: unknown) => ({
      id,
      username: String(id),
      enabled: true,
      approved: true,
      sessionsValidFrom: null,
    }));
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
  });

  // bun runs every test file in one process, so the userService spy above
  // would otherwise answer for the whole suite (and 403 every admin route).
  afterAll(() => {
    (userService.findById as ReturnType<typeof spyOn>).mockRestore?.();
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

  async function destroy(state: ReturnType<typeof makeState>, token: string): Promise<Response> {
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    return doInstance.fetch(
      new Request('https://yjs-do/api/destroy?documentId=alice:proj:elements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    );
  }

  it('wipes storage and closes every socket for the owner', async () => {
    const ws = makeWs({ documentId: 'alice:proj:doc-1', authenticated: true, canWrite: true });
    const state = makeState([ws]);
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    const token = await signJwt({ userId: 'owner-1', username: 'alice', exp: exp() });

    const response = await destroy(state, token);

    expect(response.status).toBe(200);
    expect(state.storage.deleteAll).toHaveBeenCalledTimes(1);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_PROJECT_NOT_FOUND, reason: 'Project deleted' },
    ]);
  });

  it('refuses a collaborator, even with write access', async () => {
    const state = makeState([]);
    spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'project-1',
      userId: 'owner-1',
    });
    spyOn(collaborationService, 'checkAccess').mockResolvedValue({
      isOwner: false,
      canRead: true,
      canWrite: true,
      role: 'editor',
    });
    const token = await signJwt({ userId: 'editor-1', username: 'bob', exp: exp() });

    const response = await destroy(state, token);

    expect(response.status).toBe(403);
    expect(state.storage.deleteAll).not.toHaveBeenCalled();
  });

  it('refuses without a token', async () => {
    const state = makeState([]);
    const doInstance = new YjsProject(state, { DATABASE_KEY: SECRET, DB: {} });
    const response = await doInstance.fetch(
      new Request('https://yjs-do/api/destroy?documentId=alice:proj:elements', { method: 'POST' })
    );
    expect(response.status).toBe(401);
    expect(state.storage.deleteAll).not.toHaveBeenCalled();
  });
});
