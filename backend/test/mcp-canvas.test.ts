/**
 * Tests for the canvas tools, `get_canvas` and `edit_canvas`. What they accept
 * is tested in `packages/inkweld-canvas`; these cover the storage: the Bun
 * runtime with a spied `yjsService`, Workers with a faked Durable Object.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import {
  mirrorCanvasToElement,
  readCanvasContents,
  writeCanvasEdit,
  type CanvasContents,
} from '@inkweld/canvas';
import * as Y from 'yjs';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { MCP_PERMISSIONS } from '../src/mcp/mcp-permissions';
import { activityService } from '../src/services/activity.service';
import { FileStorageService } from '../src/services/file-storage.service';
import { yjsService } from '../src/services/yjs.service';
import type { DurableObjectNamespace } from '../src/types/cloudflare';

const READ = [MCP_PERMISSIONS.READ_ELEMENTS];
const WRITE = [MCP_PERMISSIONS.READ_ELEMENTS, MCP_PERMISSIONS.WRITE_ELEMENTS];

interface ToolJson {
  result?: {
    tools?: { name: string }[];
    content?: { text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
}

interface CallOptions {
  permissions?: string[];
  env?: Record<string, unknown>;
}

async function rpc(
  method: string,
  params: Record<string, unknown>,
  options: CallOptions = {}
): Promise<ToolJson> {
  const mcpContext = {
    type: 'oauth',
    userId: 'u1',
    username: 'alice',
    grants: [
      {
        projectId: 'id-novel',
        username: 'alice',
        slug: 'novel',
        role: 'editor',
        permissions: options.permissions ?? WRITE,
      },
    ],
    ...(options.env ? { env: options.env, authToken: 'token' } : {}),
  };
  const body = {
    jsonrpc: '2.0',
    method,
    id: 1,
    params: {
      ...params,
      _meta: {
        [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION,
        [META_KEYS.clientInfo]: { name: 'test', version: '1.0.0' },
        [META_KEYS.clientCapabilities]: {},
      },
    },
  };
  const c = {
    req: { header: () => undefined, json: async () => body },
    get: (key: string) => (key === 'mcpContext' ? mcpContext : {}),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const res = await handleMcpRequest(c as never);
  return (await res.json()) as ToolJson;
}

function call(name: string, args: Record<string, unknown>, options: CallOptions = {}) {
  return rpc(
    'tools/call',
    { name, arguments: { project: 'alice/novel', elementId: 'map', ...args } },
    options
  );
}

const ELEMENTS = [
  { id: 'map', name: 'World Map', type: 'CANVAS', parentId: null, level: 0, order: 0 },
  { id: 'doc-1', name: 'Chapter', type: 'ITEM', parentId: null, level: 0, order: 1 },
  { id: 'town', name: 'Town', type: 'WORLDBUILDING', parentId: null, level: 0, order: 2 },
];

const LAYER = {
  id: 'l1',
  name: 'Layer 1',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

function elementsDoc(elements: unknown[] = ELEMENTS): Y.Doc {
  const doc = new Y.Doc();
  doc.getArray('elements').insert(0, elements);
  return doc;
}

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  while (spies.length > 0) spies.pop()?.mockRestore();
});

/** Serve `doc` as the Bun runtime's elements document, and record activity. */
function seedBun(doc = elementsDoc()) {
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      docId === 'alice:novel:elements/'
        ? Promise.resolve({ doc })
        : Promise.reject(new Error(`unexpected doc ${docId}`))) as never)
  );
  const activity = spyOn(activityService, 'recordOrCoalesceEdit').mockResolvedValue(undefined);
  spies.push(activity);
  return { doc, activity };
}

function element(doc: Y.Doc, id = 'map') {
  return doc
    .getArray<{ id: string; metadata?: Record<string, string> }>('elements')
    .toArray()
    .find((e) => e.id === id);
}

function stored(doc: Y.Doc): CanvasContents {
  return readCanvasContents(doc, 'map') as CanvasContents;
}

describe('tool registration', () => {
  it('offers reading with read access and editing only with write access', async () => {
    const names = (json: ToolJson) => json.result?.tools?.map((t) => t.name) ?? [];
    const read = names(await rpc('tools/list', {}, { permissions: READ }));
    expect(read).toContain('get_canvas');
    expect(read).not.toContain('edit_canvas');
    expect(names(await rpc('tools/list', {}, { permissions: WRITE }))).toContain('edit_canvas');
  });

  it('refuses an edit from a read-only grant, writing nothing', async () => {
    const { doc } = seedBun();
    const json = await call(
      'edit_canvas',
      { add: [{ type: 'pin', label: 'a' }] },
      { permissions: READ }
    );
    expect(JSON.stringify(json)).toContain('ermission');
    expect(readCanvasContents(doc, 'map')).toBeNull();
  });
});

describe('get_canvas', () => {
  it('reads a canvas nobody has drawn on', async () => {
    seedBun();
    const json = await call('get_canvas', {}, { permissions: READ });
    expect(json.result?.structuredContent).toMatchObject({
      elementId: 'map',
      elementName: 'World Map',
      background: '#FFFFFF',
      layers: [],
      objectCount: 0,
      objects: [],
    });
  });

  it('reads stored contents, summarised, or whole on request', async () => {
    const doc = elementsDoc();
    writeCanvasEdit(Y, doc, 'map', {
      layers: [LAYER],
      upserts: [
        {
          id: 'stroke',
          layerId: 'l1',
          type: 'path',
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          points: [0, 0, 4, 4],
          stroke: '#000',
          strokeWidth: 1,
          closed: false,
          tension: 0,
        },
      ],
    });
    seedBun(doc);

    const summary = await call('get_canvas', {}, { permissions: READ });
    const [object] = summary.result?.structuredContent?.objects as Record<string, unknown>[];
    expect(object.points).toBeUndefined();
    expect(object.pointCount).toBe(2);

    const whole = await call('get_canvas', { objectIds: ['stroke'] }, { permissions: READ });
    const [full] = whole.result?.structuredContent?.objects as Record<string, unknown>[];
    expect(full.points).toEqual([0, 0, 4, 4]);
  });

  it('reads a canvas that only exists in its metadata, without writing', async () => {
    const seed = { layers: [LAYER], objects: [], background: '#123456' };
    const doc = elementsDoc([{ ...ELEMENTS[0], metadata: { canvasConfig: JSON.stringify(seed) } }]);
    seedBun(doc);
    const json = await call('get_canvas', {}, { permissions: READ });
    expect(json.result?.structuredContent).toMatchObject({
      background: '#123456',
      layers: [LAYER],
    });
    expect(readCanvasContents(doc, 'map')).toBeNull();
  });

  it.each([
    ['doc-1', 'not CANVAS'],
    ['nope', 'not found'],
  ])('refuses element %s', async (elementId, message) => {
    seedBun();
    const json = await call('get_canvas', { elementId }, { permissions: READ });
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain(message);
  });

  it('refuses a missing element id, and bad paging', async () => {
    seedBun();
    expect((await call('get_canvas', { elementId: ' ' })).result?.isError).toBe(true);
    const bad = await call('get_canvas', { limit: 0 }, { permissions: READ });
    expect(bad.result?.content?.[0]?.text).toContain('limit');
  });
});

describe('edit_canvas', () => {
  it('writes objects where the app reads them, and records activity', async () => {
    const { doc, activity } = seedBun();
    const json = await call('edit_canvas', {
      background: '#101010',
      add: [{ id: 'title', type: 'text', text: 'Northreach', x: 40, y: 60, fontSize: 72 }],
    });

    expect(json.result?.isError).toBeUndefined();
    expect(json.result?.structuredContent).toMatchObject({
      success: true,
      created: ['title'],
      objectCount: 1,
      undo: { delete: ['title'] },
    });
    const contents = stored(doc);
    expect(contents.background).toBe('#101010');
    expect(contents.layers).toHaveLength(1);
    expect(contents.objects[0]).toMatchObject({
      id: 'title',
      type: 'text',
      layerId: contents.layers[0].id,
      fontSize: 72,
    });
    expect(activity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: 'map', entityName: 'World Map', wordsDelta: 0 })
    );
  });

  it('mirrors the result onto the element for archives and the media scan', async () => {
    const { doc } = seedBun();
    await call('edit_canvas', { add: [{ id: 'a', type: 'pin', label: 'a' }] });
    const snapshot = JSON.parse(element(doc)?.metadata?.canvasConfig ?? '{}') as CanvasContents;
    expect(snapshot).toEqual(stored(doc));
    expect(snapshot.objects.map((o) => o.id)).toEqual(['a']);
    // Rewriting the element keeps its place and the others.
    expect(
      doc
        .getArray<{ id: string }>('elements')
        .toArray()
        .map((e) => e.id)
    ).toEqual(['map', 'doc-1', 'town']);
  });

  it('keeps a canvas restored from an archive when first edited', async () => {
    const object = {
      id: 'old',
      layerId: 'l1',
      type: 'pin',
      x: 1,
      y: 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      label: 'Old',
      icon: 'place',
      color: '#000',
    };
    const seed = { layers: [LAYER], objects: [object], background: '#123456' };
    const doc = elementsDoc([{ ...ELEMENTS[0], metadata: { canvasConfig: JSON.stringify(seed) } }]);
    seedBun(doc);

    await call('edit_canvas', { add: [{ id: 'new', type: 'pin', label: 'New' }] });

    const contents = stored(doc);
    expect(contents.background).toBe('#123456');
    expect(contents.objects.map((o) => o.id)).toEqual(['old', 'new']);
  });

  it('merges with an edit from another client', async () => {
    const server = elementsDoc();
    seedBun(server);
    await call('edit_canvas', { add: [{ id: 'first', type: 'pin', label: 'a' }] });

    // A browser with the same state, drawing while the agent edits.
    const browser = new Y.Doc();
    Y.applyUpdate(browser, Y.encodeStateAsUpdate(server));
    const layerId = stored(server).layers[0].id;
    writeCanvasEdit(Y, browser, 'map', {
      upserts: [{ ...stored(server).objects[0], id: 'drawn', layerId }],
    });
    await call('edit_canvas', { add: [{ id: 'agent', type: 'pin', label: 'b' }] });
    Y.applyUpdate(server, Y.encodeStateAsUpdate(browser));
    Y.applyUpdate(browser, Y.encodeStateAsUpdate(server));

    const ids = (doc: Y.Doc) =>
      stored(doc)
        .objects.map((o) => o.id)
        .sort();
    expect(ids(server)).toEqual(['agent', 'drawn', 'first']);
    expect(ids(browser)).toEqual(ids(server));
  });

  it('writes nothing when any part of the request is invalid', async () => {
    const { doc, activity } = seedBun();
    await call('edit_canvas', { add: [{ id: 'keep', type: 'pin', label: 'a' }] });
    activity.mockClear();
    const before = Y.encodeStateVector(doc);

    const json = await call('edit_canvas', {
      add: [{ id: 'fine', type: 'pin', label: 'b' }],
      delete: ['nope'],
    });

    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('no object with id "nope"');
    expect(Y.encodeStateVector(doc)).toEqual(before);
    expect(activity).not.toHaveBeenCalled();
  });

  it('reverses an edit with the undo it returned', async () => {
    const { doc } = seedBun();
    await call('edit_canvas', {
      add: [
        { id: 'a', type: 'text', text: 'One', x: 1 },
        { id: 'b', type: 'text', text: 'Two' },
      ],
    });
    const before = stored(doc);

    const edit = await call('edit_canvas', {
      update: [{ id: 'a', x: 50 }],
      delete: ['b'],
      add: [{ id: 'c', type: 'pin', label: 'New' }],
    });
    const undo = edit.result?.structuredContent?.undo as Record<string, unknown>;
    expect(stored(doc)).not.toEqual(before);

    await call('edit_canvas', undo);
    expect(stored(doc)).toEqual(before);
    expect(JSON.parse(element(doc)?.metadata?.canvasConfig ?? '{}')).toEqual(before);
  });

  it('refuses a document, an unknown element and a missing id', async () => {
    seedBun();
    const add = [{ type: 'pin', label: 'a' }];
    const asDocument = await call('edit_canvas', { elementId: 'doc-1', add });
    expect(asDocument.result?.content?.[0]?.text).toContain('not CANVAS');
    const unknown = await call('edit_canvas', { elementId: 'nope', add });
    expect(unknown.result?.content?.[0]?.text).toContain('not found');
    const missing = await call('edit_canvas', { elementId: '', add });
    expect(missing.result?.content?.[0]?.text).toContain('elementId is required');
  });

  it('reports a failure to write as a tool error', async () => {
    const doc = elementsDoc();
    seedBun(doc);
    spies.push(
      spyOn(doc, 'transact').mockImplementation(() => {
        throw new Error('disk full');
      })
    );
    const json = await call('edit_canvas', { add: [{ type: 'pin', label: 'a' }] });
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('disk full');
  });
});

describe('placing images', () => {
  const image = (src: string) => ({ id: 'img', type: 'image', src, width: 100, height: 50 });

  it('accepts media that is in the project', async () => {
    const { doc } = seedBun();
    const exists = spyOn(FileStorageService.prototype, 'projectFileExists').mockResolvedValue(true);
    spies.push(exists);

    const json = await call('edit_canvas', { add: [image('media://img-1.png')] });

    expect(json.result?.isError).toBeUndefined();
    expect(exists).toHaveBeenCalledWith('alice', 'novel', 'img-1.png');
    expect(stored(doc).objects[0]).toMatchObject({ src: 'media://img-1.png' });
  });

  it('refuses media that is not, writing nothing', async () => {
    const { doc } = seedBun();
    spies.push(spyOn(FileStorageService.prototype, 'projectFileExists').mockResolvedValue(false));

    const json = await call('edit_canvas', { add: [image('media://typo.png')] });

    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('typo.png');
    expect(json.result?.content?.[0]?.text).toContain('create_media_upload');
    expect(readCanvasContents(doc, 'map')).toBeNull();
  });

  it('finds an id-only reference by its name, whatever the extension', async () => {
    const { doc } = seedBun();
    const list = spyOn(FileStorageService.prototype, 'listProjectFiles').mockResolvedValue([
      { filename: 'img-legacy.png', size: 1 },
    ] as never);
    spies.push(list);

    const json = await call('edit_canvas', { add: [image('media:img-legacy')] });

    expect(json.result?.isError).toBeUndefined();
    expect(list).toHaveBeenCalledWith('alice', 'novel', 'img-legacy.');
    expect(stored(doc).objects).toHaveLength(1);
  });

  it('refuses an id-only reference to nothing, writing nothing', async () => {
    const { doc } = seedBun();
    spies.push(
      spyOn(FileStorageService.prototype, 'listProjectFiles').mockResolvedValue([] as never)
    );

    const json = await call('edit_canvas', { add: [image('media:made-up')] });

    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('media:made-up');
    expect(readCanvasContents(doc, 'map')).toBeNull();
  });

  it('points to the upload tool from its description', async () => {
    const json = await rpc('tools/list', {});
    const tool = (json.result?.tools as unknown as { name: string; description: string }[]).find(
      (t) => t.name === 'edit_canvas'
    );
    expect(tool?.description).toContain('create_media_upload');
  });
});

describe('links', () => {
  it('backs a linked pin with a relationship, and removes it with the pin', async () => {
    const { doc } = seedBun();
    await call('edit_canvas', {
      add: [{ id: 'pin', type: 'pin', label: 'Town', linkedElementId: 'town' }],
    });

    const relationships = doc.getArray<Record<string, unknown>>('relationships');
    expect(relationships.toArray()).toEqual([
      expect.objectContaining({
        sourceElementId: 'map',
        targetElementId: 'town',
        relationshipTypeId: 'canvas-pin',
      }),
    ]);
    expect(stored(doc).objects[0]).toMatchObject({
      linkedElementId: 'town',
      relationshipId: relationships.get(0).id as string,
    });
    expect(doc.getArray<{ id: string }>('customRelationshipTypes').get(0).id).toBe('canvas-pin');

    await call('edit_canvas', { delete: ['pin'] });
    expect(relationships).toHaveLength(0);
  });

  it('refuses a link to an element that does not exist', async () => {
    seedBun();
    const json = await call('edit_canvas', {
      add: [{ type: 'pin', label: 'a', linkedElementId: 'nope' }],
    });
    expect(json.result?.content?.[0]?.text).toContain('no element');
  });
});

describe('create_snapshot', () => {
  it('refuses a canvas instead of saving an empty snapshot', async () => {
    seedBun();
    spies.push(spyOn(yjsService, 'getElements').mockResolvedValue(ELEMENTS as never));
    const json = await call('create_snapshot', { name: 'Before' });
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('not canvases');
  });
});

// ---------------------------------------------------------------------------
// Cloudflare Workers runtime
// ---------------------------------------------------------------------------

type DoFetch = (request: Request) => Promise<Response> | Response;

function fakeNamespace(fetch: DoFetch): DurableObjectNamespace {
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({ fetch: (request: Request) => Promise.resolve(fetch(request)) }),
  } as unknown as DurableObjectNamespace;
}

/**
 * A Durable Object holding `serverDoc`: serves its full state and applies
 * posted Yjs updates. `afterStateRead` runs once the state has been sent, to
 * simulate a collaborator editing in between.
 */
function fakeProjectObject(serverDoc: Y.Doc, afterStateRead?: () => void) {
  const posted: string[] = [];
  const fetch: DoFetch = async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/document-state') {
      expect(url.searchParams.get('documentId')).toBe('alice:novel:elements/');
      const state = Y.encodeStateAsUpdate(serverDoc);
      afterStateRead?.();
      return new Response(state, { status: 200 });
    }
    if (url.pathname === '/api/document' && request.method === 'POST') {
      const body = (await request.json()) as { yUpdate: string; mirrorCanvas?: string };
      posted.push(body.yUpdate);
      Y.applyUpdate(
        serverDoc,
        Uint8Array.from(atob(body.yUpdate), (c) => c.codePointAt(0) ?? 0)
      );
      // As the real object does: yjs-do-mirror-canvas.test.ts.
      if (body.mirrorCanvas) mirrorCanvasToElement(serverDoc, body.mirrorCanvas);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  return { env: { YJS_PROJECTS: fakeNamespace(fetch) }, posted };
}

describe('on Cloudflare Workers', () => {
  function stubActivity() {
    spies.push(spyOn(activityService, 'recordOrCoalesceEdit').mockResolvedValue(undefined));
  }

  it('reads from the document state without posting anything', async () => {
    const doc = elementsDoc();
    writeCanvasEdit(Y, doc, 'map', { layers: [LAYER], background: '#222222' });
    const { env, posted } = fakeProjectObject(doc);

    const json = await call('get_canvas', {}, { env, permissions: READ });

    expect(json.result?.structuredContent).toMatchObject({
      background: '#222222',
      layers: [LAYER],
    });
    expect(posted).toEqual([]);
  });

  it('sends only the change, merging a collaborator edit made in between', async () => {
    stubActivity();
    const server = elementsDoc();
    const collaborator = new Y.Doc();
    Y.applyUpdate(collaborator, Y.encodeStateAsUpdate(server));
    writeCanvasEdit(Y, server, 'map', { layers: [LAYER] });
    Y.applyUpdate(collaborator, Y.encodeStateAsUpdate(server));

    const { env, posted } = fakeProjectObject(server, () => {
      writeCanvasEdit(Y, collaborator, 'map', {
        upserts: [
          {
            id: 'drawn',
            layerId: 'l1',
            type: 'pin',
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            label: 'drawn',
            icon: 'place',
            color: '#000',
          },
        ],
      });
      Y.applyUpdate(server, Y.encodeStateAsUpdate(collaborator));
    });

    const json = await call(
      'edit_canvas',
      { add: [{ id: 'agent', type: 'pin', label: 'agent' }] },
      { env }
    );

    expect(json.result?.isError).toBeUndefined();
    expect(posted).toHaveLength(1);
    expect(
      stored(server)
        .objects.map((o) => o.id)
        .sort()
    ).toEqual(['agent', 'drawn']);
    // The mirror holds the merged canvas, not just what this edit saw.
    const mirrored = JSON.parse(element(server)?.metadata?.canvasConfig ?? '{}') as CanvasContents;
    expect(mirrored).toEqual(stored(server));
  });

  it('merges overlapping edits of a canvas nobody has started', async () => {
    stubActivity();
    const server = elementsDoc();
    const { env } = fakeProjectObject(server);

    const results = await Promise.all(
      ['one', 'two', 'three'].map((id) =>
        call('edit_canvas', { add: [{ id, type: 'pin', label: id }] }, { env })
      )
    );

    expect(results.map((json) => json.result?.isError)).toEqual([undefined, undefined, undefined]);
    const contents = stored(server);
    expect(contents.objects.map((o) => o.id).sort()).toEqual(['one', 'three', 'two']);
    expect(new Set(contents.objects.map((o) => o.layerId))).toEqual(
      new Set(contents.layers.map((l) => l.id))
    );

    // One element, not one copy per edit, holding everything that was drawn.
    const copies = server
      .getArray<{ id: string; metadata?: Record<string, string> }>('elements')
      .toArray()
      .filter((e) => e.id === 'map');
    expect(copies).toHaveLength(1);
    expect(JSON.parse(copies[0].metadata?.canvasConfig ?? '{}')).toEqual(contents);
  });

  it('leaves the element out of the update, for the object to mirror', async () => {
    stubActivity();
    const server = elementsDoc();
    const fromTheAgent = new Y.Doc();
    Y.applyUpdate(fromTheAgent, Y.encodeStateAsUpdate(server));
    const { env, posted } = fakeProjectObject(server);

    await call('edit_canvas', { add: [{ id: 'a', type: 'pin', label: 'a' }] }, { env });

    Y.applyUpdate(
      fromTheAgent,
      Uint8Array.from(atob(posted[0]), (c) => c.codePointAt(0) ?? 0)
    );
    expect(stored(fromTheAgent).objects.map((o) => o.id)).toEqual(['a']);
    expect(element(fromTheAgent)?.metadata).toBeUndefined();
  });

  it('posts nothing for an invalid edit', async () => {
    const { env, posted } = fakeProjectObject(elementsDoc());
    const json = await call('edit_canvas', { delete: ['nope'] }, { env });
    expect(json.result?.isError).toBe(true);
    expect(posted).toEqual([]);
  });

  it('does not mistake a failed read for an empty canvas', async () => {
    const env = {
      YJS_PROJECTS: fakeNamespace(() => new Response('down', { status: 500 })),
    };
    const json = await call('get_canvas', {}, { env, permissions: READ });
    expect(json.result?.structuredContent).toBeUndefined();
    const edited = await call('edit_canvas', { add: [{ type: 'pin', label: 'a' }] }, { env });
    expect(edited.result?.structuredContent).toBeUndefined();
  });
});
