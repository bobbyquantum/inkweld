import { beforeAll, describe, expect, it, mock } from 'bun:test';

/**
 * Pre-auth limits on the Yjs Durable Object: an unauthenticated socket may
 * queue only a bounded number of frames, and one that never sends a token is
 * closed by the alarm. Same `cloudflare:workers` stub approach as
 * yjs-do-close-codes.test.ts.
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

function makeWs(attachment: unknown = null) {
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

interface FakeState {
  storage: {
    alarm: number | null;
    getAlarm(): Promise<number | null>;
    setAlarm(at: number): Promise<void>;
  };
  sockets: unknown[];
  getWebSockets(): unknown[];
  setWebSocketAutoResponse(): void;
}

function makeState(sockets: unknown[] = []): FakeState {
  const state: FakeState = {
    storage: {
      alarm: null,
      async getAlarm() {
        return state.storage.alarm;
      },
      async setAlarm(at: number) {
        state.storage.alarm = at;
      },
    },
    sockets,
    getWebSockets: () => state.sockets,
    setWebSocketAutoResponse: () => {},
  };
  return state;
}

let YjsProject: new (state: unknown, env: unknown) => unknown;
let limits: typeof import('../src/utils/ws-preauth');
let closeCodes: typeof import('../src/utils/ws-close-codes');

interface DoInternals {
  handleBinaryMessage(ws: unknown, connInfo: unknown, message: ArrayBuffer): void;
  scheduleAuthDeadline(deadlineMs: number): Promise<void>;
  alarm(): Promise<void>;
  connections: Map<unknown, unknown>;
}

function makeDO(state: FakeState): DoInternals {
  return new YjsProject(state, { DATABASE_KEY: SECRET }) as unknown as DoInternals;
}

describe('YjsProject DO pre-auth limits', () => {
  beforeAll(async () => {
    limits = await import('../src/utils/ws-preauth');
    closeCodes = await import('../src/utils/ws-close-codes');
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: new (state: unknown, env: unknown) => unknown;
    });
  });

  it('closes an unauthenticated socket that exceeds the frame budget', () => {
    const doInstance = makeDO(makeState());
    const ws = makeWs();
    const connInfo = {
      documentId: 'alice:proj:elements',
      authenticated: false,
      canWrite: false,
      pendingMessages: [] as ArrayBuffer[],
      pendingBytes: 0,
      awarenessClientIds: new Set(),
    };
    const frame = new Uint8Array([0, 0, 1]).buffer;

    for (let i = 0; i < limits.MAX_PREAUTH_QUEUED_FRAMES; i++) {
      doInstance.handleBinaryMessage(ws, connInfo, frame);
    }
    expect(connInfo.pendingMessages).toHaveLength(limits.MAX_PREAUTH_QUEUED_FRAMES);
    expect(ws.closes).toEqual([]);

    doInstance.handleBinaryMessage(ws, connInfo, frame);

    expect(ws.sent).toEqual(['access-denied:queue-overflow']);
    expect(ws.closes).toEqual([
      { code: closeCodes.WS_CLOSE_PREAUTH_OVERFLOW, reason: 'Authenticate before syncing' },
    ]);
    // The queue is released, not kept around for a socket we just closed.
    expect(connInfo.pendingMessages).toEqual([]);
  });

  it('closes an unauthenticated socket that exceeds the byte budget', () => {
    const doInstance = makeDO(makeState());
    const ws = makeWs();
    const connInfo = {
      documentId: 'alice:proj:elements',
      authenticated: false,
      canWrite: false,
      pendingMessages: [] as ArrayBuffer[],
      pendingBytes: 0,
      awarenessClientIds: new Set(),
    };
    const big = new Uint8Array(limits.MAX_PREAUTH_QUEUED_BYTES).buffer;
    doInstance.handleBinaryMessage(ws, connInfo, big);
    expect(ws.closes).toEqual([]);

    doInstance.handleBinaryMessage(ws, connInfo, new Uint8Array([0]).buffer);
    expect(ws.closes[0]?.code).toBe(closeCodes.WS_CLOSE_PREAUTH_OVERFLOW);
  });

  it('arms the alarm only if none is pending earlier', async () => {
    const state = makeState();
    const doInstance = makeDO(state);
    await doInstance.scheduleAuthDeadline(5_000);
    expect(state.storage.alarm).toBe(5_000);
    await doInstance.scheduleAuthDeadline(9_000);
    expect(state.storage.alarm).toBe(5_000);
    await doInstance.scheduleAuthDeadline(2_000);
    expect(state.storage.alarm).toBe(2_000);
  });

  it('alarm closes sockets past the deadline and re-arms for the rest', async () => {
    const now = Date.now();
    const stale = makeWs({
      documentId: 'alice:proj:elements',
      authenticated: false,
      canWrite: false,
      connectedAt: now - limits.PREAUTH_TIMEOUT_MS - 1,
    });
    const fresh = makeWs({
      documentId: 'alice:proj:doc-1',
      authenticated: false,
      canWrite: false,
      connectedAt: now - 1_000,
    });
    const authed = makeWs({
      documentId: 'alice:proj:doc-2',
      authenticated: true,
      canWrite: true,
      userId: 'u1',
    });
    const state = makeState([stale, fresh, authed]);
    const doInstance = makeDO(state);

    await doInstance.alarm();

    expect(stale.sent).toEqual(['access-denied:auth-timeout']);
    expect(stale.closes).toEqual([
      { code: closeCodes.WS_CLOSE_AUTH_TIMEOUT, reason: 'Authentication timeout' },
    ]);
    expect(fresh.closes).toEqual([]);
    expect(authed.closes).toEqual([]);
    // Re-armed for the fresh socket's deadline.
    expect(state.storage.alarm).toBe(fresh.attachment!.connectedAt + limits.PREAUTH_TIMEOUT_MS);
  });

  it('alarm leaves the schedule empty when every socket is authenticated', async () => {
    const authed = makeWs({ documentId: 'alice:proj:doc-2', authenticated: true, canWrite: true });
    const state = makeState([authed]);
    const doInstance = makeDO(state);
    await doInstance.alarm();
    expect(state.storage.alarm).toBeNull();
    expect(authed.closes).toEqual([]);
  });
});
