import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import type { CanvasContents } from '../src/edit';
import { canvasLinkRelationshipType, writeCanvasLinks } from '../src/links';
import type { CanvasLayer, CanvasObject } from '../src/model';
import {
  CANVASES_KEY,
  mirrorCanvasToElement,
  readCanvasContents,
  readCanvasMap,
  writeCanvasEdit,
} from '../src/storage';

const LAYER: CanvasLayer = {
  id: 'l1',
  name: 'Layer 1',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

function pin(id: string): CanvasObject {
  return {
    id,
    layerId: 'l1',
    type: 'pin',
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    label: id,
    icon: 'place',
    color: '#000',
  };
}

function ids(contents: CanvasContents | null): string[] {
  return contents?.objects.map((o) => o.id) ?? [];
}

describe('readCanvasContents', () => {
  it('is null for a canvas with nothing stored', () => {
    expect(readCanvasContents(new Y.Doc(), 'c')).toBeNull();
  });

  it('survives a map without objects, and bad JSON', () => {
    const doc = new Y.Doc();
    const canvas = new Y.Map<unknown>();
    doc.getMap(CANVASES_KEY).set('c', canvas);
    canvas.set('layers', 'not json');
    canvas.set('frames', JSON.stringify([]));
    canvas.set('background', '#123456');
    expect(readCanvasMap(canvas)).toEqual({
      layers: [],
      objects: [],
      frames: [],
      background: '#123456',
    });
  });

  it('keeps an object whose ordering has not arrived, and skips bad ones', () => {
    const doc = new Y.Doc();
    writeCanvasEdit(Y, doc, 'c', { layers: [LAYER], upserts: [pin('a')] });
    const canvas = doc
      .getMap<Y.Map<unknown>>(CANVASES_KEY)
      .get('c') as Y.Map<unknown>;
    const objects = canvas.get('objects') as Y.Map<string>;
    objects.set('late', JSON.stringify(pin('late')));
    objects.set('broken', 'not json');
    (canvas.get('order') as Y.Array<string>).push(['broken', 'a']);

    expect(ids(readCanvasContents(doc, 'c'))).toEqual(['a', 'late']);
  });
});

describe('writeCanvasEdit', () => {
  it('creates the map, and writes everything the edit holds', () => {
    const doc = new Y.Doc();
    writeCanvasEdit(Y, doc, 'c', {
      layers: [LAYER],
      frames: [],
      background: '#111111',
      inkColor: '#222222',
      upserts: [pin('a'), pin('b')],
    });
    expect(readCanvasContents(doc, 'c')).toMatchObject({
      layers: [LAYER],
      frames: [],
      background: '#111111',
      inkColor: '#222222',
    });
    expect(ids(readCanvasContents(doc, 'c'))).toEqual(['a', 'b']);
  });

  it('removes deleted objects from the map and the stack', () => {
    const doc = new Y.Doc();
    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('a'), pin('b')] });
    writeCanvasEdit(Y, doc, 'c', { deletes: ['a'] });
    expect(ids(readCanvasContents(doc, 'c'))).toEqual(['b']);
  });

  it('replaces the stack only for an explicit restack', () => {
    const doc = new Y.Doc();
    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('a'), pin('b')] });
    writeCanvasEdit(Y, doc, 'c', { order: ['b', 'a'] });
    expect(ids(readCanvasContents(doc, 'c'))).toEqual(['b', 'a']);
    writeCanvasEdit(Y, doc, 'c', { order: ['b', 'a'] });
    expect(ids(readCanvasContents(doc, 'c'))).toEqual(['b', 'a']);
  });

  it('updates in place without moving an object in the stack', () => {
    const doc = new Y.Doc();
    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('a'), pin('b')] });
    writeCanvasEdit(Y, doc, 'c', { upserts: [{ ...pin('a'), x: 9 }] });
    const contents = readCanvasContents(doc, 'c');
    expect(ids(contents)).toEqual(['a', 'b']);
    expect(contents?.objects[0].x).toBe(9);
  });

  it('merges concurrent additions from two writers', () => {
    const left = new Y.Doc();
    writeCanvasEdit(Y, left, 'c', { layers: [LAYER] });
    const right = new Y.Doc();
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));

    writeCanvasEdit(Y, left, 'c', { upserts: [pin('from-left')] });
    writeCanvasEdit(Y, right, 'c', { upserts: [pin('from-right')] });
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));

    expect(ids(readCanvasContents(left, 'c')).sort()).toEqual([
      'from-left',
      'from-right',
    ]);
    expect(ids(readCanvasContents(right, 'c'))).toEqual(
      ids(readCanvasContents(left, 'c')),
    );
  });
});

describe('two writers starting the same canvas', () => {
  function bothStart(): { left: Y.Doc; right: Y.Doc } {
    const left = new Y.Doc();
    const right = new Y.Doc();
    writeCanvasEdit(Y, left, 'c', {
      layers: [LAYER],
      upserts: [pin('from-left')],
    });
    writeCanvasEdit(Y, right, 'c', {
      layers: [LAYER],
      upserts: [pin('from-right')],
    });
    return { left, right };
  }

  function sync(left: Y.Doc, right: Y.Doc): void {
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
  }

  const BOTH = ['from-left', 'from-right'];

  it('keeps what each of them wrote', () => {
    const { left, right } = bothStart();
    sync(left, right);

    expect(ids(readCanvasContents(left, 'c')).sort()).toEqual(BOTH);
    expect(ids(readCanvasContents(right, 'c'))).toEqual(
      ids(readCanvasContents(left, 'c')),
    );
  });

  it('keeps writing to the same canvas afterwards', () => {
    const { left, right } = bothStart();
    sync(left, right);

    writeCanvasEdit(Y, left, 'c', { upserts: [pin('later')] });
    sync(left, right);

    expect(ids(readCanvasContents(right, 'c')).sort()).toEqual([
      ...BOTH,
      'later',
    ]);
  });

  it('merges the same through every form a server stores updates in', () => {
    const { left, right } = bothStart();
    const merged = new Y.Doc();
    Y.applyUpdate(
      merged,
      Y.mergeUpdates([
        Y.encodeStateAsUpdate(left),
        Y.encodeStateAsUpdate(right),
      ]),
    );
    const reread = new Y.Doc();
    Y.applyUpdateV2(reread, Y.encodeStateAsUpdateV2(merged));

    expect(ids(readCanvasContents(reread, 'c')).sort()).toEqual(BOTH);
  });

  it('sends the creation in the same update as the edit', () => {
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));

    doc.transact(() =>
      writeCanvasEdit(Y, doc, 'c', { layers: [LAYER], upserts: [pin('a')] }),
    );

    expect(updates).toHaveLength(1);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, updates[0]);
    expect(ids(readCanvasContents(peer, 'c'))).toEqual(['a']);
  });

  it("leaves each writer's client id alone, and uses its own for the edit", () => {
    const { left, right } = bothStart();
    const clients = [left.clientID, right.clientID];
    sync(left, right);

    // Yjs replaces a client id it thinks another writer is using.
    expect([left.clientID, right.clientID]).toEqual(clients);
    const state = Y.decodeStateVector(Y.encodeStateVector(left));
    expect(state.get(left.clientID)).toBeGreaterThan(0);
    expect(state.get(right.clientID)).toBeGreaterThan(0);
    // Theirs, and the one they share for creating the canvas: above the range
    // of a real client id, so it can never be mistaken for one.
    const shared = [...state.keys()].filter((id) => !clients.includes(id));
    expect(shared).toHaveLength(1);
    expect(shared[0]).toBeGreaterThan(2 ** 32);
    expect(Number.isSafeInteger(shared[0])).toBe(true);
  });

  it('counts as a local change, for whatever watches the document', () => {
    const doc = new Y.Doc();
    let local: boolean | undefined;
    doc.on('afterTransaction', (transaction: Y.Transaction) => {
      local = transaction.local;
    });
    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('a')] });
    expect(local).toBe(true);
  });

  it('gives different canvases their own, in any order', () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    writeCanvasEdit(Y, left, 'map', { upserts: [pin('on-map')] });
    writeCanvasEdit(Y, left, 'cover', { upserts: [pin('on-cover')] });
    writeCanvasEdit(Y, right, 'cover', { upserts: [pin('also-on-cover')] });
    sync(left, right);

    expect(ids(readCanvasContents(right, 'map'))).toEqual(['on-map']);
    expect(ids(readCanvasContents(right, 'cover')).sort()).toEqual([
      'also-on-cover',
      'on-cover',
    ]);
  });

  it('can start a canvas again after it was deleted', () => {
    const doc = new Y.Doc();
    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('first')] });
    doc.getMap(CANVASES_KEY).delete('c');
    expect(readCanvasContents(doc, 'c')).toBeNull();

    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('second')] });

    expect(ids(readCanvasContents(doc, 'c'))).toEqual(['second']);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    expect(ids(readCanvasContents(peer, 'c'))).toEqual(['second']);
  });

  it('writes into a map that is already there, however it was made', () => {
    // What every canvas from an earlier release holds.
    const earlier = new Y.Doc();
    const canvas = new Y.Map<unknown>();
    earlier.getMap(CANVASES_KEY).set('c', canvas);
    canvas.set('layers', '[]');
    canvas.set('objects', new Y.Map<string>());
    canvas.set('order', new Y.Array<string>());
    const state = Y.decodeStateVector(Y.encodeStateVector(earlier));

    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(earlier));
    writeCanvasEdit(Y, doc, 'c', { upserts: [pin('a')] });
    Y.applyUpdate(earlier, Y.encodeStateAsUpdate(doc));

    expect(ids(readCanvasContents(earlier, 'c'))).toEqual(['a']);
    const clients = [
      ...Y.decodeStateVector(Y.encodeStateVector(doc)).keys(),
    ].sort((a, b) => a - b);
    expect(clients).toEqual(
      [...state.keys(), doc.clientID].sort((a, b) => a - b),
    );
  });
});

describe('mirrorCanvasToElement', () => {
  function docWithElement() {
    const doc = new Y.Doc();
    const elements = doc.getArray<Record<string, unknown>>('elements');
    elements.insert(0, [
      { id: 'other', name: 'Other' },
      { id: 'c', name: 'Map', metadata: { keep: 'me' } },
    ]);
    return { doc, elements };
  }

  it('writes the snapshot onto the element, keeping its other metadata', () => {
    const { doc, elements } = docWithElement();
    writeCanvasEdit(Y, doc, 'c', { layers: [LAYER], upserts: [pin('a')] });
    mirrorCanvasToElement(doc, 'c');

    const element = elements.get(1) as {
      name: string;
      metadata: Record<string, string>;
    };
    expect(elements.get(0)['id']).toBe('other');
    expect(element.name).toBe('Map');
    expect(element.metadata['keep']).toBe('me');
    expect(JSON.parse(element.metadata['canvasConfig'])).toEqual(
      readCanvasContents(doc, 'c'),
    );
  });

  it('does not rewrite an element whose snapshot is unchanged', () => {
    const { doc, elements } = docWithElement();
    writeCanvasEdit(Y, doc, 'c', { layers: [LAYER] });
    mirrorCanvasToElement(doc, 'c');

    let writes = 0;
    elements.observe(() => {
      writes += 1;
    });
    mirrorCanvasToElement(doc, 'c');
    expect(writes).toBe(0);
  });

  it('does nothing without a stored canvas, or without the element', () => {
    const { doc, elements } = docWithElement();
    mirrorCanvasToElement(doc, 'c');
    writeCanvasEdit(Y, doc, 'gone', { layers: [LAYER] });
    mirrorCanvasToElement(doc, 'gone');
    expect(elements.get(1)['metadata']).toEqual({ keep: 'me' });
  });
});

describe('writeCanvasLinks', () => {
  const NOW = '2026-10-31T00:00:00.000Z';

  it('creates the relationship and its type once', () => {
    const doc = new Y.Doc();
    writeCanvasLinks(
      doc,
      'c',
      [
        {
          objectId: 'a',
          kind: 'pin',
          targetElementId: 'e1',
          relationshipId: 'r1',
        },
        {
          objectId: 'b',
          kind: 'pin',
          targetElementId: 'e2',
          relationshipId: 'r2',
        },
        {
          objectId: 'd',
          kind: 'area',
          targetElementId: 'e3',
          relationshipId: 'r3',
        },
      ],
      [],
      NOW,
    );

    expect(doc.getArray('relationships').toArray()).toEqual([
      expect.objectContaining({
        id: 'r1',
        sourceElementId: 'c',
        targetElementId: 'e1',
        relationshipTypeId: 'canvas-pin',
        createdAt: NOW,
      }),
      expect.objectContaining({ id: 'r2', relationshipTypeId: 'canvas-pin' }),
      expect.objectContaining({ id: 'r3', relationshipTypeId: 'canvas-area' }),
    ]);
    expect(doc.getArray('customRelationshipTypes').toArray()).toEqual([
      canvasLinkRelationshipType('pin'),
      canvasLinkRelationshipType('area'),
    ]);
  });

  it('removes relationships by id, leaving the others', () => {
    const doc = new Y.Doc();
    doc.getArray('relationships').insert(0, [{ id: 'keep' }, { id: 'drop' }]);
    writeCanvasLinks(doc, 'c', [], ['drop'], NOW);
    expect(doc.getArray('relationships').toArray()).toEqual([{ id: 'keep' }]);
  });
});
