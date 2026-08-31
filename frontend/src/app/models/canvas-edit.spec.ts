import { describe, expect, it } from 'vitest';

import type {
  CanvasFrame,
  CanvasLayer,
  CanvasObject,
  CanvasPath,
} from './canvas.model';
import {
  applyCanvasEdit,
  type CanvasContents,
  diffCanvasContents,
  emptyCanvasContents,
  isEmptyCanvasEdit,
  parseCanvasContents,
} from './canvas-edit';

function makeLayer(id = 'L1'): CanvasLayer {
  return { id, name: id, visible: true, locked: false, opacity: 1, order: 0 };
}

function makePath(id: string, x = 0): CanvasPath {
  return {
    id,
    layerId: 'L1',
    type: 'path',
    x,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    points: [0, 0, 10, 10],
    stroke: '#000',
    strokeWidth: 2,
    closed: false,
    tension: 0,
  };
}

function contents(
  objects: CanvasObject[],
  layers = [makeLayer()]
): CanvasContents {
  return { layers, objects };
}

describe('emptyCanvasContents', () => {
  it('has no layers and no objects', () => {
    expect(emptyCanvasContents()).toEqual({ layers: [], objects: [] });
  });
});

describe('isEmptyCanvasEdit', () => {
  it('is true for an edit with nothing in it', () => {
    expect(isEmptyCanvasEdit({})).toBe(true);
    expect(isEmptyCanvasEdit({ upserts: [], deletes: [] })).toBe(true);
  });

  it('is false when anything is set', () => {
    expect(isEmptyCanvasEdit({ layers: [] })).toBe(false);
    expect(isEmptyCanvasEdit({ order: [] })).toBe(false);
    expect(isEmptyCanvasEdit({ upserts: [makePath('a')] })).toBe(false);
    expect(isEmptyCanvasEdit({ deletes: ['a'] })).toBe(false);
  });
});

describe('diffCanvasContents', () => {
  it('reports everything as new when there is no previous state', () => {
    const a = makePath('a');
    const edit = diffCanvasContents(null, contents([a]));

    expect(edit.upserts).toEqual([a]);
    expect(edit.layers).toBeDefined();
    expect(edit.deletes).toBeUndefined();
  });

  it('is empty when nothing changed', () => {
    const state = contents([makePath('a'), makePath('b')]);
    expect(isEmptyCanvasEdit(diffCanvasContents(state, state))).toBe(true);
  });

  it('reports only the object that changed', () => {
    const a = makePath('a');
    const b = makePath('b');
    const movedB = { ...b, x: 40 };

    const edit = diffCanvasContents(contents([a, b]), contents([a, movedB]));

    expect(edit.upserts).toEqual([movedB]);
    expect(edit.deletes).toBeUndefined();
    expect(edit.order).toBeUndefined();
  });

  it('treats an appended object as an upsert without an order change', () => {
    const a = makePath('a');
    const b = makePath('b');

    const edit = diffCanvasContents(contents([a]), contents([a, b]));

    expect(edit.upserts).toEqual([b]);
    expect(edit.order).toBeUndefined();
  });

  it('reports removed objects', () => {
    const a = makePath('a');
    const b = makePath('b');

    const edit = diffCanvasContents(contents([a, b]), contents([a]));

    expect(edit.deletes).toEqual(['b']);
    expect(edit.upserts).toBeUndefined();
    expect(edit.order).toBeUndefined();
  });

  it('reports the full order when objects are restacked', () => {
    const a = makePath('a');
    const b = makePath('b');

    const edit = diffCanvasContents(contents([a, b]), contents([b, a]));

    expect(edit.order).toEqual(['b', 'a']);
  });

  it('does not report an order change when a middle object is removed', () => {
    const a = makePath('a');
    const b = makePath('b');
    const c = makePath('c');

    const edit = diffCanvasContents(contents([a, b, c]), contents([a, c]));

    expect(edit.deletes).toEqual(['b']);
    expect(edit.order).toBeUndefined();
  });

  it('reports an order change when a removal is combined with a restack', () => {
    const a = makePath('a');
    const b = makePath('b');
    const c = makePath('c');

    const edit = diffCanvasContents(contents([a, b, c]), contents([c, a]));

    expect(edit.deletes).toEqual(['b']);
    expect(edit.order).toEqual(['c', 'a']);
  });

  it('reports layers only when the layer list changed', () => {
    const layers = [makeLayer()];
    const a = makePath('a');

    expect(
      diffCanvasContents(contents([a], layers), contents([a], layers)).layers
    ).toBeUndefined();

    const renamed = [{ ...layers[0], name: 'Renamed' }];
    expect(
      diffCanvasContents(contents([a], layers), contents([a], renamed)).layers
    ).toEqual(renamed);
  });
});

describe('applyCanvasEdit', () => {
  it('adds new objects at the end', () => {
    const a = makePath('a');
    const b = makePath('b');

    const result = applyCanvasEdit(contents([a]), { upserts: [b] });
    expect(result.objects.map(o => o.id)).toEqual(['a', 'b']);
  });

  it('replaces an existing object in place', () => {
    const a = makePath('a');
    const b = makePath('b');
    const movedA = { ...a, x: 99 };

    const result = applyCanvasEdit(contents([a, b]), { upserts: [movedA] });
    expect(result.objects.map(o => o.id)).toEqual(['a', 'b']);
    expect(result.objects[0]).toBe(movedA);
  });

  it('removes deleted objects', () => {
    const a = makePath('a');
    const b = makePath('b');

    const result = applyCanvasEdit(contents([a, b]), { deletes: ['a'] });
    expect(result.objects.map(o => o.id)).toEqual(['b']);
  });

  it('ignores deletes for objects that are already gone', () => {
    const a = makePath('a');
    const result = applyCanvasEdit(contents([a]), { deletes: ['nope'] });
    expect(result.objects.map(o => o.id)).toEqual(['a']);
  });

  it('applies an explicit order', () => {
    const a = makePath('a');
    const b = makePath('b');
    const c = makePath('c');

    const result = applyCanvasEdit(contents([a, b, c]), {
      order: ['c', 'a', 'b'],
    });
    expect(result.objects.map(o => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps objects the order forgot', () => {
    const a = makePath('a');
    const b = makePath('b');

    const result = applyCanvasEdit(contents([a, b]), { order: ['b'] });
    expect(result.objects.map(o => o.id)).toEqual(['b', 'a']);
  });

  it('ignores ids in the order that no longer exist', () => {
    const a = makePath('a');
    const result = applyCanvasEdit(contents([a]), { order: ['ghost', 'a'] });
    expect(result.objects.map(o => o.id)).toEqual(['a']);
  });

  it('replaces the layer list when given one', () => {
    const layers = [makeLayer('L2')];
    const result = applyCanvasEdit(contents([]), { layers });
    expect(result.layers).toBe(layers);
  });

  it('keeps the existing layers when the edit has none', () => {
    const state = contents([]);
    expect(applyCanvasEdit(state, { upserts: [] }).layers).toBe(state.layers);
  });

  it('round-trips a diff', () => {
    const a = makePath('a');
    const b = makePath('b');
    const c = makePath('c');
    const before = contents([a, b, c]);
    const after = contents([c, { ...a, x: 5 }]);

    const result = applyCanvasEdit(before, diffCanvasContents(before, after));
    expect(result.objects.map(o => o.id)).toEqual(['c', 'a']);
    expect(result.objects.find(o => o.id === 'a')?.x).toBe(5);
  });
});

describe('frames', () => {
  const frame: CanvasFrame = {
    id: 'F1',
    name: 'Cover',
    kind: 'crop',
    x: 0,
    y: 0,
    width: 100,
    height: 160,
    visible: true,
  };

  it('isEmptyCanvasEdit is false when frames are set', () => {
    expect(isEmptyCanvasEdit({ frames: [] })).toBe(false);
  });

  it('diff omits frames when both sides have none', () => {
    const edit = diffCanvasContents(contents([]), contents([]));
    expect(edit.frames).toBeUndefined();
  });

  it('diff sends the full frame list when the reference changes', () => {
    const before: CanvasContents = { ...contents([]), frames: [frame] };
    const moved = [{ ...frame, x: 50 }];
    const after: CanvasContents = { ...contents([]), frames: moved };
    expect(diffCanvasContents(before, after).frames).toBe(moved);
  });

  it('diff sends [] when the last frame is deleted', () => {
    const before: CanvasContents = { ...contents([]), frames: [frame] };
    const after: CanvasContents = contents([]);
    expect(diffCanvasContents(before, after).frames).toEqual([]);
  });

  it('apply replaces frames and keeps them when the edit has none', () => {
    const state: CanvasContents = { ...contents([]), frames: [frame] };
    const next = [{ ...frame, name: 'Renamed' }];
    expect(applyCanvasEdit(state, { frames: next }).frames).toBe(next);
    expect(applyCanvasEdit(state, { upserts: [] }).frames).toBe(state.frames);
  });

  it('apply leaves frames absent when neither side has them', () => {
    expect(
      applyCanvasEdit(contents([]), { upserts: [] }).frames
    ).toBeUndefined();
  });

  it('parse round-trips frames and tolerates snapshots without them', () => {
    const withFrames = JSON.stringify({
      layers: [makeLayer()],
      objects: [],
      frames: [frame],
    });
    expect(parseCanvasContents(withFrames)?.frames).toEqual([frame]);

    const legacy = JSON.stringify({ layers: [makeLayer()], objects: [] });
    const parsed = parseCanvasContents(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed?.frames).toBeUndefined();
  });

  it('frames round-trip through diff + apply', () => {
    const before: CanvasContents = contents([]);
    const after: CanvasContents = { ...contents([]), frames: [frame] };
    const result = applyCanvasEdit(before, diffCanvasContents(before, after));
    expect(result.frames).toEqual([frame]);
  });
});
