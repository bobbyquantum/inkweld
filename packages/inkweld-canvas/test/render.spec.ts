import { describe, expect, it } from 'vitest';

import type { CanvasContents } from '../src/edit';
import type {
  CanvasFrame,
  CanvasLayer,
  CanvasObject,
  CanvasShape,
  CanvasText,
} from '../src/model';
import {
  canvasLayoutWarnings,
  type CanvasRenderPlan,
  DEFAULT_RENDER_SIZE,
  describeCanvasRender,
  MAX_RENDER_SIZE,
  MIN_RENDER_SIZE,
  planCanvasRender,
} from '../src/render';
import type { TextMeasurer } from '../src/text-layout';

const LAYER: CanvasLayer = {
  id: 'l1',
  name: 'Layer',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

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

const rect = (id: string, extra: Partial<CanvasShape> = {}): CanvasShape => ({
  ...base,
  id,
  type: 'shape',
  shapeType: 'rect',
  width: 100,
  height: 50,
  stroke: '#000',
  strokeWidth: 1,
  ...extra,
});

const frame = (extra: Partial<CanvasFrame> = {}): CanvasFrame => ({
  id: 'page',
  name: 'Cover',
  kind: 'canvas',
  x: 0,
  y: 0,
  width: 1000,
  height: 1600,
  visible: true,
  ...extra,
});

const canvas = (
  objects: CanvasObject[],
  frames?: CanvasFrame[],
): CanvasContents => ({ layers: [LAYER], objects, frames });

function plan(contents: CanvasContents, args: Record<string, unknown> = {}) {
  const result = planCanvasRender(contents, args);
  if ('error' in result) throw new Error(result.error);
  return result;
}

const measure: TextMeasurer = (text) => ({
  width: Array.from(text).length * 10,
  ascent: 16,
  descent: 4,
});

describe('planCanvasRender', () => {
  it('shows the canvas-size frame by default', () => {
    const result = plan(
      canvas(
        [rect('a')],
        [frame({ id: 'crop', kind: 'crop', name: 'Crop' }), frame()],
      ),
    );
    expect(result.regionName).toBe('Cover');
    expect(result.isFrame).toBe(true);
  });

  it('fits the longest side to the size, keeping the shape', () => {
    const result = plan(canvas([], [frame()]));
    expect(result.height).toBe(DEFAULT_RENDER_SIZE);
    expect(result.width).toBe(640);
    expect(result.scale).toBeCloseTo(0.64);
  });

  it('magnifies a small region', () => {
    const result = plan(canvas([], [frame()]), {
      region: { x: 10, y: 10, width: 100, height: 50 },
      maxSize: 800,
    });
    expect(result).toMatchObject({
      width: 800,
      height: 400,
      scale: 8,
      regionName: 'the requested region',
      isFrame: false,
    });
  });

  it('shows the frame it is asked for', () => {
    const crop = frame({ id: 'crop', kind: 'crop', name: 'Spine', width: 100 });
    expect(
      plan(canvas([], [frame(), crop]), { frameId: 'crop' }),
    ).toMatchObject({ regionName: 'Spine', isFrame: true });
  });

  it('fits around the content on a canvas without a frame', () => {
    const result = plan(canvas([rect('a', { x: 100, y: 200 })]));
    expect(result.regionName).toBe('all content');
    expect(result.isFrame).toBe(false);
    // 20 units of room all round.
    expect(result.region).toEqual({ x: 80, y: 180, width: 140, height: 90 });
  });

  it('fits around what is on visible layers', () => {
    const hidden = { ...LAYER, id: 'hidden', visible: false };
    const result = plan({
      layers: [LAYER, hidden],
      objects: [
        rect('a', { x: 100, y: 100 }),
        rect('b', { layerId: 'hidden', x: 5000, y: 5000 }),
      ],
    });
    expect(result.region.x).toBe(80);
    expect(result.region.width).toBe(140);
  });

  it('takes text into account with the measure it is given', () => {
    const text: CanvasText = {
      ...base,
      id: 't',
      type: 'text',
      text: 'abcdefghij',
      fontSize: 20,
      fontFamily: 'Lato',
      fontStyle: 'normal',
      fill: '#000',
      width: 0,
      align: 'left',
    };
    const result = planCanvasRender(canvas([text]), {}, measure);
    expect('region' in result && result.region.width).toBe(140);
  });

  it('says when there is nothing to show', () => {
    expect(planCanvasRender(canvas([]), {})).toEqual({
      error: expect.stringContaining('nothing to show'),
    });
    expect(
      planCanvasRender(canvas([rect('a', { visible: false })]), {}),
    ).toEqual({ error: expect.stringContaining('nothing to show') });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['an unknown frame', { frameId: 'nope' }, 'no such frame'],
    ['a region of the wrong type', { region: 'all' }, 'region must be'],
    ['a region missing a side', { region: { x: 0, y: 0 } }, 'numeric'],
    [
      'an empty region',
      { region: { x: 0, y: 0, width: 0, height: 5 } },
      'above 0',
    ],
    ['a size too small', { maxSize: MIN_RENDER_SIZE - 1 }, 'maxSize'],
    ['a size too big', { maxSize: MAX_RENDER_SIZE + 1 }, 'maxSize'],
    ['a fractional size', { maxSize: 100.5 }, 'maxSize'],
    ['a size of the wrong type', { maxSize: '100' }, 'maxSize'],
  ])('refuses %s', (_name, args, message) => {
    const result = planCanvasRender(canvas([rect('a')], [frame()]), args);
    expect('error' in result && result.error).toContain(message);
  });

  it('names the frames there are when one is not found', () => {
    expect(planCanvasRender(canvas([], [frame()]), { frameId: 'x' })).toEqual({
      error: expect.stringContaining('page (Cover)'),
    });
    expect(planCanvasRender(canvas([]), { frameId: 'x' })).toEqual({
      error: expect.stringContaining('none'),
    });
  });

  it('accepts null for arguments it does not need', () => {
    const result = plan(canvas([], [frame()]), {
      frameId: null,
      region: null,
      maxSize: null,
    });
    expect(result.regionName).toBe('Cover');
  });
});

describe('canvasLayoutWarnings', () => {
  const page = frame({ width: 500, height: 500 });
  const warnings = (objects: CanvasObject[], layers = [LAYER]) => {
    const contents: CanvasContents = { layers, objects, frames: [page] };
    return canvasLayoutWarnings(contents, plan(contents), measure);
  };

  it('is quiet when everything is on the page', () => {
    expect(warnings([rect('a', { x: 10, y: 10 })])).toEqual([]);
  });

  it('names the edges an object runs past', () => {
    expect(warnings([rect('a', { x: 450, y: -10 })])).toEqual([
      'shape "a" runs past the top and right of Cover.',
    ]);
    expect(warnings([rect('a', { x: -5, y: 480 })])).toEqual([
      'shape "a" runs past the left and bottom of Cover.',
    ]);
  });

  it('reports an object off the page altogether', () => {
    expect(warnings([rect('a', { x: 900, name: 'Sun' })])).toEqual([
      'shape "Sun" is entirely outside Cover.',
    ]);
  });

  it('catches text that has grown past the page', () => {
    const text: CanvasText = {
      ...base,
      id: 't',
      name: 'Title',
      type: 'text',
      text: 'a very long title that will not fit',
      x: 400,
      fontSize: 20,
      fontFamily: 'Lato',
      fontStyle: 'normal',
      fill: '#000',
      width: 0,
      align: 'left',
    };
    expect(warnings([text])).toEqual([
      'text "Title" runs past the right of Cover.',
    ]);
  });

  it('judges a turned object by where it ends up', () => {
    // On the page as stored, but turning around its corner takes it off the left.
    expect(warnings([rect('a', { x: 40, y: 10, rotation: 90 })])).toEqual([
      'shape "a" runs past the left of Cover.',
    ]);
    expect(warnings([rect('a', { x: 100, y: 10, rotation: 90 })])).toEqual([]);
  });

  it('skips what is not drawn', () => {
    const hidden = { ...LAYER, id: 'hidden', visible: false };
    expect(
      warnings(
        [
          rect('a', { x: 900, visible: false }),
          rect('c', { x: 900, layerId: 'hidden' }),
          {
            ...base,
            id: 'bg',
            type: 'image',
            src: 'media://a.png',
            width: 2000,
            height: 2000,
            isBackground: true,
          },
          {
            ...rect('d'),
            shapeType: 'polygon',
            points: undefined,
          },
        ],
        [LAYER, hidden],
      ),
    ).toEqual([]);
  });

  it('has nothing to say about an area that is not a frame', () => {
    const contents = canvas([rect('a', { x: 900 })], [page]);
    const result = plan(contents, {
      region: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(canvasLayoutWarnings(contents, result, measure)).toEqual([]);
  });

  it('sums up when there are many', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      rect(`r${i}`, { x: 900 }),
    );
    const result = warnings(many);
    expect(result).toHaveLength(13);
    expect(result.at(-1)).toBe('And 3 more objects like these.');
  });
});

describe('describeCanvasRender', () => {
  const rendered: CanvasRenderPlan = {
    region: frame({ width: 500, height: 500 }),
    regionName: 'Cover',
    isFrame: true,
    width: 1024,
    height: 1024,
    scale: 2.048,
  };

  it('reports what the image shows', () => {
    expect(describeCanvasRender('c', 'Map', rendered, [])).toEqual({
      elementId: 'c',
      elementName: 'Map',
      shows: 'Cover',
      region: { x: 0, y: 0, width: 500, height: 500 },
      image: { width: 1024, height: 1024, scale: 2.048 },
    });
  });

  it('includes warnings when there are any', () => {
    expect(
      describeCanvasRender('c', 'Map', rendered, ['w'])['warnings'],
    ).toEqual(['w']);
  });
});
