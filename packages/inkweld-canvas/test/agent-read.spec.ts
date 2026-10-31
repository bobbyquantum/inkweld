import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OBJECT_LIMIT,
  describeCanvas,
  MAX_OBJECT_IDS,
  MAX_OBJECT_LIMIT,
} from '../src/agent-read';
import type { CanvasContents } from '../src/edit';
import type {
  CanvasImage,
  CanvasLayer,
  CanvasObject,
  CanvasPath,
  CanvasPin,
  CanvasText,
} from '../src/model';

const base = {
  layerId: 'l1',
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 2,
  scaleY: 1,
  visible: true,
  locked: false,
};

const stroke: CanvasPath = {
  ...base,
  id: 'stroke',
  type: 'path',
  points: [0, 0, 5, 10, -5, 4],
  pressures: [0.5, 0.5, 0.5],
  stroke: '#000',
  strokeWidth: 2,
  closed: false,
  tension: 0,
};

const longText: CanvasText = {
  ...base,
  id: 'long',
  type: 'text',
  text: 'x'.repeat(600),
  fontSize: 18,
  fontFamily: 'Arial',
  fontStyle: 'normal',
  fill: '#000',
  width: 0,
  align: 'left',
};

const inline: CanvasImage = {
  ...base,
  id: 'inline',
  type: 'image',
  src: `data:image/png;base64,${'A'.repeat(500)}`,
  width: 10,
  height: 10,
};

const linked: CanvasPin = {
  ...base,
  id: 'pin',
  type: 'pin',
  label: 'Town',
  icon: 'place',
  color: '#000',
  linkedElementId: 'e1',
  relationshipId: 'r1',
};

const LAYERS: CanvasLayer[] = [
  { id: 'l2', name: 'Top', visible: true, locked: false, opacity: 1, order: 1 },
  {
    id: 'l1',
    name: 'Base',
    visible: true,
    locked: false,
    opacity: 1,
    order: 0,
  },
];

function canvas(objects: CanvasObject[] = []): CanvasContents {
  return { layers: LAYERS, objects };
}

function view(contents: CanvasContents, args: Record<string, unknown> = {}) {
  const result = describeCanvas('c', 'Map', contents, args);
  if ('error' in result) throw new Error(String(result['error']));
  return result as {
    objects: Record<string, unknown>[];
    layers: CanvasLayer[];
    [key: string]: unknown;
  };
}

describe('describeCanvas', () => {
  it('fills in page defaults and sorts layers back to front', () => {
    const result = view(canvas());
    expect(result).toMatchObject({
      elementId: 'c',
      elementName: 'Map',
      background: '#FFFFFF',
      inkColor: '#333333',
      frames: [],
      objectCount: 0,
    });
    expect(result.layers.map((l) => l.id)).toEqual(['l1', 'l2']);
  });

  it('reports page colours and frames that are set', () => {
    const frame = {
      id: 'f',
      name: 'Page',
      kind: 'canvas' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
    };
    const result = view({
      ...canvas(),
      background: '#111111',
      inkColor: '#222222',
      frames: [frame],
    });
    expect(result).toMatchObject({
      background: '#111111',
      inkColor: '#222222',
      frames: [frame],
    });
  });

  it('summarises points as a count and bounds in canvas coordinates', () => {
    const [summary] = view(canvas([stroke])).objects;
    expect(summary['points']).toBeUndefined();
    expect(summary['pressures']).toBeUndefined();
    expect(summary['pointCount']).toBe(3);
    // Points run from x -5 to 5 and y 0 to 10; scaleX is 2, origin is (10, 20).
    expect(summary['bounds']).toEqual({ x: 0, y: 20, width: 20, height: 10 });
  });

  it('cuts long text and inline images, and says how long they were', () => {
    const [text, image] = view(canvas([longText, inline])).objects;
    expect(text['textLength']).toBe(600);
    expect((text['text'] as string).length).toBeLessThan(600);
    expect(image['srcLength']).toBe(inline.src.length);
    expect((image['src'] as string).length).toBeLessThan(100);
  });

  it('never shows the relationship behind a link', () => {
    const [summary] = view(canvas([linked])).objects;
    expect(summary['linkedElementId']).toBe('e1');
    expect(summary['relationshipId']).toBeUndefined();
    const [whole] = view(canvas([linked]), { objectIds: ['pin'] }).objects;
    expect(whole['relationshipId']).toBeUndefined();
  });

  it('returns named objects whole, and says which it could not find', () => {
    const result = view(canvas([stroke, longText]), {
      objectIds: ['long', 'stroke', 'nope'],
    });
    expect(result.objects.map((o) => o['id'])).toEqual(['stroke', 'long']);
    expect(result.objects[0]['points']).toEqual(stroke.points);
    expect(result.objects[1]['text']).toBe(longText.text);
    expect(result['missingObjectIds']).toEqual(['nope']);
  });

  it('pages through the objects', () => {
    const objects = Array.from({ length: 5 }, (_, i) => ({
      ...linked,
      id: `p${i}`,
    }));
    const first = view(canvas(objects), { limit: 2 });
    expect(first.objects.map((o) => o['id'])).toEqual(['p0', 'p1']);
    expect(first).toMatchObject({ hasMore: true, offset: 0, limit: 2 });
    const last = view(canvas(objects), { limit: 2, offset: 4 });
    expect(last.objects.map((o) => o['id'])).toEqual(['p4']);
    expect(last['hasMore']).toBe(false);
    expect(view(canvas(objects))['limit']).toBe(DEFAULT_OBJECT_LIMIT);
  });

  it('lists one layer', () => {
    const result = view(
      canvas([linked, { ...linked, id: 'other', layerId: 'l2' }]),
      { layerId: 'l2' },
    );
    expect(result.objects.map((o) => o['id'])).toEqual(['other']);
    expect(result['matchingObjects']).toBe(1);
    expect(result['objectCount']).toBe(2);
  });

  it.each([
    [{ limit: 0 }, 'limit'],
    [{ limit: MAX_OBJECT_LIMIT + 1 }, 'limit'],
    [{ limit: 1.5 }, 'limit'],
    [{ offset: -1 }, 'offset'],
    [{ layerId: 'nope' }, 'layerId'],
    [{ objectIds: 'stroke' }, 'objectIds'],
    [{ objectIds: [1] }, 'objectIds'],
    [{ objectIds: Array(MAX_OBJECT_IDS + 1).fill('a') }, 'objectIds'],
  ])('refuses %j', (args, field) => {
    const result = describeCanvas('c', 'Map', canvas(), args);
    expect(result['error']).toContain(field);
  });

  it('refuses arguments that are not an object', () => {
    expect(describeCanvas('c', 'Map', canvas(), 'nope')['error']).toBeTruthy();
  });
});
