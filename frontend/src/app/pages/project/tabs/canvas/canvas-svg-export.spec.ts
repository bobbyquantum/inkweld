import type {
  CanvasConfig,
  CanvasImage,
  CanvasLayer,
  CanvasObject,
  CanvasPath,
  CanvasPin,
  CanvasShape,
  CanvasText,
} from '@models/canvas.model';
import { describe, expect, it } from 'vitest';

import {
  buildSvgDocument,
  canvasImageToSvg,
  canvasObjectToSvgElement,
  canvasPathToSvg,
  canvasPinToSvg,
  canvasShapeToSvg,
  canvasTextToSvg,
  computeSvgViewBox,
} from './canvas-svg-export';

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

const defaultLayer: CanvasLayer = {
  id: 'layer-1',
  name: 'Layer 1',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

function makeConfig(
  objects: CanvasObject[],
  layers: CanvasLayer[] = [defaultLayer]
): CanvasConfig {
  return { elementId: 'test', layers, objects };
}

// ─────────────────────────────────────────────────────────────────────────
// computeSvgViewBox
// ─────────────────────────────────────────────────────────────────────────

describe('computeSvgViewBox', () => {
  it('should return default viewBox when no visible objects exist', () => {
    const config = makeConfig([]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    expect(result).toEqual({ vX: -20, vY: -20, vW: 840, vH: 640 });
  });

  it('should compute viewBox from a single rect shape', () => {
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'shape',
      shapeType: 'rect',
      x: 50,
      y: 100,
      width: 200,
      height: 150,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    // min: (50, 100), max: (250, 250) → pad 20
    expect(result).toEqual({ vX: 30, vY: 80, vW: 240, vH: 190 });
  });

  it('should compute viewBox from path objects using points', () => {
    const obj: CanvasPath = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'path',
      x: 10,
      y: 20,
      points: [0, 0, 100, 50, 200, 100],
      stroke: '#000',
      strokeWidth: 2,
      closed: false,
      tension: 0,
    };
    const config = makeConfig([obj]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    // min: (10+0, 20+0) = (10, 20), max: (10+200, 20+100) = (210, 120)
    expect(result).toEqual({ vX: -10, vY: 0, vW: 240, vH: 140 });
  });

  it('should compute viewBox from arrow shape using points', () => {
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'shape',
      shapeType: 'arrow',
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      points: [0, 0, 100, 50],
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    expect(result.vX).toBe(-20);
    expect(result.vY).toBe(-20);
  });

  it('should factor in scaleX/scaleY for shapes', () => {
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'shape',
      shapeType: 'rect',
      x: 0,
      y: 0,
      scaleX: 2,
      scaleY: 3,
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    // width = 50 * 2 = 100, height = 50 * 3 = 150
    expect(result.vW).toBe(140); // 100 + 40
    expect(result.vH).toBe(190); // 150 + 40
  });

  it('should skip hidden objects', () => {
    const hidden: CanvasShape = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'shape',
      shapeType: 'rect',
      x: 1000,
      y: 1000,
      visible: false,
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([hidden]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    // Hidden object shouldn't affect bounds → default
    expect(result).toEqual({ vX: -20, vY: -20, vW: 840, vH: 640 });
  });

  it('should only include objects from visible layers', () => {
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'hidden-layer',
      type: 'shape',
      shapeType: 'rect',
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      stroke: '#000',
      strokeWidth: 1,
    };
    const hiddenLayer: CanvasLayer = {
      ...defaultLayer,
      id: 'hidden-layer',
      visible: false,
    };
    const config = makeConfig([obj], [hiddenLayer]);
    // Pass empty visible layers array
    const result = computeSvgViewBox(config, []);
    expect(result).toEqual({ vX: -20, vY: -20, vW: 840, vH: 640 });
  });

  it('should handle pin objects using default 30x30 size', () => {
    const obj: CanvasPin = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'pin',
      x: 100,
      y: 200,
      label: 'Pin',
      icon: 'place',
      color: '#f00',
    };
    const config = makeConfig([obj]);
    const result = computeSvgViewBox(config, [defaultLayer]);
    // Pin: width/height not in object, defaults to 30
    // min: (100, 200), max: (130, 230)
    expect(result.vX).toBe(80);
    expect(result.vY).toBe(180);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canvasShapeToSvg
// ─────────────────────────────────────────────────────────────────────────

describe('canvasShapeToSvg', () => {
  const tf = 'transform="translate(10,20)"';

  it('should render a rect shape', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 100,
      height: 50,
      fill: '#ff0000',
      stroke: '#000',
      strokeWidth: 2,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('stroke="#000"');
  });

  it('should render a rect with corner radius', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
      cornerRadius: 8,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('rx="8"');
  });

  it('should render an ellipse', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'ellipse',
      width: 100,
      height: 60,
      fill: '#0f0',
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('rx="50"');
    expect(svg).toContain('ry="30"');
  });

  it('should render a line', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'line',
      width: 100,
      height: 0,
      points: [0, 0, 100, 50],
      stroke: '#000',
      strokeWidth: 2,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('<line');
    expect(svg).toContain('x1="0"');
    expect(svg).toContain('x2="100"');
  });

  it('should render an arrow with marker', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'arrow',
      width: 100,
      height: 0,
      points: [0, 0, 100, 0],
      stroke: '#333',
      strokeWidth: 2,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('<defs>');
    expect(svg).toContain('<marker');
    expect(svg).toContain('marker-end="url(#');
    expect(svg).toContain('fill="#333"');
  });

  it('should render a polygon', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'polygon',
      width: 100,
      height: 100,
      points: [0, 0, 50, 100, 100, 0],
      fill: '#f00',
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('points="0,0 50,100 100,0"');
  });

  it('should include stroke-dasharray for dashed shapes', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
      dash: [5, 3],
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('stroke-dasharray="5,3"');
  });

  it('should use "none" when fill is undefined', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('fill="none"');
  });

  it('should return empty string for unknown shape type', () => {
    const obj = {
      ...baseObj,
      type: 'shape' as const,
      shapeType: 'unknown' as never,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    expect(canvasShapeToSvg(obj, tf)).toBe('');
  });

  it('should fall back to default points for line without points', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'line',
      width: 80,
      height: 0,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasShapeToSvg(obj, tf);
    expect(svg).toContain('x2="80"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canvasTextToSvg
// ─────────────────────────────────────────────────────────────────────────

describe('canvasTextToSvg', () => {
  const tf = 'transform="translate(0,0)"';

  it('should render text with correct style attributes', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Hello',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).toContain('<text');
    expect(svg).toContain('fill="#000"');
    expect(svg).toContain('font-size:16px');
    expect(svg).toContain('font-family:Arial');
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain('>Hello</text>');
  });

  it('should map center alignment to middle anchor', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Centered',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'center',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).toContain('text-anchor="middle"');
  });

  it('should map right alignment to end anchor', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Right',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'right',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).toContain('text-anchor="end"');
  });

  it('should apply bold style', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Bold',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).toContain('font-weight:bold');
  });

  it('should apply italic style', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Italic',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'italic',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).toContain('font-style:italic');
  });

  it('should apply bold italic style', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'BoldItalic',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'bold italic',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).toContain('font-weight:bold');
    expect(svg).toContain('font-style:italic');
  });

  it('should escape special characters in text content', () => {
    const obj: CanvasText = {
      ...baseObj,
      type: 'text',
      text: '<script>alert("xss")</script>',
      fontSize: 16,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: '#000',
      width: 200,
      align: 'left',
    };
    const svg = canvasTextToSvg(obj, tf);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canvasPathToSvg
// ─────────────────────────────────────────────────────────────────────────

describe('canvasPathToSvg', () => {
  const tf = 'transform="translate(0,0)"';

  it('should render an open path', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 50, 50, 100, 0],
      stroke: '#f00',
      strokeWidth: 3,
      closed: false,
      tension: 0,
    };
    const svg = canvasPathToSvg(obj, tf);
    expect(svg).toContain('<path');
    expect(svg).toContain('d="M 0,0 L 50,50 L 100,0"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#f00"');
  });

  it('should close the path when closed flag is set', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 50, 50, 100, 0],
      stroke: '#000',
      strokeWidth: 1,
      closed: true,
      fill: '#ff0',
      tension: 0,
    };
    const svg = canvasPathToSvg(obj, tf);
    expect(svg).toContain('Z');
    expect(svg).toContain('fill="#ff0"');
  });

  it('should return empty string for paths with fewer than 4 points', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0],
      stroke: '#000',
      strokeWidth: 1,
      closed: false,
      tension: 0,
    };
    expect(canvasPathToSvg(obj, tf)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canvasImageToSvg
// ─────────────────────────────────────────────────────────────────────────

describe('canvasImageToSvg', () => {
  const tf = 'transform="translate(0,0)"';

  it('should render an image with href', () => {
    const obj: CanvasImage = {
      ...baseObj,
      type: 'image',
      src: 'https://example.com/img.png',
      width: 200,
      height: 100,
    };
    const svg = canvasImageToSvg(obj, tf);
    expect(svg).toContain('<image');
    expect(svg).toContain('href="https://example.com/img.png"');
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
  });

  it('should render placeholder rect for media: URLs', () => {
    const obj: CanvasImage = {
      ...baseObj,
      type: 'image',
      src: 'media:some-image-id',
      width: 150,
      height: 75,
    };
    const svg = canvasImageToSvg(obj, tf);
    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="#ccc"');
    expect(svg).not.toContain('<image');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canvasPinToSvg
// ─────────────────────────────────────────────────────────────────────────

describe('canvasPinToSvg', () => {
  const tf = 'transform="translate(0,0)"';

  it('should render a pin with circle and label', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'Town',
      icon: 'place',
      color: '#E53935',
    };
    const svg = canvasPinToSvg(obj, tf);
    expect(svg).toContain('<g');
    expect(svg).toContain('<circle r="12"');
    expect(svg).toContain('fill="#E53935"');
    expect(svg).toContain('>Town</text>');
  });

  it('should omit label text when label is empty', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: '',
      icon: 'place',
      color: '#f00',
    };
    const svg = canvasPinToSvg(obj, tf);
    expect(svg).not.toContain('<text');
  });

  it('should escape special characters in label', () => {
    const obj: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'A & B',
      icon: 'place',
      color: '#f00',
    };
    const svg = canvasPinToSvg(obj, tf);
    expect(svg).toContain('A &amp; B');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canvasObjectToSvgElement
// ─────────────────────────────────────────────────────────────────────────

describe('canvasObjectToSvgElement', () => {
  it('should include transform with translate', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasObjectToSvgElement(obj);
    expect(svg).toContain('transform="translate(10,20)"');
  });

  it('should include rotation in transform', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      x: 0,
      y: 0,
      rotation: 45,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasObjectToSvgElement(obj);
    expect(svg).toContain('rotate(45)');
  });

  it('should include scale in transform when not 1:1', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      x: 0,
      y: 0,
      scaleX: 2,
      scaleY: 0.5,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasObjectToSvgElement(obj);
    expect(svg).toContain('scale(2,0.5)');
  });

  it('should not include scale when 1:1', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasObjectToSvgElement(obj);
    expect(svg).not.toContain('scale(');
  });

  it('should dispatch to the correct converter per type', () => {
    const text: CanvasText = {
      ...baseObj,
      type: 'text',
      text: 'Hi',
      fontSize: 12,
      fontFamily: 'Sans',
      fontStyle: 'normal',
      fill: '#000',
      width: 100,
      align: 'left',
    };
    expect(canvasObjectToSvgElement(text)).toContain('<text');

    const path: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 10, 10],
      stroke: '#000',
      strokeWidth: 1,
      closed: false,
      tension: 0,
    };
    expect(canvasObjectToSvgElement(path)).toContain('<path');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildSvgDocument
// ─────────────────────────────────────────────────────────────────────────

describe('buildSvgDocument', () => {
  it('should produce a valid SVG document with header and layers', () => {
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'shape',
      shapeType: 'rect',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj]);
    const svg = buildSvgDocument(config);

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain(`<g id="layer-1"`);
    expect(svg).toContain('<rect');
    expect(svg).toContain('</svg>');
  });

  it('should skip hidden layers', () => {
    const hiddenLayer: CanvasLayer = {
      ...defaultLayer,
      id: 'hidden',
      visible: false,
    };
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'hidden',
      type: 'shape',
      shapeType: 'rect',
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj], [hiddenLayer]);
    const svg = buildSvgDocument(config);
    expect(svg).not.toContain('<g id="hidden"');
  });

  it('should skip layers with no visible objects', () => {
    const config = makeConfig([], [defaultLayer]);
    const svg = buildSvgDocument(config);
    expect(svg).not.toContain('<g id="layer-1"');
  });

  it('should sort layers by order', () => {
    const layer1: CanvasLayer = { ...defaultLayer, id: 'bg', order: 0 };
    const layer2: CanvasLayer = {
      ...defaultLayer,
      id: 'fg',
      name: 'FG',
      order: 1,
    };
    const obj1: CanvasShape = {
      ...baseObj,
      layerId: 'bg',
      type: 'shape',
      shapeType: 'rect',
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const obj2: CanvasShape = {
      ...baseObj,
      id: 'y',
      layerId: 'fg',
      type: 'shape',
      shapeType: 'rect',
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj1, obj2], [layer2, layer1]);
    const svg = buildSvgDocument(config);
    const bgIdx = svg.indexOf('<g id="bg"');
    const fgIdx = svg.indexOf('<g id="fg"');
    expect(bgIdx).toBeLessThan(fgIdx);
  });

  it('should include layer opacity attribute', () => {
    const layer: CanvasLayer = { ...defaultLayer, opacity: 0.5 };
    const obj: CanvasShape = {
      ...baseObj,
      layerId: 'layer-1',
      type: 'shape',
      shapeType: 'rect',
      width: 50,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const config = makeConfig([obj], [layer]);
    const svg = buildSvgDocument(config);
    expect(svg).toContain('opacity="0.5"');
  });
});
