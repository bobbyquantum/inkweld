import type {
  CanvasImage,
  CanvasPath,
  CanvasPin,
  CanvasShape,
  CanvasText,
} from '@models/canvas.model';
import { describe, expect, it } from 'vitest';

import {
  getObjectIcon,
  getObjectLabel,
  isGradientFill,
  linearGradientLine,
  parseCssGradient,
  rectsIntersect,
  svgEsc,
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

describe('svgEsc', () => {
  it('should escape ampersands', () => {
    expect(svgEsc('a & b')).toBe('a &amp; b');
  });

  it('should escape angle brackets', () => {
    expect(svgEsc('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape double quotes', () => {
    expect(svgEsc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(svgEsc("it's")).toBe('it&#39;s');
  });

  it('should escape multiple special characters at once', () => {
    expect(svgEsc('<a & "b" \'c\'>')).toBe(
      '&lt;a &amp; &quot;b&quot; &#39;c&#39;&gt;'
    );
  });

  it('should return plain strings unchanged', () => {
    expect(svgEsc('hello world')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(svgEsc('')).toBe('');
  });
});

describe('gradient fills', () => {
  it('detects gradient strings', () => {
    expect(isGradientFill('linear-gradient(90deg, #f00, #00f)')).toBe(true);
    expect(isGradientFill('radial-gradient(circle, #f00, #00f)')).toBe(true);
    expect(isGradientFill('#ff0000')).toBe(false);
    expect(isGradientFill(undefined)).toBe(false);
  });

  it('parses angle and positioned stops', () => {
    const parsed = parseCssGradient(
      'linear-gradient(45deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%)'
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('linear');
    expect(parsed!.angle).toBe(45);
    expect(parsed!.stops).toEqual([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: 'rgba(0, 0, 255, 0.5)' },
    ]);
  });

  it('distributes stops without explicit positions evenly', () => {
    const parsed = parseCssGradient('linear-gradient(#f00, #0f0, #00f)');
    expect(parsed!.stops.map(s => s.offset)).toEqual([0, 0.5, 1]);
    // No angle prefix defaults to "to bottom".
    expect(parsed!.angle).toBe(180);
  });

  it('parses radial gradients and skips shape prefixes', () => {
    const parsed = parseCssGradient(
      'radial-gradient(circle at center, #fff 0%, #000 100%)'
    );
    expect(parsed!.type).toBe('radial');
    expect(parsed!.stops).toHaveLength(2);
  });

  it('rejects non-gradients and single-stop bodies', () => {
    expect(parseCssGradient('#fff')).toBeNull();
    expect(parseCssGradient('linear-gradient(#fff)')).toBeNull();
  });

  it('computes the gradient line across a box', () => {
    // 90deg = to the right: horizontal line through the center.
    const { start, end } = linearGradientLine(90, 100, 50, { x: 50, y: 25 });
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(25);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(25);
  });
});
