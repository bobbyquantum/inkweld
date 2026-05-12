/**
 * Unit tests for YjsService element CRUD activity event emission.
 *
 * These tests verify that watchElementsDoc / registerUserConnection /
 * unregisterUserConnection correctly detect creates, renames, and deletes
 * in the Yjs elements array and call activityService.record with the right
 * arguments.
 *
 * We bypass getDocument() (which needs LevelDB) by directly injecting a
 * lightweight WSSharedDoc stub into the service's internal `docs` Map via
 * type-casting. This keeps the tests fast and dependency-free.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { YjsService } from '../src/services/yjs.service';
import { activityService } from '../src/services/activity.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal stub that satisfies the DatabaseInstance type for record calls. */
const fakeDb = {} as Parameters<typeof activityService.record>[0];

/** A fake WebSocket that has just enough surface area for the wsUserIds Map. */
function fakeWs(): WebSocket {
  return {} as unknown as WebSocket;
}

/** Build a plain element object matching the structure the frontend writes. */
function elem(id: string, name: string, type = 'ITEM') {
  return { id, name, type };
}

/**
 * Build a minimal WSSharedDoc and inject it into the service's private `docs`
 * map. This avoids LevelDB entirely while exercising all the real service logic.
 */
function injectDoc(
  service: YjsService,
  docId: string
): { ydoc: Y.Doc; wsUserIds: Map<WebSocket, string> } {
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);
  awareness.setLocalState(null);
  const wsUserIds = new Map<WebSocket, string>();

  // WSSharedDoc shape (matches the interface in yjs.service.ts)
  const sharedDoc = {
    name: docId,
    doc: ydoc,
    awareness,
    conns: new Map(),
    wsUserIds,
  };

  // Inject into private map via type assertion
  const svc = service as unknown as { docs: Map<string, unknown> };
  svc.docs.set(docId, sharedDoc);

  return { ydoc, wsUserIds };
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let service: YjsService;
let recordSpy: ReturnType<typeof spyOn<typeof activityService, 'record'>>;

const PROJECT_ID = 'proj-123';
const USER_ID = 'user-abc';
const DOC_ID = 'alice:myproject:elements';

beforeEach(() => {
  service = new YjsService();
  recordSpy = spyOn(activityService, 'record').mockResolvedValue(undefined as never);
});

afterEach(() => {
  recordSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Helpers for triggering Yjs updates with a specific origin WebSocket
// ---------------------------------------------------------------------------

async function setupDocAndWatch(docId = DOC_ID) {
  const ws = fakeWs();
  const { ydoc, wsUserIds } = injectDoc(service, docId);
  wsUserIds.set(ws, USER_ID);
  service.watchElementsDoc(docId, PROJECT_ID, fakeDb);
  return { ydoc, ws };
}

async function setElements(ydoc: Y.Doc, elements: object[], origin: WebSocket | null) {
  const arr = ydoc.getArray('elements');
  ydoc.transact(() => {
    arr.delete(0, arr.length);
    arr.insert(0, elements);
  }, origin);
  // Allow the void-fired async emitElementDiffEvents to settle.
  await new Promise((r) => setTimeout(r, 20));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('YjsService element CRUD activity events', () => {
  it('emits element_created when a new element appears in the array', async () => {
    const { ydoc, ws } = await setupDocAndWatch();
    await setElements(ydoc, [elem('e1', 'Scene One', 'ITEM')], ws);

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        projectId: PROJECT_ID,
        userId: USER_ID,
        eventType: 'element_created',
        entityId: 'e1',
        entityName: 'Scene One',
        metadata: { elementType: 'ITEM' },
      })
    );
  });

  it('emits element_renamed when an element name changes', async () => {
    const { ydoc, ws } = await setupDocAndWatch();
    await setElements(ydoc, [elem('e1', 'Old Name')], ws);
    recordSpy.mockClear();

    await setElements(ydoc, [elem('e1', 'New Name')], ws);

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        eventType: 'element_renamed',
        entityId: 'e1',
        entityName: 'New Name',
        metadata: { oldName: 'Old Name', newName: 'New Name' },
      })
    );
  });

  it('emits element_deleted when an element is removed', async () => {
    const { ydoc, ws } = await setupDocAndWatch();
    await setElements(ydoc, [elem('e1', 'Scene One'), elem('e2', 'Scene Two')], ws);
    recordSpy.mockClear();

    await setElements(ydoc, [elem('e1', 'Scene One')], ws);

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        eventType: 'element_deleted',
        entityId: 'e2',
        entityName: 'Scene Two',
      })
    );
  });

  it('emits no events when the array content is unchanged', async () => {
    const { ydoc, ws } = await setupDocAndWatch();
    await setElements(ydoc, [elem('e1', 'Scene One')], ws);
    recordSpy.mockClear();

    await setElements(ydoc, [elem('e1', 'Scene One')], ws);

    expect(recordSpy).not.toHaveBeenCalled();
  });

  it('is idempotent — watchElementsDoc called twice only attaches one observer', async () => {
    const { ydoc, ws } = await setupDocAndWatch();
    // Second call should be a no-op
    service.watchElementsDoc(DOC_ID, PROJECT_ID, fakeDb);

    await setElements(ydoc, [elem('e1', 'Scene One')], ws);

    // Only one element_created event, not two
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it('skips events when origin has no registered userId (server-origin replay)', async () => {
    const { ydoc } = await setupDocAndWatch();

    // null origin = server-originated update
    await setElements(ydoc, [elem('e1', 'Scene One')], null);

    expect(recordSpy).not.toHaveBeenCalled();
  });

  it('skips events after unregisterUserConnection removes the user mapping', async () => {
    const { ydoc, ws } = await setupDocAndWatch();
    service.unregisterUserConnection(ws, DOC_ID);
    recordSpy.mockClear();

    await setElements(ydoc, [elem('e1', 'Scene One')], ws);

    expect(recordSpy).not.toHaveBeenCalled();
  });
});
