import { describe, expect, it } from 'vitest';

import {
  type CanvasEditOptions,
  type CanvasEditPlan,
  describeCanvasEdit,
  MAX_OBJECTS_PER_EDIT,
  MAX_UNDO_CHARS,
  planCanvasEdit,
} from '../src/agent-edit';
import { CanvasInputError, MAX_POINTS } from '../src/agent-fields';
import { applyCanvasEdit, type CanvasContents } from '../src/edit';
import type {
  CanvasLayer,
  CanvasObject,
  CanvasPin,
  CanvasShape,
  CanvasText,
} from '../src/model';

function options(): CanvasEditOptions {
  let next = 0;
  return {
    canvasElementId: 'canvas',
    createId: () => `id${++next}`,
    elementExists: (id) => id === 'e1' || id === 'e2' || id === 'canvas',
  };
}

function plan(current: CanvasContents, args: Record<string, unknown>) {
  const result = planCanvasEdit(current, args, options());
  if ('error' in result) throw new Error(result.error);
  return result;
}

function refusal(current: CanvasContents, args: Record<string, unknown>) {
  const result = planCanvasEdit(current, args, options());
  if (!('error' in result)) throw new Error('expected a refusal');
  return result.error;
}

/** Run the undo arguments of an edit, and return the canvas they lead to. */
function undo(current: CanvasContents, done: CanvasEditPlan): CanvasContents {
  expect(done.undo).not.toBeNull();
  return plan(done.contents, done.undo as Record<string, unknown>).contents;
}

const LAYER: CanvasLayer = {
  id: 'l1',
  name: 'Base',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

const TOP: CanvasLayer = { ...LAYER, id: 'l2', name: 'Top', order: 1 };

const base = {
  layerId: 'l1',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const textObject: CanvasText = {
  ...base,
  id: 't',
  type: 'text',
  name: 'Hello',
  text: 'Hello',
  fontSize: 18,
  fontFamily: 'Arial',
  fontStyle: 'normal',
  fill: '#000000',
  width: 0,
  align: 'left',
};

const pinObject: CanvasPin = {
  ...base,
  id: 'p',
  type: 'pin',
  label: 'Town',
  icon: 'place',
  color: '#E53935',
  linkedElementId: 'e1',
  relationshipId: 'r1',
};

const rect: CanvasShape = {
  ...base,
  id: 'r',
  type: 'shape',
  shapeType: 'rect',
  width: 10,
  height: 10,
  stroke: '#000000',
  strokeWidth: 1,
};

function canvas(objects: CanvasObject[] = []): CanvasContents {
  return { layers: [LAYER], objects };
}

function objectIn(contents: CanvasContents, id: string) {
  return contents.objects.find((o) => o.id === id) as unknown as Record<
    string,
    unknown
  >;
}

describe('adding objects', () => {
  it('fills in defaults, using the ink colour of the canvas', () => {
    const { contents, created, edit } = plan(
      { ...canvas(), inkColor: '#ABCDEF' },
      { add: [{ type: 'text', text: 'A heading for the cover of the book' }] },
    );
    expect(created).toEqual(['id1']);
    expect(edit.upserts).toHaveLength(1);
    expect(objectIn(contents, 'id1')).toEqual({
      id: 'id1',
      type: 'text',
      layerId: 'l1',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      text: 'A heading for the cover of the book',
      name: 'A heading for the cover of the',
      fontSize: 18,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#ABCDEF',
      width: 0,
      align: 'left',
    });
  });

  it('uses the light page ink on a canvas without one', () => {
    const { contents } = plan(canvas(), { add: [{ type: 'text', text: 'a' }] });
    expect(objectIn(contents, 'id1')['fill']).toBe('#333333');
  });

  it('uses the ink colour set in the same edit', () => {
    const { contents } = plan(canvas(), {
      inkColor: '#123456',
      add: [{ type: 'path', points: [0, 0, 1, 1] }],
    });
    expect(objectIn(contents, 'id1')['stroke']).toBe('#123456');
  });

  it('takes an id the agent chose, and lets later fields overrule defaults', () => {
    const { contents } = plan(canvas(), {
      add: [{ id: 'title', type: 'text', text: 'a', fontSize: 72, x: 5 }],
    });
    expect(objectIn(contents, 'title')).toMatchObject({ fontSize: 72, x: 5 });
  });

  it('places objects in front, in the order given', () => {
    const { contents } = plan(canvas([textObject]), {
      add: [
        { id: 'a', type: 'text', text: 'a' },
        { id: 'b', type: 'text', text: 'b' },
      ],
    });
    expect(contents.objects.map((o) => o.id)).toEqual(['t', 'a', 'b']);
  });

  it('adds every kind of object', () => {
    const { contents } = plan(canvas(), {
      add: [
        { id: 'rect', type: 'shape', shapeType: 'rect', width: 5, height: 6 },
        {
          id: 'oval',
          type: 'shape',
          shapeType: 'ellipse',
          width: 5,
          height: 6,
        },
        {
          id: 'poly',
          type: 'shape',
          shapeType: 'polygon',
          points: [0, 0, 10, 0, 5, 8],
          fill: 'linear-gradient(90deg, #000 0%, #fff 100%)',
        },
        { id: 'line', type: 'shape', shapeType: 'line', width: 50 },
        {
          id: 'arrow',
          type: 'shape',
          shapeType: 'arrow',
          points: [0, 0, 9, 9],
        },
        { id: 'img', type: 'image', src: 'media://a.png', width: 1, height: 2 },
        {
          id: 'svg',
          type: 'image',
          src: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          width: 1,
          height: 2,
        },
        { id: 'pin', type: 'pin', label: 'Keep' },
        {
          id: 'ink',
          type: 'path',
          points: [0, 0, 1, 1],
          pressures: [0.2, 0.8],
          tension: 0.5,
        },
      ],
    });
    expect(contents.objects).toHaveLength(9);
    expect(objectIn(contents, 'poly')).toMatchObject({ width: 10, height: 8 });
    expect(objectIn(contents, 'arrow')).toMatchObject({ width: 9, height: 9 });
    expect(objectIn(contents, 'line')).toMatchObject({ width: 50, height: 0 });
    expect(objectIn(contents, 'pin')).toMatchObject({
      name: 'Keep',
      icon: 'place',
      color: '#E53935',
    });
  });

  it('reports the media it places', () => {
    const { placedMedia } = plan(canvas(), {
      add: [
        { type: 'image', src: 'media://a.png', width: 1, height: 1 },
        { type: 'image', src: 'media:legacy-id', width: 1, height: 1 },
        {
          type: 'image',
          src: 'data:image/png;base64,AAAA',
          width: 1,
          height: 1,
        },
      ],
    });
    expect(placedMedia).toEqual(['media://a.png', 'media:legacy-id']);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['no type', { text: 'a' }, 'type must be one of'],
    ['an unknown type', { type: 'video' }, 'type must be one of'],
    ['no text', { type: 'text' }, 'text is required'],
    ['empty text', { type: 'text', text: '' }, 'text must be a non-empty'],
    [
      'an unknown field',
      { type: 'text', text: 'a', colour: '#000' },
      'colour is not a field',
    ],
    ['a bad id', { id: 'no spaces', type: 'pin', label: 'a' }, 'id must be'],
    [
      'a non-finite x',
      { type: 'pin', label: 'a', x: Infinity },
      'x must be a number',
    ],
    ['a string x', { type: 'pin', label: 'a', x: '5' }, 'x must be a number'],
    [
      'a bad flag',
      { type: 'pin', label: 'a', visible: 'yes' },
      'visible must be true',
    ],
    [
      'a bad opacity',
      { type: 'pin', label: 'a', opacity: 2 },
      'opacity must be',
    ],
    [
      'a bad style',
      { type: 'text', text: 'a', fontStyle: 'thin' },
      'fontStyle must be',
    ],
    [
      'a font that breaks SVG',
      { type: 'text', text: 'a', fontFamily: 'a"b' },
      'fontFamily',
    ],
    [
      'a colour that breaks SVG',
      { type: 'text', text: 'a', fill: '"><script>' },
      'fill must be a CSS colour',
    ],
    [
      'a url() colour',
      { type: 'text', text: 'a', fill: 'url(//x.example/y)' },
      'fill must be a CSS colour',
    ],
    [
      'an empty colour',
      { type: 'text', text: 'a', fill: '' },
      'fill must be a CSS colour',
    ],
    ['a bad icon', { type: 'pin', label: 'a', icon: 'A b' }, 'icon must be'],
    ['odd points', { type: 'path', points: [1, 2, 3] }, 'points must be flat'],
    ['one point', { type: 'path', points: [1, 2] }, 'points must be flat'],
    [
      'non-number points',
      { type: 'path', points: 'x' },
      'points must be an array',
    ],
    [
      'bad point values',
      { type: 'path', points: [1, 2, 'a', 4] },
      'points must only hold',
    ],
    [
      'too many points',
      { type: 'path', points: Array((MAX_POINTS + 1) * 2).fill(0) },
      'more than',
    ],
    [
      'mismatched pressures',
      { type: 'path', points: [0, 0, 1, 1], pressures: [1] },
      'one value per point',
    ],
    [
      'out of range pressures',
      { type: 'path', points: [0, 0, 1, 1], pressures: [2, 2] },
      'pressures must only hold',
    ],
    [
      'an external image',
      { type: 'image', src: 'https://x.example/a.png', width: 1, height: 1 },
      'src must be project media',
    ],
    [
      'a script image',
      { type: 'image', src: 'javascript:alert(1)', width: 1, height: 1 },
      'src must be project media',
    ],
    [
      'a non-string image',
      { type: 'image', src: 5, width: 1, height: 1 },
      'src must be a string',
    ],
    [
      'a path traversal',
      { type: 'image', src: 'media://../secret.png', width: 1, height: 1 },
      'src must be project media',
    ],
    [
      'raw SVG in a data URL',
      {
        type: 'image',
        src: 'data:image/svg+xml,<svg></svg>',
        width: 1,
        height: 1,
      },
      'src must be project media',
    ],
    [
      'an image without size',
      { type: 'image', src: 'media://a.png' },
      'width is required',
    ],
    [
      'a zero image size',
      { type: 'image', src: 'media://a.png', width: 0, height: 1 },
      'width must be a number above 0',
    ],
    [
      'no shape type',
      { type: 'shape', width: 1, height: 1 },
      'shapeType is required',
    ],
    [
      'a polygon without corners',
      { type: 'shape', shapeType: 'polygon', points: [0, 0, 1, 1] },
      'three corners',
    ],
    [
      'a rect without height',
      { type: 'shape', shapeType: 'rect', width: 5 },
      'needs width and height',
    ],
    [
      'a rect whose points give it no width',
      { type: 'shape', shapeType: 'rect', points: [0, 0, 0, 10] },
      'needs width and height',
    ],
    [
      'an ellipse of no width',
      { type: 'shape', shapeType: 'ellipse', width: 0, height: 5 },
      'needs width and height',
    ],
    [
      'a line without size',
      { type: 'shape', shapeType: 'line' },
      'needs width and height',
    ],
    [
      'a layer that does not exist',
      { type: 'pin', label: 'a', layerId: 'nope' },
      'no such layer',
    ],
    [
      'a link to nothing',
      { type: 'pin', label: 'a', linkedElementId: 'gone' },
      'no element',
    ],
    [
      'a link to itself',
      { type: 'pin', label: 'a', linkedElementId: 'canvas' },
      'cannot link to itself',
    ],
  ])('refuses %s', (_name, object, message) => {
    expect(refusal(canvas(), { add: [object] })).toContain(message);
  });

  it('refuses an id already in use', () => {
    expect(
      refusal(canvas([textObject]), {
        add: [{ id: 't', type: 'text', text: 'a' }],
      }),
    ).toContain('already in use');
  });

  it('refuses something that is not an object', () => {
    expect(refusal(canvas(), { add: ['text'] })).toContain('add[0]');
    expect(refusal(canvas(), { add: 'text' })).toContain(
      'add must be an array',
    );
  });

  it('refuses too many objects in one edit', () => {
    const add = Array(MAX_OBJECTS_PER_EDIT + 1).fill({
      type: 'pin',
      label: 'a',
    });
    expect(refusal(canvas(), { add })).toContain('split it up');
  });
});

describe('design fields', () => {
  it('takes text spacing and an outline', () => {
    const { contents } = plan(canvas(), {
      add: [
        {
          id: 't',
          type: 'text',
          text: 'Title',
          lineHeight: 1.3,
          letterSpacing: 4,
          stroke: '#000000',
          strokeWidth: 2,
        },
      ],
    });
    expect(objectIn(contents, 't')).toMatchObject({
      lineHeight: 1.3,
      letterSpacing: 4,
      stroke: '#000000',
      strokeWidth: 2,
    });
  });

  it('adds no spacing or outline unless asked', () => {
    const { contents } = plan(canvas(), {
      add: [{ id: 't', type: 'text', text: 'Title' }],
    });
    expect(objectIn(contents, 't')['lineHeight']).toBeUndefined();
    expect(objectIn(contents, 't')['stroke']).toBeUndefined();
  });

  it('takes how an image fills its box', () => {
    const { contents } = plan(canvas(), {
      add: [
        {
          id: 'i',
          type: 'image',
          src: 'media://a.png',
          width: 10,
          height: 10,
          fit: 'cover',
          cornerRadius: 5,
        },
      ],
    });
    expect(objectIn(contents, 'i')).toMatchObject({
      fit: 'cover',
      cornerRadius: 5,
    });
  });

  it('takes a shadow and a blend mode on all but pins', () => {
    const shadow = { color: '#000000', blur: 4, offsetX: 1, offsetY: 2 };
    const { contents } = plan(canvas(), {
      add: [
        {
          id: 'r',
          type: 'shape',
          shapeType: 'rect',
          width: 1,
          height: 1,
          shadow: { ...shadow, opacity: 0.5 },
          blendMode: 'multiply',
        },
        { id: 't', type: 'text', text: 'a', shadow },
        { id: 'p', type: 'path', points: [0, 0, 1, 1], blendMode: 'screen' },
        {
          id: 'i',
          type: 'image',
          src: 'media://a.png',
          width: 1,
          height: 1,
          blendMode: 'overlay',
        },
      ],
    });
    expect(objectIn(contents, 'r')).toMatchObject({
      blendMode: 'multiply',
      shadow: { opacity: 0.5 },
    });
    expect(objectIn(contents, 't')['shadow']).toEqual(shadow);
    expect(
      refusal(canvas(), {
        add: [{ type: 'pin', label: 'a', shadow }],
      }),
    ).toContain('shadow is not a field');
  });

  it('clears them with null', () => {
    const start = canvas([
      {
        ...textObject,
        lineHeight: 2,
        letterSpacing: 1,
        stroke: '#000',
        strokeWidth: 1,
        blendMode: 'multiply',
        shadow: { color: '#000', blur: 1, offsetX: 0, offsetY: 0 },
      },
    ]);
    const { contents } = plan(start, {
      update: [
        {
          id: 't',
          lineHeight: null,
          letterSpacing: null,
          stroke: null,
          strokeWidth: null,
          blendMode: null,
          shadow: null,
        },
      ],
    });
    const after = objectIn(contents, 't');
    for (const key of [
      'lineHeight',
      'letterSpacing',
      'stroke',
      'strokeWidth',
      'blendMode',
      'shadow',
    ]) {
      expect(after[key], key).toBeUndefined();
    }
  });

  it.each<[string, Record<string, unknown>, string]>([
    [
      'a bad line height',
      { type: 'text', text: 'a', lineHeight: 0 },
      'lineHeight',
    ],
    [
      'huge letter spacing',
      { type: 'text', text: 'a', letterSpacing: 5000 },
      'letterSpacing',
    ],
    [
      'an outline colour that breaks SVG',
      { type: 'text', text: 'a', stroke: '"' },
      'stroke',
    ],
    [
      'an unknown fit',
      { type: 'image', src: 'media://a.png', width: 1, height: 1, fit: 'zoom' },
      'fit must be',
    ],
    [
      'a negative radius',
      {
        type: 'image',
        src: 'media://a.png',
        width: 1,
        height: 1,
        cornerRadius: -1,
      },
      'cornerRadius',
    ],
    [
      'an unknown blend mode',
      { type: 'text', text: 'a', blendMode: 'dissolve' },
      'blendMode must be',
    ],
    [
      'a shadow that is not an object',
      { type: 'text', text: 'a', shadow: 'big' },
      'shadow must be an object',
    ],
    [
      'a shadow missing a field',
      {
        type: 'text',
        text: 'a',
        shadow: { color: '#000', blur: 1, offsetX: 0 },
      },
      'shadow.offsetY is required',
    ],
    [
      'a shadow with an unknown field',
      {
        type: 'text',
        text: 'a',
        shadow: { color: '#000', blur: 1, offsetX: 0, offsetY: 0, spread: 1 },
      },
      'shadow.spread is not a field',
    ],
    [
      'a shadow colour that breaks SVG',
      {
        type: 'text',
        text: 'a',
        shadow: { color: '"', blur: 1, offsetX: 0, offsetY: 0 },
      },
      'shadow.color',
    ],
    [
      'a shadow with a bad blur',
      {
        type: 'text',
        text: 'a',
        shadow: { color: '#000', blur: -1, offsetX: 0, offsetY: 0 },
      },
      'shadow.blur',
    ],
  ])('refuses %s', (_name, object, message) => {
    expect(refusal(canvas(), { add: [object] })).toContain(message);
  });
});

describe('choosing a layer', () => {
  it('creates the first layer of a canvas that has none', () => {
    const { contents, edit } = plan(
      { layers: [], objects: [] },
      { add: [{ type: 'pin', label: 'a' }] },
    );
    expect(edit.layers).toEqual([
      {
        id: 'id1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        opacity: 1,
        order: 0,
      },
    ]);
    expect(objectIn(contents, 'id2')['layerId']).toBe('id1');
  });

  it('defaults to the topmost layer that is visible and unlocked', () => {
    const current: CanvasContents = {
      layers: [
        LAYER,
        { ...TOP, order: 1 },
        { ...TOP, id: 'l3', order: 2, locked: true },
        { ...TOP, id: 'l4', order: 3, visible: false },
      ],
      objects: [],
    };
    const { contents } = plan(current, { add: [{ type: 'pin', label: 'a' }] });
    expect(objectIn(contents, 'id1')['layerId']).toBe('l2');
  });

  it('says so when no layer can take a new object', () => {
    expect(
      refusal(
        { layers: [{ ...LAYER, locked: true }], objects: [] },
        { add: [{ type: 'pin', label: 'a' }] },
      ),
    ).toContain('every layer is hidden or locked');
  });

  it('takes a layer that only this edit locks', () => {
    const { contents } = plan(canvas(), {
      layers: [{ id: 'l1', locked: true }],
      add: [{ id: 'a', type: 'text', text: 'a', layerId: 'l1' }],
    });
    expect(objectIn(contents, 'a')).toMatchObject({ layerId: 'l1' });
  });

  it('refuses a locked layer for artwork, but not for a pin', () => {
    const current: CanvasContents = {
      layers: [LAYER, { ...TOP, locked: true }],
      objects: [],
    };
    expect(
      refusal(current, { add: [{ type: 'text', text: 'a', layerId: 'l2' }] }),
    ).toContain('is locked');
    const { contents } = plan(current, {
      add: [{ type: 'pin', label: 'a', layerId: 'l2' }],
    });
    expect(objectIn(contents, 'id1')['layerId']).toBe('l2');
  });
});

describe('updating objects', () => {
  it('merges the given fields and leaves the rest', () => {
    const { contents, updated, edit } = plan(canvas([textObject, rect]), {
      update: [{ id: 't', x: 40, text: 'Changed' }],
    });
    expect(updated).toEqual(['t']);
    expect(edit.upserts).toHaveLength(1);
    expect(objectIn(contents, 't')).toMatchObject({
      x: 40,
      text: 'Changed',
      fontSize: 18,
    });
    expect(objectIn(contents, 'r')).toBe(rect);
  });

  it('removes an optional field set to null', () => {
    const { contents } = plan(
      canvas([{ ...rect, fill: '#ff0000', dash: [1, 2] }]),
      { update: [{ id: 'r', fill: null }] },
    );
    expect(objectIn(contents, 'r')['fill']).toBeUndefined();
    expect(objectIn(contents, 'r')['dash']).toEqual([1, 2]);
  });

  it('accepts an object read back whole', () => {
    const { contents } = plan(canvas([pinObject]), {
      update: [{ ...pinObject, x: 3 }],
    });
    expect(objectIn(contents, 'p')).toMatchObject({
      x: 3,
      relationshipId: 'r1',
    });
  });

  it('moves an object to another layer', () => {
    const { contents } = plan(
      { layers: [LAYER, TOP], objects: [textObject] },
      { update: [{ id: 't', layerId: 'l2' }] },
    );
    expect(objectIn(contents, 't')['layerId']).toBe('l2');
  });

  it('reports a changed image source, not an unchanged one', () => {
    const image = {
      ...base,
      id: 'i',
      type: 'image' as const,
      src: 'media://a.png',
      width: 1,
      height: 1,
    };
    expect(
      plan(canvas([image]), { update: [{ id: 'i', x: 1 }] }).placedMedia,
    ).toEqual([]);
    expect(
      plan(canvas([image]), { update: [{ id: 'i', src: 'media://b.png' }] })
        .placedMedia,
    ).toEqual(['media://b.png']);
  });

  it('keeps old values it would not accept today if they are not touched', () => {
    const odd = { ...textObject, fill: 'var(--custom)', fontSize: 100000 };
    const { contents } = plan(canvas([odd as CanvasObject]), {
      update: [{ id: 't', x: 1 }],
    });
    expect(objectIn(contents, 't')).toMatchObject({ fontSize: 100000, x: 1 });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['no id', { x: 1 }, 'id is required'],
    ['an unknown id', { id: 'nope', x: 1 }, 'no object with id'],
    ['a change of type', { id: 't', type: 'pin' }, 'cannot change type'],
    [
      'an unknown field',
      { id: 't', points: [0, 0, 1, 1] },
      'points is not a field',
    ],
    ['a bad value', { id: 't', fontSize: -1 }, 'fontSize must be'],
    ['clearing a required field', { id: 't', text: null }, 'cannot be cleared'],
    ['a missing layer', { id: 't', layerId: 'nope' }, 'no such layer'],
  ])('refuses %s', (_name, patch, message) => {
    expect(refusal(canvas([textObject]), { update: [patch] })).toContain(
      message,
    );
  });

  it('refuses something that is not an object, or the same object twice', () => {
    expect(refusal(canvas([textObject]), { update: [5] })).toContain(
      'update[0] must be an object',
    );
    expect(
      refusal(canvas([textObject]), {
        update: [
          { id: 't', x: 1 },
          { id: 't', x: 2 },
        ],
      }),
    ).toContain('updated twice');
  });

  it('asks for new pressures when the points change', () => {
    const ink = {
      ...base,
      id: 'ink',
      type: 'path' as const,
      points: [0, 0, 1, 1],
      pressures: [0.5, 0.5],
      stroke: '#000',
      strokeWidth: 1,
      closed: false,
      tension: 0,
    };
    expect(
      refusal(canvas([ink]), {
        update: [{ id: 'ink', points: [0, 0, 1, 1, 2, 2] }],
      }),
    ).toContain('set pressures to null');
    const { contents } = plan(canvas([ink]), {
      update: [{ id: 'ink', points: [0, 0, 1, 1, 2, 2], pressures: null }],
    });
    expect(objectIn(contents, 'ink')['pressures']).toBeUndefined();
  });
});

describe('locks', () => {
  const locked = { ...textObject, locked: true };
  const lockedLayer: CanvasContents = {
    layers: [{ ...LAYER, locked: true }],
    objects: [textObject, { ...pinObject, relationshipId: undefined }],
  };

  it('refuses to change or delete a locked object', () => {
    expect(
      refusal(canvas([locked]), { update: [{ id: 't', x: 1 }] }),
    ).toContain('is locked');
    expect(refusal(canvas([locked]), { delete: ['t'] })).toContain('is locked');
  });

  it('allows an explicit unlock, along with other changes', () => {
    const { contents } = plan(canvas([locked]), {
      update: [{ id: 't', locked: false, x: 1 }],
    });
    expect(objectIn(contents, 't')).toMatchObject({ locked: false, x: 1 });
  });

  it('deletes an object that the same edit unlocks', () => {
    const { contents, deleted, updated, edit } = plan(canvas([locked, rect]), {
      update: [{ id: 't', locked: false }],
      delete: ['t'],
    });
    expect(contents.objects.map((o) => o.id)).toEqual(['r']);
    expect(deleted).toEqual(['t']);
    expect(updated).toEqual([]);
    expect(edit.upserts).toBeUndefined();
  });

  it('refuses objects on a locked layer until the layer is unlocked', () => {
    expect(refusal(lockedLayer, { update: [{ id: 't', x: 1 }] })).toContain(
      'locked layer "Base"',
    );
    expect(refusal(lockedLayer, { delete: ['t'] })).toContain('locked layer');
    const { contents } = plan(lockedLayer, {
      layers: [{ id: 'l1', locked: false }],
      update: [{ id: 't', x: 1 }],
    });
    expect(objectIn(contents, 't')['x']).toBe(1);
  });

  it('lets pins on a locked layer change: they are annotations', () => {
    const { contents } = plan(lockedLayer, { update: [{ id: 'p', x: 1 }] });
    expect(objectIn(contents, 'p')['x']).toBe(1);
  });
});

describe('deleting objects', () => {
  it('does not ask after media on an object it deletes', () => {
    const image: CanvasObject = {
      ...textObject,
      id: 'i',
      type: 'image',
      src: 'media://old.png',
      width: 10,
      height: 10,
    } as unknown as CanvasObject;

    const { placedMedia } = plan(canvas([image]), {
      update: [{ id: 'i', src: 'media://typo.png' }],
      delete: ['i'],
    });

    expect(placedMedia).toEqual([]);
  });

  it('asks once about media that several objects place', () => {
    const add = (id: string) => ({
      id,
      type: 'image',
      src: 'media://a.png',
      width: 10,
      height: 10,
    });

    const { placedMedia } = plan(canvas(), { add: [add('i'), add('j')] });

    expect(placedMedia).toEqual(['media://a.png']);
  });

  it('removes them and reports them', () => {
    const { contents, deleted, edit } = plan(canvas([textObject, rect]), {
      delete: ['t'],
    });
    expect(deleted).toEqual(['t']);
    expect(edit.deletes).toEqual(['t']);
    expect(contents.objects.map((o) => o.id)).toEqual(['r']);
  });

  it('refuses an unknown id, or a list of something else', () => {
    expect(refusal(canvas(), { delete: ['nope'] })).toContain(
      'no object with id',
    );
    expect(refusal(canvas(), { delete: [5] })).toContain('array of object ids');
  });

  it('lets an id be reused in the same edit', () => {
    const { contents } = plan(canvas([textObject, rect]), {
      delete: ['t'],
      add: [{ id: 't', type: 'text', text: 'New' }],
    });
    expect(contents.objects.map((o) => o.id)).toEqual(['r', 't']);
    expect(objectIn(contents, 't')['text']).toBe('New');
  });
});

describe('links', () => {
  it('plans a relationship for a new link', () => {
    const { contents, linksToCreate } = plan(canvas(), {
      add: [
        { id: 'a', type: 'pin', label: 'a', linkedElementId: 'e1' },
        {
          id: 'b',
          type: 'shape',
          shapeType: 'rect',
          width: 1,
          height: 1,
          linkedElementId: 'e2',
        },
      ],
    });
    expect(linksToCreate).toEqual([
      {
        objectId: 'a',
        kind: 'pin',
        targetElementId: 'e1',
        relationshipId: objectIn(contents, 'a')['relationshipId'],
      },
      {
        objectId: 'b',
        kind: 'area',
        targetElementId: 'e2',
        relationshipId: objectIn(contents, 'b')['relationshipId'],
      },
    ]);
  });

  it('removes the relationship of a deleted object', () => {
    expect(
      plan(canvas([pinObject]), { delete: ['p'] }).relationshipsToRemove,
    ).toEqual(['r1']);
  });

  it('replaces the relationship when a link changes', () => {
    const result = plan(canvas([pinObject]), {
      update: [{ id: 'p', linkedElementId: 'e2' }],
    });
    expect(result.relationshipsToRemove).toEqual(['r1']);
    expect(result.linksToCreate).toHaveLength(1);
    expect(objectIn(result.contents, 'p')['relationshipId']).toBe(
      result.linksToCreate[0].relationshipId,
    );
  });

  it('clears the relationship when a link is removed', () => {
    const result = plan(canvas([pinObject]), {
      update: [{ id: 'p', linkedElementId: null }],
    });
    expect(result.relationshipsToRemove).toEqual(['r1']);
    expect(result.linksToCreate).toEqual([]);
    expect(objectIn(result.contents, 'p')['relationshipId']).toBeUndefined();
    expect(objectIn(result.contents, 'p')['linkedElementId']).toBeUndefined();
  });

  it('leaves the relationship alone when the link is unchanged', () => {
    const result = plan(canvas([pinObject]), {
      update: [{ id: 'p', x: 1, linkedElementId: 'e1' }],
    });
    expect(result.relationshipsToRemove).toEqual([]);
    expect(result.linksToCreate).toEqual([]);
  });

  it('does not accept a link on text, a path or an image', () => {
    expect(
      refusal(canvas(), {
        add: [{ type: 'text', text: 'a', linkedElementId: 'e1' }],
      }),
    ).toContain('linkedElementId is not a field');
  });
});

describe('restacking', () => {
  const stack = canvas([
    textObject,
    rect,
    { ...rect, id: 'x' },
    { ...rect, id: 'y' },
  ]);

  it('moves objects to the front, the last one frontmost', () => {
    const { contents, edit } = plan(stack, { moveToFront: ['t', 'r'] });
    expect(contents.objects.map((o) => o.id)).toEqual(['x', 'y', 't', 'r']);
    expect(edit.order).toEqual(['x', 'y', 't', 'r']);
  });

  it('moves objects to the back, the first one rearmost', () => {
    const { contents } = plan(stack, { moveToBack: ['y', 'x'] });
    expect(contents.objects.map((o) => o.id)).toEqual(['y', 'x', 't', 'r']);
  });

  it('can restack what the same edit adds', () => {
    const { contents } = plan(stack, {
      add: [
        { id: 'bg', type: 'shape', shapeType: 'rect', width: 1, height: 1 },
      ],
      moveToBack: ['bg'],
    });
    expect(contents.objects[0].id).toBe('bg');
  });

  it('refuses unknown or repeated ids', () => {
    expect(refusal(stack, { moveToFront: ['nope'] })).toContain('no object');
    expect(refusal(stack, { moveToBack: ['t', 't'] })).toContain('id twice');
  });

  it('does not rewrite the stack for a plain add', () => {
    const { edit } = plan(stack, { add: [{ type: 'pin', label: 'a' }] });
    expect(edit.order).toBeUndefined();
  });
});

describe('layers', () => {
  it('renames, adds and reorders, keeping unnamed fields', () => {
    const { contents } = plan(
      {
        layers: [{ ...LAYER, opacity: 0.5 }, TOP],
        objects: [],
      },
      {
        layers: [
          { id: 'l2' },
          { id: 'new', name: 'New', locked: true },
          { id: 'l1', name: 'Renamed' },
        ],
      },
    );
    expect(contents.layers).toEqual([
      { ...TOP, order: 0 },
      {
        id: 'new',
        name: 'New',
        visible: true,
        locked: true,
        opacity: 1,
        order: 1,
      },
      { ...LAYER, name: 'Renamed', opacity: 0.5, order: 2 },
    ]);
  });

  it('gives a new layer an id, and lets the same edit fill it', () => {
    const { contents } = plan(canvas(), {
      layers: [{ id: 'l1' }, { id: 'sketch', name: 'Sketch' }],
      add: [{ id: 'a', type: 'text', text: 'a', layerId: 'sketch' }],
    });
    expect(objectIn(contents, 'a')['layerId']).toBe('sketch');
    expect(
      plan(canvas(), { layers: [{ id: 'l1' }, { name: 'Auto' }] }).contents
        .layers[1].id,
    ).toBe('id1');
  });

  it('refuses to strand artwork on a removed layer', () => {
    const current = { layers: [LAYER, TOP], objects: [textObject] };
    expect(refusal(current, { layers: [{ id: 'l2' }] })).toContain(
      'still holds 1 objects',
    );
  });

  it('removes a layer whose objects go in the same edit', () => {
    const current = { layers: [LAYER, TOP], objects: [textObject] };
    expect(
      plan(current, { layers: [{ id: 'l2' }], delete: ['t'] }).contents.layers,
    ).toHaveLength(1);
    expect(
      objectIn(
        plan(current, {
          layers: [{ id: 'l2' }],
          update: [{ id: 't', layerId: 'l2' }],
        }).contents,
        't',
      )['layerId'],
    ).toBe('l2');
  });

  it('moves pins off a removed layer, as the app does', () => {
    const current = {
      layers: [LAYER, TOP],
      objects: [{ ...pinObject, layerId: 'l2' }],
    };
    const { contents, updated } = plan(current, { layers: [{ id: 'l1' }] });
    expect(objectIn(contents, 'p')['layerId']).toBe('l1');
    expect(updated).toEqual(['p']);
  });

  it('leaves objects on a layer it never knew about', () => {
    const stray = { ...textObject, layerId: 'unknown' };
    const { contents } = plan(canvas([stray]), {
      layers: [{ id: 'l1', name: 'Renamed' }],
    });
    expect(objectIn(contents, 't')['layerId']).toBe('unknown');
  });

  it.each<[string, unknown, string]>([
    ['a non-object', ['x'], 'layers[0] must be an object'],
    ['a nameless layer', [{ id: 'new' }], 'name is required'],
    ['an empty name', [{ id: 'new', name: '' }], 'name must be'],
    ['a repeated id', [{ id: 'l1' }, { id: 'l1' }], 'appears twice'],
    ['an unknown field', [{ id: 'l1', color: 'red' }], 'color is not a field'],
    ['a bad id', [{ id: 'a b', name: 'x' }], 'id must be'],
    ['a bad opacity', [{ id: 'l1', opacity: 5 }], 'opacity must be'],
  ])('refuses %s', (_name, layers, message) => {
    expect(refusal(canvas(), { layers })).toContain(message);
  });
});

describe('frames', () => {
  const frame = { name: 'Cover', x: 0, y: 0, width: 1000, height: 1600 };

  it('adds a crop frame by default, with an id', () => {
    const { contents, edit } = plan(canvas(), { frames: [frame] });
    expect(edit.frames).toEqual(contents.frames);
    expect(contents.frames).toEqual([
      { ...frame, id: 'id1', kind: 'crop', visible: true },
    ]);
  });

  it('merges into a frame with a known id, and can clear them all', () => {
    const existing = {
      ...frame,
      id: 'f',
      kind: 'canvas' as const,
      visible: true,
    };
    const current = { ...canvas(), frames: [existing] };
    expect(
      plan(current, { frames: [{ id: 'f', width: 500 }] }).contents.frames,
    ).toEqual([{ ...existing, width: 500 }]);
    expect(plan(current, { frames: [] }).contents.frames).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ['a non-object', [1], 'frames[0] must be an object'],
    ['a missing size', [{ name: 'a', x: 0, y: 0 }], 'width is required'],
    ['a zero size', [{ ...frame, width: 0 }], 'width must be a number above 0'],
    ['a bad kind', [{ ...frame, kind: 'page' }], 'kind must be'],
    [
      'an unknown field',
      [{ ...frame, rotation: 5 }],
      'rotation is not a field',
    ],
    [
      'a repeated id',
      [
        { ...frame, id: 'a' },
        { ...frame, id: 'a' },
      ],
      'appears twice',
    ],
    [
      'two canvas frames',
      [
        { ...frame, kind: 'canvas' },
        { ...frame, kind: 'canvas' },
      ],
      'at most one',
    ],
  ])('refuses %s', (_name, frames, message) => {
    expect(refusal(canvas(), { frames })).toContain(message);
  });
});

describe('page colours', () => {
  it('sets them', () => {
    const { contents, edit } = plan(canvas(), {
      background: '#000000',
      inkColor: '#FFFFFF',
    });
    expect(edit).toMatchObject({ background: '#000000', inkColor: '#FFFFFF' });
    expect(contents.background).toBe('#000000');
  });

  it('refuses something that is not a colour', () => {
    expect(refusal(canvas(), { background: '<x>' })).toContain('background');
    expect(refusal(canvas(), { inkColor: 5 })).toContain('inkColor');
  });
});

describe('nothing to do', () => {
  it('says so when no change is requested', () => {
    expect(refusal(canvas(), {})).toContain('Nothing to change');
    expect(refusal(canvas(), { project: 'a/b', elementId: 'c' })).toContain(
      'Nothing to change',
    );
    expect(refusal(canvas(), { add: [] })).toContain('Nothing to change');
  });

  it('says so when the request changes nothing', () => {
    const current = { ...canvas(), background: '#000000' };
    expect(refusal(current, { background: '#000000' })).toContain('already so');
  });
});

describe('undo', () => {
  const start: CanvasContents = {
    layers: [LAYER, TOP],
    frames: [
      {
        id: 'f',
        name: 'Cover',
        kind: 'canvas',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        visible: true,
      },
    ],
    background: '#111111',
    inkColor: '#222222',
    objects: [textObject, rect, { ...rect, id: 'x', fill: '#ff0000' }],
  };

  /** Compare ignoring relationship ids, which a re-created link gets anew. */
  function comparable(contents: CanvasContents) {
    return JSON.parse(
      JSON.stringify(contents, (key, value: unknown) =>
        key === 'relationshipId' ? undefined : value,
      ),
    ) as unknown;
  }

  it.each<[string, Record<string, unknown>]>([
    ['an add', { add: [{ type: 'pin', label: 'a' }] }],
    ['an update', { update: [{ id: 't', x: 40, text: 'Changed' }] }],
    ['a field added by an update', { update: [{ id: 'r', fill: '#00ff00' }] }],
    ['a field removed by an update', { update: [{ id: 'x', fill: null }] }],
    ['a delete', { delete: ['t'] }],
    ['a restack', { moveToFront: ['t'] }],
    ['a layer change', { layers: [{ id: 'l2' }, { id: 'l1', name: 'New' }] }],
    [
      'a new layer filled at once',
      {
        layers: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3', name: 'Three' }],
        add: [{ type: 'text', text: 'a', layerId: 'l3' }],
      },
    ],
    ['a frame change', { frames: [] }],
    ['page colours', { background: '#333333', inkColor: '#444444' }],
    [
      'a mixed edit',
      {
        add: [{ id: 'n', type: 'text', text: 'a' }],
        update: [{ id: 'r', x: 5 }],
        delete: ['x'],
        moveToBack: ['n'],
      },
    ],
  ])('reverses %s', (_name, args) => {
    const done = plan(start, args);
    expect(comparable(undo(start, done))).toEqual(comparable(start));
  });

  it('re-creates the link of a deleted pin', () => {
    const current = canvas([pinObject]);
    const done = plan(current, { delete: ['p'] });
    const undone = plan(done.contents, done.undo as Record<string, unknown>);
    expect(undone.linksToCreate).toEqual([
      expect.objectContaining({ objectId: 'p', targetElementId: 'e1' }),
    ]);
  });

  it('restores the old link when one changed', () => {
    const current = canvas([pinObject]);
    const done = plan(current, {
      update: [{ id: 'p', linkedElementId: 'e2' }],
    });
    expect(done.undo).toEqual({
      update: [{ id: 'p', linkedElementId: 'e1' }],
    });
  });

  it('leaves out page colours a canvas never had', () => {
    const done = plan(canvas(), { background: '#000000', inkColor: '#ffffff' });
    expect(done.undo).toBeNull();
  });

  it('keeps the first layer of a canvas that had none', () => {
    const done = plan(
      { layers: [], objects: [] },
      { add: [{ id: 'a', type: 'pin', label: 'a' }] },
    );
    expect(done.undo).toEqual({ delete: ['a'] });
  });

  describe('around a layer lock', () => {
    const lockedLayer: CanvasContents = {
      layers: [{ ...LAYER, locked: true }],
      objects: [textObject],
    };
    const lockedRect = {
      id: 'r',
      type: 'shape',
      shapeType: 'rect',
      width: 5,
      height: 6,
      locked: true,
    };

    it('can take back an edit that unlocked a layer to work on it', () => {
      const done = plan(lockedLayer, {
        layers: [{ id: 'l1', locked: false }],
        update: [{ id: 't', x: 99 }],
        add: [lockedRect],
      });
      expect(comparable(undo(lockedLayer, done))).toEqual(
        comparable(lockedLayer),
      );
    });

    it('can take back an edit that deleted from a layer it unlocked', () => {
      const done = plan(lockedLayer, {
        layers: [{ id: 'l1', locked: false }],
        delete: ['t'],
      });
      expect(comparable(undo(lockedLayer, done))).toEqual(
        comparable(lockedLayer),
      );
    });

    it('can take back an edit that worked on a layer and locked it', () => {
      const start = canvas([textObject]);
      const done = plan(start, {
        layers: [{ id: 'l1', locked: true }],
        update: [{ id: 't', x: 99 }],
        add: [{ ...lockedRect, layerId: 'l1' }],
      });
      expect(comparable(undo(start, done))).toEqual(comparable(start));
    });
  });

  it('can take back an object that was added locked', () => {
    const added = plan(canvas([textObject]), {
      add: [{ id: 'a', type: 'pin', label: 'a', locked: true }],
    });
    expect(added.undo).toEqual({
      delete: ['a'],
      update: [{ id: 'a', locked: false }],
    });

    const undone = plan(added.contents, added.undo as Record<string, unknown>);
    expect(undone.contents.objects.map((o) => o.id)).toEqual(['t']);
  });

  it('is left out when it would be too large', () => {
    const huge = {
      ...textObject,
      text: 'x'.repeat(MAX_UNDO_CHARS + 1),
    };
    expect(plan(canvas([huge]), { delete: ['t'] }).undo).toBeNull();
  });
});

describe('describeCanvasEdit', () => {
  it('reports what changed and how to reverse it', () => {
    const done = plan(canvas(), {
      add: [{ id: 'a', type: 'pin', label: 'a' }],
    });
    expect(describeCanvasEdit('canvas', 'Map', done)).toEqual({
      success: true,
      elementId: 'canvas',
      elementName: 'Map',
      created: ['a'],
      updated: [],
      deleted: [],
      objectCount: 1,
      layers: [{ id: 'l1', name: 'Base' }],
      undo: { delete: ['a'] },
    });
  });

  it('says when an edit cannot be reversed this way', () => {
    const huge = { ...textObject, text: 'x'.repeat(MAX_UNDO_CHARS + 1) };
    const done = plan(canvas([huge]), { delete: ['t'] });
    const summary = describeCanvasEdit('canvas', 'Map', done);
    expect(summary['undo']).toBeUndefined();
    expect(summary['note']).toContain('too large');
  });

  it('does not blame the size when there is nothing to go back to', () => {
    const done = plan(canvas(), { background: '#ffffff' });
    const summary = describeCanvasEdit('canvas', 'Map', done);
    expect(summary['undo']).toBeUndefined();
    expect(summary['note']).toContain('no earlier value');
  });
});

describe('planCanvasEdit', () => {
  it('rethrows anything that is not a problem with the input', () => {
    expect(() =>
      planCanvasEdit(
        canvas(),
        { add: [{ type: 'pin', label: 'a' }] },
        {
          ...options(),
          createId: () => {
            throw new Error('out of ids');
          },
        },
      ),
    ).toThrow('out of ids');
  });

  it('leaves the current contents untouched', () => {
    const current = canvas([textObject]);
    const copy = JSON.stringify(current);
    plan(current, {
      update: [{ id: 't', x: 1 }],
      add: [{ type: 'pin', label: 'a' }],
    });
    expect(JSON.stringify(current)).toBe(copy);
  });

  it('agrees with applyCanvasEdit about the result', () => {
    const current = canvas([textObject]);
    const done = plan(current, { delete: ['t'] });
    expect(done.contents).toEqual(applyCanvasEdit(current, done.edit));
  });

  it('exposes its error type', () => {
    expect(new CanvasInputError('x').name).toBe('CanvasInputError');
  });
});
