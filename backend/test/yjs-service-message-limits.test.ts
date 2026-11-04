import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as decoding from 'lib0/decoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { config } from '../src/config/env';
import { fileStorageService } from '../src/services/file-storage.service';
import { logger } from '../src/services/logger.service';
import { YjsService, type YjsSocket } from '../src/services/yjs.service';
import { MAX_YJS_JSON_DEPTH } from '../src/utils/yjs-message-limits';
import {
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  awarenessMessage,
  legacyJsonUpdate,
  nestedArrays,
  syncMessage,
  syncStep1Message,
  updateOf,
} from './yjs-message-fixtures';

/**
 * YjsService applies a sync or awareness message only when it is within the
 * limits of utils/yjs-message-limits.ts, and keeps serving a document whose
 * awareness holds a state it cannot encode. The server's own awareness runs no
 * interval.
 */

const DOC_ID = 'limitsowner:limits-proj:doc-1/';

interface RecordingSocket extends YjsSocket {
  sent: Uint8Array[];
}

function recordingSocket(): RecordingSocket {
  const socket: RecordingSocket = {
    sent: [],
    send(data: string | Uint8Array) {
      if (typeof data !== 'string') socket.sent.push(data);
    },
    close: () => undefined,
  };
  return socket;
}

/** The payloads of the binary messages of outer `type` (and sync `subType`) a socket received. */
function payloads(socket: RecordingSocket, type: number, subType?: number): Uint8Array[] {
  const found: Uint8Array[] = [];
  for (const message of socket.sent) {
    const decoder = decoding.createDecoder(message);
    if (decoding.readVarUint(decoder) !== type) continue;
    if (subType !== undefined && decoding.readVarUint(decoder) !== subType) continue;
    found.push(decoding.readVarUint8Array(decoder));
  }
  return found;
}

/** The client ids in the awareness messages a socket received. */
function awarenessClientIds(socket: RecordingSocket): number[] {
  const scratchDoc = new Y.Doc();
  const scratch = new awarenessProtocol.Awareness(scratchDoc);
  for (const update of payloads(socket, MESSAGE_AWARENESS)) {
    awarenessProtocol.applyAwarenessUpdate(scratch, update, 'test');
  }
  const ids = [...scratch.getStates().keys()].filter((id) => id !== scratchDoc.clientID);
  scratch.destroy();
  scratchDoc.destroy();
  return ids;
}

function frame(message: Uint8Array): Buffer {
  return Buffer.from(message);
}

// The singleton FileStorageService captures config.dataPath at construction,
// so retargeting config alone is not enough — patch the captured basePath too.
const mutableConfig = config as { dataPath: string };
const originalDataPath = config.dataPath;
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'inkweld-yjs-limits-'));
  mutableConfig.dataPath = tempRoot;
  (fileStorageService as unknown as { basePath: string }).basePath = tempRoot;
});

afterEach(async () => {
  mutableConfig.dataPath = originalDataPath;
  (fileStorageService as unknown as { basePath: string }).basePath = originalDataPath;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('YjsService message limits', () => {
  it('drops an update with a value nested deeper than the limit and keeps the document as it was', async () => {
    const service = new YjsService();
    const writer = recordingSocket();
    const reader = recordingSocket();
    const doc = await service.handleConnection(writer, DOC_ID);
    await service.handleConnection(reader, DOC_ID);
    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const tooDeep = nestedArrays(MAX_YJS_JSON_DEPTH + 1);
      service.handleMessage(
        writer,
        doc,
        frame(syncMessage(updateOf((d) => d.getArray('deep').insert(0, [tooDeep]))))
      );
      service.handleMessage(
        writer,
        doc,
        frame(syncMessage(legacyJsonUpdate('legacy', JSON.stringify(tooDeep)), 'step2'))
      );
      service.handleMessage(
        writer,
        doc,
        frame(
          syncMessage(
            updateOf((d) => d.getArray('kept').insert(0, [nestedArrays(MAX_YJS_JSON_DEPTH)]))
          )
        )
      );
      expect(warn.mock.calls.filter((call) => String(call[1]).includes('Dropped'))).toHaveLength(2);
    } finally {
      warn.mockRestore();
    }

    expect(doc.doc.getArray('deep')).toHaveLength(0);
    expect(doc.doc.getArray('legacy')).toHaveLength(0);
    expect(doc.doc.getArray('kept')).toHaveLength(1);
    // Only the update that was applied reached the other socket.
    expect(payloads(reader, MESSAGE_SYNC, 2)).toHaveLength(1);

    // The document still encodes: a socket asking for it gets it.
    service.handleMessage(reader, doc, frame(syncStep1Message()));
    const [reply] = payloads(reader, MESSAGE_SYNC, 1);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, reply);
    expect(copy.getArray('kept')).toHaveLength(1);
    expect(copy.getArray('deep')).toHaveLength(0);
    await service.cleanup();

    // Nothing that was dropped was stored.
    const reloaded = new YjsService();
    const again = await reloaded.getDocument(DOC_ID);
    expect(again.doc.getArray('kept')).toHaveLength(1);
    expect(again.doc.getArray('deep')).toHaveLength(0);
    expect(again.doc.getArray('legacy')).toHaveLength(0);
    await reloaded.cleanup();
  });

  it('drops an awareness update that is too deep or partly unreadable and relays one within the limits', async () => {
    const service = new YjsService();
    const sender = recordingSocket();
    const peer = recordingSocket();
    const doc = await service.handleConnection(sender, DOC_ID);
    await service.handleConnection(peer, DOC_ID);
    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      service.handleMessage(
        sender,
        doc,
        frame(
          awarenessMessage([
            {
              clientId: 101,
              clock: 1,
              stateJson: JSON.stringify(nestedArrays(MAX_YJS_JSON_DEPTH + 1)),
            },
          ])
        )
      );
      service.handleMessage(
        sender,
        doc,
        frame(
          awarenessMessage([
            { clientId: 102, clock: 1, stateJson: '{}' },
            { clientId: 103, clock: 1, stateJson: '{"user":' },
          ])
        )
      );
    } finally {
      warn.mockRestore();
    }
    expect([...doc.awareness.getStates().keys()]).toEqual([]);
    expect(payloads(peer, MESSAGE_AWARENESS)).toHaveLength(0);

    const kept = JSON.stringify({ cursor: nestedArrays(MAX_YJS_JSON_DEPTH - 1) });
    service.handleMessage(
      sender,
      doc,
      frame(awarenessMessage([{ clientId: 104, clock: 1, stateJson: kept }]))
    );
    expect([...doc.awareness.getStates().keys()]).toEqual([104]);
    expect(awarenessClientIds(peer)).toEqual([104]);

    // A socket that joins later is sent the state that was kept.
    const late = recordingSocket();
    await service.handleConnection(late, DOC_ID);
    expect(awarenessClientIds(late)).toEqual([104]);

    // It leaves with the socket that sent it.
    service.handleDisconnect(sender, doc);
    expect(doc.awareness.getStates().size).toBe(0);
    await service.cleanup();
  });
});

describe('YjsService awareness', () => {
  it('stops the awareness interval of every document it loads', async () => {
    const clearIntervalSpy = spyOn(globalThis, 'clearInterval');
    const service = new YjsService();
    try {
      const doc = await service.getDocument(DOC_ID);
      const { _checkInterval: interval } = doc.awareness as { _checkInterval?: unknown };
      expect(interval).toBeDefined();
      // Compared by identity: toHaveBeenCalledWith treats any two timers as equal.
      expect(clearIntervalSpy.mock.calls.some(([handle]) => handle === interval)).toBe(true);
      expect(doc.awareness.getLocalState()).toBeNull();
    } finally {
      clearIntervalSpy.mockRestore();
      await service.cleanup();
    }
  });

  it('keeps joining sockets and relaying when a state cannot be encoded', async () => {
    const service = new YjsService();
    const first = recordingSocket();
    const doc = await service.handleConnection(first, DOC_ID);
    const error = spyOn(logger, 'error').mockImplementation(() => undefined);
    try {
      // JSON cannot encode a bigint, so neither relaying this change nor
      // sending the states to a new socket can encode it.
      expect(() => doc.awareness.setLocalState({ count: 1n })).not.toThrow();

      const late = recordingSocket();
      const joined = await service.handleConnection(late, DOC_ID);
      expect(joined).toBe(doc);
      // The new socket was still asked for its state (sync step 1)...
      expect(payloads(late, MESSAGE_SYNC, 0)).toHaveLength(1);
      // ...and still receives updates.
      service.handleMessage(
        first,
        doc,
        frame(syncMessage(updateOf((d) => d.getText('t').insert(0, 'after'))))
      );
      expect(payloads(late, MESSAGE_SYNC, 2)).toHaveLength(1);

      const messages = error.mock.calls.map((call) => String(call[1]));
      expect(messages.some((m) => m.includes('Error relaying an awareness change'))).toBe(true);
      expect(messages.some((m) => m.includes('Could not send awareness states'))).toBe(true);
    } finally {
      error.mockRestore();
      doc.awareness.setLocalState(null);
      await service.cleanup();
    }
  });
});
