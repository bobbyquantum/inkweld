import { describe, expect, it } from 'vitest';

import {
  EDIT_CANVAS_DESCRIPTION,
  EDIT_CANVAS_PROPERTIES,
  GET_CANVAS_DESCRIPTION,
  GET_CANVAS_PROPERTIES,
} from '../src/agent-tools';
import { canvasLinkRelationshipType } from '../src/links';
import {
  type CanvasFrame,
  type CanvasImage,
  type CanvasObject,
  type CanvasPin,
  type CanvasShape,
  canvasSizeFrame,
  isBackgroundImage,
  isLinkableObject,
  supportsGradientFill,
} from '../src/model';

const base = {
  id: 'o',
  layerId: 'l',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const shape = (shapeType: CanvasShape['shapeType']): CanvasShape => ({
  ...base,
  type: 'shape',
  shapeType,
  width: 1,
  height: 1,
  stroke: '#000',
  strokeWidth: 1,
});

const image: CanvasImage = {
  ...base,
  type: 'image',
  src: 'media://a.png',
  width: 1,
  height: 1,
};

const pin: CanvasPin = {
  ...base,
  type: 'pin',
  label: 'a',
  icon: 'place',
  color: '#000',
};

describe('object helpers', () => {
  it('knows which objects can have a gradient fill', () => {
    expect(supportsGradientFill(shape('rect'))).toBe(true);
    expect(supportsGradientFill(shape('ellipse'))).toBe(true);
    expect(supportsGradientFill(shape('polygon'))).toBe(true);
    expect(supportsGradientFill(shape('line'))).toBe(false);
    expect(supportsGradientFill(pin)).toBe(false);
  });

  it('recognises a background image', () => {
    expect(isBackgroundImage({ ...image, isBackground: true })).toBe(true);
    expect(isBackgroundImage(image)).toBe(false);
    expect(isBackgroundImage(pin as CanvasObject)).toBe(false);
  });

  it('knows which objects can link to an element', () => {
    expect(isLinkableObject(pin)).toBe(true);
    expect(isLinkableObject(shape('rect'))).toBe(true);
    expect(isLinkableObject(image)).toBe(false);
  });
});

describe('canvasSizeFrame', () => {
  const frame = (id: string, kind: CanvasFrame['kind']): CanvasFrame => ({
    id,
    name: id,
    kind,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    visible: true,
  });

  it('finds the canvas frame, the first when a race left two', () => {
    expect(
      canvasSizeFrame([
        frame('crop', 'crop'),
        frame('first', 'canvas'),
        frame('second', 'canvas'),
      ])?.id,
    ).toBe('first');
  });

  it('is undefined without one', () => {
    expect(canvasSizeFrame([frame('crop', 'crop')])).toBeUndefined();
    expect(canvasSizeFrame(undefined)).toBeUndefined();
  });
});

describe('canvasLinkRelationshipType', () => {
  it('names a type for each kind of link', () => {
    expect(canvasLinkRelationshipType('pin')).toMatchObject({
      id: 'canvas-pin',
      name: 'Pinned on canvas',
      category: 'Spatial',
    });
    expect(canvasLinkRelationshipType('area')).toMatchObject({
      id: 'canvas-area',
      name: 'Mapped area on canvas',
      category: 'Spatial',
    });
  });
});

describe('tool definitions', () => {
  it('describe the arguments the tools read', () => {
    expect(Object.keys(GET_CANVAS_PROPERTIES)).toEqual([
      'objectIds',
      'layerId',
      'offset',
      'limit',
    ]);
    expect(Object.keys(EDIT_CANVAS_PROPERTIES)).toEqual([
      'add',
      'update',
      'delete',
      'moveToFront',
      'moveToBack',
      'layers',
      'frames',
      'background',
      'inkColor',
    ]);
  });

  it('tell an agent the things it cannot find out by trying', () => {
    expect(GET_CANVAS_DESCRIPTION).toContain('objectIds');
    expect(EDIT_CANVAS_DESCRIPTION).toContain('undo');
    expect(EDIT_CANVAS_DESCRIPTION).toContain('ellipse and a pin');
  });
});
