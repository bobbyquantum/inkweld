import { beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { MAX_YJS_JSON_DEPTH } from '../src/utils/yjs-message-limits';
import { logger } from '../src/services/logger.service';
import {
  awarenessMessage,
  legacyJsonUpdate,
  nestedArrays,
  syncMessage,
  syncStep1Message,
  updateOf,
} from './yjs-message-fixtures';

/**
 * The Yjs Durable Object applies a client's sync or awareness message only
 * when it is within the limits of utils/yjs-message-limits.ts, like the Bun
 * server. The DO base class lives in `cloudflare:workers`, which Bun can't
 * import, so the module is stubbed and frames go through the private dispatch
 * method with a fake shared doc (same approach as yjs-do-pending-queue.test.ts).
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

interface FakeSharedDoc {
  awareness: awarenessProtocol.Awareness;
  update: ReturnType<typeof mock>;
  applied: Uint8Array[];
}

function makeSharedDoc(): FakeSharedDoc {
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);
  awareness.setLocalState(null);
  const handle = (awareness as { _checkInterval?: ReturnType<typeof setInterval> })._checkInterval;
  if (handle !== undefined) clearInterval(handle);
  const applied: Uint8Array[] = [];
  return {
    awareness,
    applied,
    update: mock((frame: Uint8Array) => {
      applied.push(frame);
    }),
  };
}

function makeWs() {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
    close: () => {},
    serializeAttachment: () => {},
    deserializeAttachment: () => null,
  };
}

function connInfo(sharedDoc: FakeSharedDoc) {
  return {
    documentId: 'alice:proj:doc-1',
    authenticated: true,
    canWrite: true,
    sharedDoc,
    pendingMessages: [] as ArrayBuffer[],
    awarenessClientIds: new Set<number>(),
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface DoInternals {
  handleBinaryMessage(ws: unknown, connInfo: unknown, message: ArrayBuffer): void;
}

let YjsProject: new (state: unknown, env: unknown) => unknown;

function makeDO(): DoInternals {
  const state = { storage: {}, setWebSocketAutoResponse: () => {} };
  return new YjsProject(state, {
    DATABASE_KEY: 'test-database-key-long-enough-for-hmac-32',
  }) as unknown as DoInternals;
}

describe('YjsProject DO message limits', () => {
  beforeAll(async () => {
    ({ YjsProject } = (await import('../src/durable-objects/yjs-project.do')) as unknown as {
      YjsProject: typeof YjsProject;
    });
  });

  it('drops a document update with a value nested deeper than the limit', () => {
    const instance = makeDO();
    const sharedDoc = makeSharedDoc();
    const info = connInfo(sharedDoc);
    const ws = makeWs();
    const tooDeep = nestedArrays(MAX_YJS_JSON_DEPTH + 1);
    const kept = syncMessage(updateOf((d) => d.getArray('kept').insert(0, [{ id: 'e1' }])));
    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      instance.handleBinaryMessage(
        ws,
        info,
        toArrayBuffer(syncMessage(updateOf((d) => d.getArray('deep').insert(0, [tooDeep]))))
      );
      instance.handleBinaryMessage(
        ws,
        info,
        toArrayBuffer(syncMessage(legacyJsonUpdate('legacy', JSON.stringify(tooDeep)), 'step2'))
      );
      instance.handleBinaryMessage(ws, info, toArrayBuffer(kept));
      instance.handleBinaryMessage(ws, info, toArrayBuffer(syncStep1Message()));
    } finally {
      warn.mockRestore();
    }

    expect(sharedDoc.applied).toEqual([kept, syncStep1Message()]);
    sharedDoc.awareness.destroy();
  });

  it('drops an awareness update that is too deep or partly unreadable', () => {
    const instance = makeDO();
    const sharedDoc = makeSharedDoc();
    const info = connInfo(sharedDoc);
    const ws = makeWs();
    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      instance.handleBinaryMessage(
        ws,
        info,
        toArrayBuffer(
          awarenessMessage([
            {
              clientId: 201,
              clock: 1,
              stateJson: JSON.stringify(nestedArrays(MAX_YJS_JSON_DEPTH + 1)),
            },
          ])
        )
      );
      instance.handleBinaryMessage(
        ws,
        info,
        toArrayBuffer(
          awarenessMessage([
            { clientId: 202, clock: 1, stateJson: '{}' },
            { clientId: 203, clock: 1, stateJson: '{"user":' },
          ])
        )
      );
      instance.handleBinaryMessage(
        ws,
        info,
        toArrayBuffer(awarenessMessage([{ clientId: 204, clock: 1, stateJson: '{"user":"a"}' }]))
      );
    } finally {
      warn.mockRestore();
    }

    expect([...sharedDoc.awareness.getStates().keys()]).toEqual([204]);
    sharedDoc.awareness.destroy();
  });
});
