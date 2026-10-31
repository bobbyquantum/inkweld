import type {
  CanvasImage,
  CanvasPath,
  CanvasPin,
  CanvasShape,
  CanvasText,
} from '@models/canvas.model';
import { describe, expect, it } from 'vitest';

import {
  canvasFontQuery,
  getObjectIcon,
  getObjectLabel,
  imageFitAttrs,
  rectsIntersect,
} from './canvas-utils';

// ─────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────────────────────────────────

const baseObj = {
  id: 'x',
  layerId: 'l',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

// ─────────────────────────────────────────────────────────────────────────
// getObjectIcon
// ─────────────────────────────────────────────────────────────────────────

describe('getObjectIcon', () => {
  it('should return "image" for image objects', () => {
    const obj: CanvasImage = {
      ...baseObj,
      type: 'image',
      src: 'test.png',
      width: 100,
      height: 100,
    };
    expect(getObjectIcon(obj)).toBe('image');
  });

  it('should return "title" for text objects', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'hello',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    expect(getObjectIcon(obj)).toBe('title');
  });

  it('should return "draw" for path objects', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 10, 10],
      stroke: '#000',
      strokeWidth: 2,
      closed: false,
      tension: 0,
    };
    expect(getObjectIcon(obj)).toBe('draw');
  });

  it('should return "crop_square" for shape objects', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    expect(getObjectIcon(obj)).toBe('crop_square');
  });

  it('should return "place" for pin objects', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'Pin',
      icon: 'place',
      color: '#f00',
    };
    expect(getObjectIcon(obj)).toBe('place');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// getObjectLabel
// ─────────────────────────────────────────────────────────────────────────

describe('getObjectLabel', () => {
  it('should return "Image" for image objects', () => {
    const obj: CanvasImage = {
      ...baseObj,
      type: 'image',
      src: 'test.png',
      width: 100,
      height: 100,
    };
    expect(getObjectLabel(obj)).toBe('Image');
  });

  it('should return text content for text objects', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Hello World',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    expect(getObjectLabel(obj)).toBe('Hello World');
  });

  it('should truncate long text to 30 characters', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'This is a very long text that exceeds thirty characters',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    expect(getObjectLabel(obj)).toBe('This is a very long text that ');
  });

  it('should fall back to "Text" for empty text objects', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: '',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    expect(getObjectLabel(obj)).toBe('Text');
  });

  it('should return point count for path objects', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 10, 10, 20, 20],
      stroke: '#000',
      strokeWidth: 2,
      closed: false,
      tension: 0,
    };
    expect(getObjectLabel(obj)).toBe('Path (3 pts)');
  });

  it('should return shape type for shape objects', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'ellipse',
      width: 50,
      height: 50,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 1,
    };
    expect(getObjectLabel(obj)).toBe('ellipse');
  });

  it('should return pin label for pin objects', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'My Location',
      icon: 'place',
      color: '#f00',
    };
    expect(getObjectLabel(obj)).toBe('My Location');
  });

  it('should fallback to "Pin" for empty pin labels', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: '',
      icon: 'place',
      color: '#f00',
    };
    expect(getObjectLabel(obj)).toBe('Pin');
  });

  it('should fallback to "Pin" for whitespace-only pin labels', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: '   ',
      icon: 'place',
      color: '#f00',
    };
    expect(getObjectLabel(obj)).toBe('Pin');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// rectsIntersect
// ─────────────────────────────────────────────────────────────────────────

describe('rectsIntersect', () => {
  it('should detect overlapping rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(rectsIntersect(a, b)).toBe(true);
  });

  it.each<{
    name: string;
    a: { x: number; y: number; width: number; height: number };
    b: { x: number; y: number; width: number; height: number };
    expected: boolean;
  }>([
    {
      name: 'should detect non-overlapping rects',
      a: { x: 0, y: 0, width: 10, height: 10 },
      b: { x: 20, y: 20, width: 10, height: 10 },
      expected: false,
    },
    {
      name: 'should detect edge-touching rects as non-overlapping',
      a: { x: 0, y: 0, width: 10, height: 10 },
      b: { x: 10, y: 0, width: 10, height: 10 },
      expected: false,
    },
    {
      name: 'should detect containment',
      a: { x: 0, y: 0, width: 100, height: 100 },
      b: { x: 20, y: 20, width: 10, height: 10 },
      expected: true,
    },
    {
      name: 'should handle rects overlapping only on x-axis',
      a: { x: 0, y: 0, width: 10, height: 10 },
      b: { x: 5, y: 20, width: 10, height: 10 },
      expected: false,
    },
  ])('$name', ({ a, b, expected }) => {
    expect(rectsIntersect(a, b)).toBe(expected);
  });

  it('should handle rects overlapping only on y-axis', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 5, width: 10, height: 10 };
    expect(rectsIntersect(a, b)).toBe(false);
  });

  it('should handle zero-size rects', () => {
    const a = { x: 5, y: 5, width: 0, height: 0 };
    const b = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, b)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// svgEsc
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// canvasFontQuery
// ─────────────────────────────────────────────────────────────────────────

describe('canvasFontQuery', () => {
  it.each([
    ['normal', 'normal normal 20px "Lato"'],
    ['bold', 'normal bold 20px "Lato"'],
    ['italic', 'italic normal 20px "Lato"'],
    ['bold italic', 'italic bold 20px "Lato"'],
  ] as const)('reads %s', (fontStyle, expected) => {
    expect(
      canvasFontQuery({ fontFamily: 'Lato', fontSize: 20, fontStyle })
    ).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// imageFitAttrs
// ─────────────────────────────────────────────────────────────────────────

describe('imageFitAttrs', () => {
  const box = { width: 100, height: 100 };
  const noCrop = { cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0 };

  it('stretches to the box by default', () => {
    expect(imageFitAttrs(box, 400, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      ...noCrop,
    });
  });

  it('crops the middle of the picture to cover the box', () => {
    expect(imageFitAttrs({ ...box, fit: 'cover' }, 400, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      cropX: 150,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
    });
  });

  it('crops top and bottom for a tall picture', () => {
    expect(imageFitAttrs({ ...box, fit: 'cover' }, 100, 400)).toMatchObject({
      cropX: 0,
      cropY: 150,
      cropWidth: 100,
      cropHeight: 100,
    });
  });

  it('letterboxes the picture to fit inside the box', () => {
    expect(imageFitAttrs({ ...box, fit: 'contain' }, 400, 100)).toEqual({
      x: 0,
      y: 37.5,
      width: 100,
      height: 25,
      ...noCrop,
    });
  });

  it('fills the box until the size of the picture is known', () => {
    expect(imageFitAttrs({ ...box, fit: 'cover' }, 0, 0)).toMatchObject({
      width: 100,
      height: 100,
      ...noCrop,
    });
  });
});
