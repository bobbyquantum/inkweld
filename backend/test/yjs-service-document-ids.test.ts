import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { config } from '../src/config/env';
import { fileStorageService } from '../src/services/file-storage.service';
import { logger } from '../src/services/logger.service';
import { YjsService, type YjsSocket } from '../src/services/yjs.service';

/**
 * YjsService only keeps documents whose id it can persist and find again by
 * project, and the helpers that walk every document skip ids they cannot
 * parse.
 */

const OWNER = 'docidowner';
const SLUG = 'docid-proj';
const PROJECT_KEY = `${OWNER}:${SLUG}`;
const ELEMENTS_ID = `${PROJECT_KEY}:elements/`;
/** A key the service would never create itself, put in place directly. */
const ODD_KEY = 'odd:key';

interface SharedDocLike {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<YjsSocket, Set<number>>;
  wsUserIds: Map<YjsSocket, string>;
}

interface Internals {
  docs: Map<string, SharedDocLike>;
  pendingLoads: Map<string, unknown>;
  persistences: Map<string, unknown>;
  evictIdleDocument(doc: SharedDocLike): Promise<void>;
}

function internals(service: YjsService): Internals {
  return service as unknown as Internals;
}

interface FakeSocket extends YjsSocket {
  closes: Array<[number?, string?]>;
}

function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    closes: [],
    send: () => undefined,
    close: (code?: number, reason?: string) => {
      socket.closes.push([code, reason]);
    },
  };
  return socket;
}

/** Put a document under {@link ODD_KEY} directly, bypassing `getDocument`. */
function addOddEntry(service: YjsService, userId: string): FakeSocket {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const socket = fakeSocket();
  internals(service).docs.set(ODD_KEY, {
    name: ODD_KEY,
    doc,
    awareness,
    conns: new Map([[socket, new Set<number>()]]),
    wsUserIds: new Map([[socket, userId]]),
  });
  return socket;
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The singleton FileStorageService captures config.dataPath at construction,
// so retargeting config alone is not enough — patch the captured basePath too.
const mutableConfig = config as { dataPath: string };
const originalDataPath = config.dataPath;
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'inkweld-yjs-docids-'));
  mutableConfig.dataPath = tempRoot;
  (fileStorageService as unknown as { basePath: string }).basePath = tempRoot;
});

afterEach(async () => {
  mutableConfig.dataPath = originalDataPath;
  (fileStorageService as unknown as { basePath: string }).basePath = originalDataPath;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('YjsService document ids', () => {
  it('refuses to load a document whose id it could not persist', async () => {
    const service = new YjsService();
    const ids = [
      `${OWNER}:${SLUG}`,
      `${OWNER}:${SLUG}:`,
      `${OWNER}:${SLUG}:/`,
      `${OWNER}:${SLUG}:elements//`,
      `:${SLUG}:elements`,
      `${OWNER}::elements`,
    ];
    const results = await Promise.allSettled(ids.map((id) => service.getDocument(id)));

    for (const [index, result] of results.entries()) {
      expect({ id: ids[index], status: result.status }).toEqual({
        id: ids[index],
        status: 'rejected',
      });
      if (result.status === 'rejected') {
        expect(String(result.reason)).toContain('Invalid documentId format');
      }
      expect(internals(service).docs.has(ids[index])).toBe(false);
    }
    expect(internals(service).pendingLoads.size).toBe(0);
    // No LevelDB handle was opened for any of them.
    expect(internals(service).persistences.size).toBe(0);
    await service.cleanup();
  });

  it('still loads both forms of a valid id', async () => {
    const service = new YjsService();
    const slashed = await service.getDocument(ELEMENTS_ID);
    const bare = await service.getDocument(`${PROJECT_KEY}:doc-1`);
    expect(slashed.name).toBe(ELEMENTS_ID);
    expect(bare.name).toBe(`${PROJECT_KEY}:doc-1`);
    expect(internals(service).persistences.has(PROJECT_KEY)).toBe(true);
    await service.cleanup();
  });
});

describe('YjsService helpers with an odd entry present', () => {
  it("revokes a user's sockets on other projects and leaves the odd entry alone", async () => {
    const service = new YjsService();
    const socket = fakeSocket();
    await service.handleConnection(socket, ELEMENTS_ID);
    service.registerUserConnection(socket, ELEMENTS_ID, 'user-1');
    const oddSocket = addOddEntry(service, 'user-1');

    expect(service.revokeUserAccess(OWNER, SLUG, 'user-1', 'removed')).toBe(1);
    expect(socket.closes).toHaveLength(1);
    expect(oddSocket.closes).toHaveLength(0);
    await service.cleanup();
  });

  it('tears down another project', async () => {
    const service = new YjsService();
    const socket = fakeSocket();
    await service.handleConnection(socket, ELEMENTS_ID);
    addOddEntry(service, 'user-1');

    await service.destroyProject(OWNER, SLUG);

    expect(internals(service).docs.has(ELEMENTS_ID)).toBe(false);
    expect(internals(service).persistences.has(PROJECT_KEY)).toBe(false);
    expect(socket.closes).toEqual([[1000, 'Project deleted']]);
    expect(internals(service).docs.has(ODD_KEY)).toBe(true);
    await service.cleanup();
  });

  it("evicts another project's idle document and closes its store", async () => {
    const idleMs = 40;
    const service = new YjsService(idleMs);
    addOddEntry(service, 'user-1');
    await service.getDocument(ELEMENTS_ID);

    await settle(idleMs * 4);

    expect(internals(service).docs.has(ELEMENTS_ID)).toBe(false);
    expect(internals(service).persistences.has(PROJECT_KEY)).toBe(false);
    await service.cleanup();
  });

  it('evicts the odd entry itself without rejecting', async () => {
    const service = new YjsService();
    addOddEntry(service, 'user-1');
    const odd = internals(service).docs.get(ODD_KEY);
    if (!odd) throw new Error('odd entry missing');

    await internals(service).evictIdleDocument(odd);

    expect(internals(service).docs.has(ODD_KEY)).toBe(false);
    await service.cleanup();
  });
});

describe('YjsService idle eviction failures', () => {
  it('logs a failed eviction instead of leaving the rejection unhandled', async () => {
    const idleMs = 30;
    const service = new YjsService(idleMs);
    internals(service).evictIdleDocument = () => Promise.reject(new Error('simulated failure'));
    const errorSpy = spyOn(logger, 'error');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      await service.getDocument(ELEMENTS_ID);
      await settle(idleMs * 5);

      const messages = errorSpy.mock.calls.map((call) => String(call[1]));
      expect(messages.some((m) => m.includes('Failed to evict idle document'))).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      errorSpy.mockRestore();
      await service.cleanup();
    }
  });
});
