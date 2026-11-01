import { describe, expect, it } from 'vitest';

import { linearGradientLine } from '../src/gradient';
import {
  type CanvasConfig,
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasText,
  LIGHT_PAGE,
} from '../src/model';
import {
  buildSvgDocument,
  canvasImageToSvg,
  canvasObjectBounds,
  canvasObjectToSvgElement,
  canvasPaintedBounds,
  canvasPathToSvg,
  canvasPinToSvg,
  canvasShapeToSvg,
  canvasTextToSvg,
  computeSvgViewBox,
  rectsOverlap,
} from '../src/svg';
import type { TextMeasurer } from '../src/text-layout';

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
  layers: CanvasLayer[] = [defaultLayer],
): CanvasConfig {
  return { elementId: 'test', layers, objects, ...LIGHT_PAGE };
}

// ─────────────────────────────────────────────────────────────────────────
// page background
// ─────────────────────────────────────────────────────────────────────────

describe('buildSvgDocument page background', () => {
  it('paints the page colour across the viewBox when set', () => {
    const svg = buildSvgDocument(
      { ...makeConfig([]), background: '#1e1e1e' },
      { x: 5, y: 10, width: 200, height: 100 },
    );
    expect(svg).toContain(
      '<rect id="page" x="5" y="10" width="200" height="100" fill="#1e1e1e"/>',
    );
    // The page sits under everything else.
    expect(svg.indexOf('id="page"')).toBeLessThan(svg.indexOf('</svg>'));
  });

  it('omits the page rect for a canvas without a background', () => {
    const { background: _omitted, ...bare } = makeConfig([]);
    const svg = buildSvgDocument(bare as CanvasConfig);
    expect(svg).not.toContain('id="page"');
  });
});

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
      strokeWidth: 0,
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
    // Centreline min (10, 20) / max (210, 120), widened by half of the 2px
    // stroke on every side so the ink itself is inside the viewBox.
    expect(result).toEqual({ vX: -11, vY: -1, vW: 242, vH: 142 });
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
    // Its head reaches 5 past its line, then 20 of padding.
    expect(result.vX).toBe(-25);
    expect(result.vY).toBe(-25);
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
      strokeWidth: 0,
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

  it('should centre the room for a pin on its position', () => {
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
    expect(result.vX).toBe(65);
    expect(result.vY).toBe(165);
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
    // Its position is its centre, as on the canvas.
    expect(svg).not.toContain('cx=');
    expect(svg).not.toContain('cy=');
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
    expect(svg).toContain('<polyline');
    expect(svg).toContain('points="0,0 100,50"');
    expect(svg).toContain('fill="none"');
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
    expect(svg).toContain('points="0,0 80,0"');
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
    expect(svg).toContain('font-size="16"');
    expect(svg).toContain('font-family="Arial"');
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain('x="0"');
    expect(svg).toContain('>Hello</tspan></text>');
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
    expect(svg).toContain('x="100"');
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
    expect(svg).toContain('x="200"');
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
    expect(svg).toContain('font-weight="bold"');
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
    expect(svg).toContain('font-style="italic"');
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
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('font-style="italic"');
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

describe('computeSvgViewBox with turned objects', () => {
  it('fits an object where turning it takes it', () => {
    const turned = {
      id: 'r',
      layerId: defaultLayer.id,
      type: 'shape',
      shapeType: 'rect',
      x: 100,
      y: 100,
      rotation: 90,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 0,
    } satisfies CanvasObject;

    const result = computeSvgViewBox(makeConfig([turned]), [defaultLayer]);

    // Around its corner: x 50 to 100, y 100 to 200, with 20 of padding.
    expect(result.vX).toBeCloseTo(30);
    expect(result.vY).toBeCloseTo(80);
    expect(result.vW).toBeCloseTo(90);
    expect(result.vH).toBeCloseTo(140);
  });
});

describe('computeSvgViewBox path bounds', () => {
  function pathAt(overrides: Partial<CanvasPath>): CanvasPath {
    return {
      ...baseObj,
      type: 'path',
      points: [0, 0, 100, 0],
      stroke: '#000',
      strokeWidth: 2,
      closed: false,
      tension: 0,
      ...overrides,
    };
  }

  const layer: CanvasLayer = {
    id: 'l',
    name: 'L',
    visible: true,
    locked: false,
    opacity: 1,
    order: 0,
  };

  it('includes the stroke half-width so wide strokes are not clipped', () => {
    const config: CanvasConfig = {
      ...LIGHT_PAGE,
      elementId: 'e',
      layers: [layer],
      objects: [pathAt({ layerId: 'l', strokeWidth: 80 })],
    };

    const box = computeSvgViewBox(config, [layer]);
    // Centreline runs along y=0; half of an 80px stroke reaches 40 either side.
    expect(box.vY).toBeLessThanOrEqual(-40);
    expect(box.vY + box.vH).toBeGreaterThanOrEqual(40);
  });

  it('allows for the swell of a pressure stroke', () => {
    const plain: CanvasConfig = {
      ...LIGHT_PAGE,
      elementId: 'e',
      layers: [layer],
      objects: [pathAt({ layerId: 'l', strokeWidth: 40 })],
    };
    const ink: CanvasConfig = {
      ...LIGHT_PAGE,
      elementId: 'e',
      layers: [layer],
      objects: [pathAt({ layerId: 'l', strokeWidth: 40, pressures: [1, 1] })],
    };

    expect(computeSvgViewBox(ink, [layer]).vH).toBeGreaterThan(
      computeSvgViewBox(plain, [layer]).vH,
    );
  });
});

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

  it('should smooth the path when tension is set', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 50, 50, 100, 0],
      stroke: '#f00',
      strokeWidth: 3,
      closed: false,
      tension: 0.5,
    };
    const svg = canvasPathToSvg(obj, tf);
    expect(svg).toContain('C ');
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('should render pressure ink as a filled outline', () => {
    const obj: CanvasPath = {
      ...baseObj,
      type: 'path',
      points: [0, 0, 50, 0, 100, 0],
      pressures: [1, 0.5, 0.2],
      stroke: '#123456',
      strokeWidth: 10,
      closed: false,
      tension: 0,
    };
    const svg = canvasPathToSvg(obj, tf);
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('stroke="none"');
    expect(svg).toContain('Z');
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
  it('should wrap translucent objects in an opacity group', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      opacity: 0.4,
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    const svg = canvasObjectToSvgElement(obj);
    expect(svg.startsWith('<g opacity="0.4">')).toBe(true);
    expect(svg.endsWith('</g>')).toBe(true);
  });

  it('should not wrap fully opaque objects', () => {
    const obj: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 100,
      height: 50,
      stroke: '#000',
      strokeWidth: 1,
    };
    expect(canvasObjectToSvgElement(obj).startsWith('<g')).toBe(false);
  });

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

describe('matching the canvas', () => {
  const tf = 'transform="translate(0,0)"';
  const fixed: TextMeasurer = (text) => ({
    width: Array.from(text).length * 10,
    ascent: 16,
    descent: 4,
  });
  const text: CanvasText = {
    ...baseObj,
    type: 'text',
    text: 'one two three',
    fontSize: 20,
    fontFamily: 'Lato',
    fontStyle: 'normal',
    fill: '#000',
    width: 0,
    align: 'left',
  };

  describe('text', () => {
    it('wraps with the measure it is given, one tspan per line', () => {
      const svg = canvasTextToSvg({ ...text, width: 80 }, tf, {
        measureText: fixed,
      });
      expect(svg.match(/<tspan/g)).toHaveLength(2);
      expect(svg).toContain('>one two</tspan>');
      expect(svg).toContain('>three</tspan>');
    });

    it('places baselines as the canvas does', () => {
      const svg = canvasTextToSvg({ ...text, width: 80, lineHeight: 1.5 }, tf, {
        measureText: fixed,
      });
      // (ascent - descent) / 2 + lineHeight / 2, then one line height apart.
      expect(svg).toContain('y="21"');
      expect(svg).toContain('y="51"');
    });

    it('centres in the widest line when no width is set', () => {
      const svg = canvasTextToSvg(
        { ...text, text: 'abcd\nab', align: 'center' },
        tf,
        { measureText: fixed },
      );
      expect(svg).toContain('x="20"');
      expect(svg).toContain('text-anchor="middle"');
    });

    it('spaces letters and draws an outline behind the fill', () => {
      const svg = canvasTextToSvg(
        { ...text, letterSpacing: 3, stroke: '#fff', strokeWidth: 2 },
        tf,
      );
      expect(svg).toContain('letter-spacing="3"');
      expect(svg).toContain('stroke="#fff"');
      expect(svg).toContain('stroke-width="2"');
      expect(svg).toContain('paint-order="stroke"');
    });

    it('leaves out spacing and outlines it does not have', () => {
      const svg = canvasTextToSvg(text, tf);
      expect(svg).not.toContain('letter-spacing');
      expect(svg).not.toContain('stroke');
    });

    it('names the font the reader has', () => {
      const svg = canvasTextToSvg(text, tf, {
        mapFontFamily: () => 'Lato Regular',
      });
      expect(svg).toContain('font-family="Lato Regular"');
    });

    it('escapes what it writes', () => {
      const svg = canvasTextToSvg(
        { ...text, text: '<b>', fontFamily: 'a"b', fill: '"><x' },
        tf,
      );
      expect(svg).toContain('&lt;b&gt;');
      expect(svg).toContain('font-family="a&quot;b"');
      expect(svg).toContain('fill="&quot;&gt;&lt;x"');
    });
  });

  describe('images', () => {
    const image: CanvasImage = {
      ...baseObj,
      type: 'image',
      src: 'media://a.png',
      width: 100,
      height: 50,
    };
    const resolveImage = () => 'data:image/png;base64,AAAA';

    it('shows what the resolver gives it, stretched by default', () => {
      const svg = canvasImageToSvg(image, tf, { resolveImage });
      expect(svg).toContain('href="data:image/png;base64,AAAA"');
      expect(svg).toContain('preserveAspectRatio="none"');
    });

    it('draws a placeholder when the resolver has nothing', () => {
      const svg = canvasImageToSvg(image, tf, { resolveImage: () => null });
      expect(svg).toContain('<rect');
      expect(svg).not.toContain('<image');
    });

    it('rounds a placeholder too', () => {
      const svg = canvasImageToSvg({ ...image, cornerRadius: 9 }, tf);
      expect(svg).toContain('rx="9"');
    });

    it.each([
      ['cover', 'xMidYMid slice'],
      ['contain', 'xMidYMid meet'],
      ['fill', 'none'],
    ] as const)('maps fit %s', (fit, expected) => {
      const svg = canvasImageToSvg({ ...image, fit }, tf, { resolveImage });
      expect(svg).toContain(`preserveAspectRatio="${expected}"`);
    });

    it('clips to rounded corners', () => {
      const svg = canvasImageToSvg({ ...image, cornerRadius: 12 }, tf, {
        resolveImage,
      });
      expect(svg).toContain('<clipPath');
      expect(svg).toContain('rx="12"');
      expect(svg).toContain('clip-path="url(#');
    });
  });

  describe('gradients', () => {
    const shape = (extra: Partial<CanvasShape>): CanvasShape => ({
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 200,
      height: 100,
      fill: 'linear-gradient(45deg, #fff, #000)',
      stroke: '#000',
      strokeWidth: 0,
      ...extra,
    });
    const attributes = (svg: string, element: string): Record<string, number> => {
      const tag = new RegExp(`<${element} [^>]*>`).exec(svg)?.[0] ?? '';
      expect(tag).toContain('gradientUnits="userSpaceOnUse"');
      return Object.fromEntries(
        [...tag.matchAll(/ (\w+)="(-?[\d.]+)"/g)].map(([, name, value]) => [
          name,
          Number(value),
        ]),
      );
    };

    it('runs across the shape as the canvas does, whatever its proportions', () => {
      const line = attributes(
        canvasShapeToSvg(shape({}), ''),
        'linearGradient',
      );
      const { start, end } = linearGradientLine(45, 200, 100, { x: 100, y: 50 });
      expect(line['x1']).toBeCloseTo(start.x);
      expect(line['y1']).toBeCloseTo(start.y);
      expect(line['x2']).toBeCloseTo(end.x);
      expect(line['y2']).toBeCloseTo(end.y);
    });

    it('runs across a polygon where its points are, not its stored size', () => {
      const line = attributes(
        canvasShapeToSvg(
          shape({
            shapeType: 'polygon',
            points: [100, 100, 300, 100, 300, 200],
            width: 10,
            height: 10,
          }),
          '',
        ),
        'linearGradient',
      );
      const { start, end } = linearGradientLine(45, 200, 100, { x: 200, y: 150 });
      expect(line['x1']).toBeCloseTo(start.x);
      expect(line['y1']).toBeCloseTo(start.y);
      expect(line['x2']).toBeCloseTo(end.x);
      expect(line['y2']).toBeCloseTo(end.y);
    });

    it('centres on an ellipse, which draws around its origin', () => {
      const line = attributes(
        canvasShapeToSvg(shape({ shapeType: 'ellipse' }), ''),
        'linearGradient',
      );
      const { start } = linearGradientLine(45, 200, 100, { x: 0, y: 0 });
      expect(line['x1']).toBeCloseTo(start.x);
      expect(line['y1']).toBeCloseTo(start.y);
    });

    it('reaches the corners with a radial gradient, as the canvas does', () => {
      const circle = attributes(
        canvasShapeToSvg(
          shape({ fill: 'radial-gradient(circle, #fff, #000)' }),
          '',
        ),
        'radialGradient',
      );
      expect(circle['cx']).toBe(100);
      expect(circle['cy']).toBe(50);
      expect(circle['r']).toBeCloseTo(Math.hypot(200, 100) / 2);
    });
  });

  describe('effects', () => {
    const rect: CanvasShape = {
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 10,
      height: 10,
      stroke: '#000',
      strokeWidth: 1,
    };
    const shadow = { color: '#123', blur: 8, offsetX: 2, offsetY: 3 };

    it('draws a shadow, whose blur is twice the standard deviation', () => {
      const svg = canvasObjectToSvgElement({ ...rect, shadow });
      expect(svg).toContain('stdDeviation="4"');
      expect(svg).toContain('dx="2"');
      expect(svg).toContain('dy="3"');
      expect(svg).toContain('flood-color="#123"');
      expect(svg).toContain('flood-opacity="1"');
      expect(svg).toContain('filter="url(#');
    });

    it('leaves room for a shadow however far it falls', () => {
      const svg = canvasObjectToSvgElement({
        ...rect,
        shadow: { ...shadow, offsetX: 400 },
      });
      const area = /filterUnits="userSpaceOnUse" x="([^"]+)" y="[^"]+" width="([^"]+)"/.exec(
        svg,
      );
      expect(area).not.toBeNull();
      const [, x, width] = area as RegExpExecArray;
      expect(Number(x) + Number(width)).toBeGreaterThanOrEqual(410);
    });

    it('gives a line a shadow, though it has no height to take a share of', () => {
      const svg = canvasObjectToSvgElement({
        ...rect,
        shapeType: 'line',
        height: 0,
        shadow,
      });
      expect(svg).toContain('filterUnits="userSpaceOnUse"');
    });

    it('casts nothing from an object that draws nothing', () => {
      const svg = canvasObjectToSvgElement({
        ...rect,
        shapeType: 'polygon',
        shadow,
      });
      expect(svg).not.toContain('<filter');
    });

    it('applies a blend mode', () => {
      const svg = canvasObjectToSvgElement({ ...rect, blendMode: 'multiply' });
      expect(svg).toContain('mix-blend-mode:multiply');
    });

    it('wraps opacity and effects around the transformed element', () => {
      const svg = canvasObjectToSvgElement({
        ...rect,
        opacity: 0.5,
        blendMode: 'screen',
        shadow: { ...shadow, opacity: 0.25 },
      });
      expect(svg).toContain('flood-opacity="0.25"');
      expect(svg).toMatch(
        /<g opacity="0\.5" filter="url\(#[^"]+\)" style="mix-blend-mode:screen">/,
      );
    });

    it('gives pins none: they have a fixed look', () => {
      const pin: CanvasPin = {
        ...baseObj,
        type: 'pin',
        label: 'a',
        icon: 'place',
        color: '#f00',
        shadow,
        blendMode: 'multiply',
      };
      const svg = canvasObjectToSvgElement(pin);
      expect(svg).not.toContain('filter');
      expect(svg).not.toContain('mix-blend-mode');
    });

    it('keeps a blend mode to its layer, as on the canvas', () => {
      const svg = buildSvgDocument(
        makeConfig([{ ...rect, layerId: 'layer-1', blendMode: 'multiply' }]),
      );
      expect(svg).toContain('style="isolation:isolate"');
    });
  });

  describe('pins', () => {
    const pin: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'Town',
      icon: 'place',
      color: '#f00',
    };

    it('shows the label in an export', () => {
      expect(canvasPinToSvg(pin, tf)).toContain('>Town</text>');
    });

    it('leaves it out to match the canvas, when asked', () => {
      expect(canvasPinToSvg(pin, tf, { pinLabels: false })).not.toContain(
        'Town',
      );
    });
  });

  describe('arrows', () => {
    it('keeps the head one size, whatever the stroke', () => {
      const svg = canvasShapeToSvg(
        {
          ...baseObj,
          type: 'shape',
          shapeType: 'arrow',
          width: 10,
          height: 0,
          points: [0, 0, 10, 0, 10, 10],
          stroke: '#000',
          strokeWidth: 6,
        },
        tf,
      );
      expect(svg).toContain('markerUnits="userSpaceOnUse"');
      expect(svg).toContain('points="0,0 10,0 10,10"');
    });
  });

  describe('bounds', () => {
    it('centres an ellipse on its position', () => {
      expect(
        canvasObjectBounds({
          ...baseObj,
          x: 100,
          y: 100,
          type: 'shape',
          shapeType: 'ellipse',
          width: 40,
          height: 20,
          stroke: '#000',
          strokeWidth: 0,
        }),
      ).toEqual({ x: 80, y: 90, width: 40, height: 20 });
    });

    it('measures text it wraps', () => {
      expect(canvasObjectBounds({ ...text, x: 5, width: 80 }, fixed)).toEqual({
        x: 5,
        y: 0,
        width: 80,
        height: 40,
      });
    });

    it('takes the width of the widest line without a fixed width', () => {
      expect(canvasObjectBounds(text, fixed)?.width).toBe(130);
    });

    it('covers a polygon or a line by its points', () => {
      expect(
        canvasObjectBounds({
          ...baseObj,
          x: 10,
          y: 10,
          type: 'shape',
          shapeType: 'polygon',
          width: 0,
          height: 0,
          points: [0, 0, 10, 0, 5, 8],
          stroke: '#000',
          strokeWidth: 0,
        }),
      ).toEqual({ x: 10, y: 10, width: 10, height: 8 });
      expect(
        canvasObjectBounds({
          ...baseObj,
          type: 'shape',
          shapeType: 'line',
          width: 30,
          height: 0,
          stroke: '#000',
          strokeWidth: 0,
        })?.width,
      ).toBe(30);
    });

    const shape = (extra: Partial<CanvasShape>): CanvasShape => ({
      ...baseObj,
      type: 'shape',
      shapeType: 'rect',
      width: 40,
      height: 20,
      stroke: '#000',
      strokeWidth: 0,
      ...extra,
    });

    it('draws back from the position of a flipped object', () => {
      const image: CanvasImage = {
        ...baseObj,
        x: 100,
        y: 100,
        type: 'image',
        src: 'x',
        width: 40,
        height: 20,
      };
      expect(canvasObjectBounds({ ...image, scaleX: -1 })).toEqual({
        x: 60,
        y: 100,
        width: 40,
        height: 20,
      });
      expect(canvasObjectBounds(shape({ x: 100, y: 100, scaleY: -2 }))).toEqual(
        { x: 100, y: 60, width: 40, height: 40 },
      );
      expect(
        canvasObjectBounds(
          shape({ x: 100, y: 100, shapeType: 'ellipse', scaleX: -1 }),
        ),
      ).toEqual({ x: 80, y: 90, width: 40, height: 20 });
      expect(canvasObjectBounds({ ...text, x: 200, scaleX: -1 }, fixed)).toEqual(
        expect.objectContaining({ x: 70, width: 130 }),
      );
    });

    it('takes in half a stroke, which scales with its object', () => {
      expect(canvasObjectBounds(shape({ strokeWidth: 4 }))).toEqual({
        x: -2,
        y: -2,
        width: 44,
        height: 24,
      });
      expect(canvasObjectBounds(shape({ strokeWidth: 4, scaleX: 3 }))).toEqual({
        x: -6,
        y: -2,
        width: 132,
        height: 24,
      });
      expect(
        canvasObjectBounds(shape({ shapeType: 'line', strokeWidth: 8 })),
      ).toEqual({ x: -4, y: -4, width: 48, height: 8 });
      expect(
        canvasObjectBounds(
          shape({ shapeType: 'polygon', points: [0, 0, 10, 0], strokeWidth: 8 }),
        ),
      ).toEqual({ x: -4, y: -4, width: 18, height: 8 });
    });

    it('leaves out a stroke that does not show', () => {
      for (const stroke of ['transparent', 'none', '']) {
        expect(canvasObjectBounds(shape({ stroke, strokeWidth: 4 }))).toEqual({
          x: 0,
          y: 0,
          width: 40,
          height: 20,
        });
      }
    });

    it('takes in the head of an arrow, however thin its line', () => {
      expect(
        canvasObjectBounds(shape({ shapeType: 'arrow', strokeWidth: 2 })),
      ).toEqual({ x: -5, y: -5, width: 50, height: 10 });
      expect(
        canvasObjectBounds(shape({ shapeType: 'arrow', strokeWidth: 30 })),
      ).toEqual({ x: -15, y: -15, width: 70, height: 30 });
    });

    it('takes in the outline of text', () => {
      expect(
        canvasObjectBounds(
          { ...text, width: 80, stroke: '#000', strokeWidth: 6 },
          fixed,
        ),
      ).toEqual({ x: -3, y: -3, width: 86, height: 46 });
    });

    it('paints as far as a shadow reaches, faded out at 1.5 blurs', () => {
      const object = shape({
        x: 100,
        y: 100,
        shadow: { color: '#000', blur: 10, offsetX: 50, offsetY: -30 },
      });
      expect(canvasObjectBounds(object)).toEqual({
        x: 100,
        y: 100,
        width: 40,
        height: 20,
      });
      expect(canvasPaintedBounds(object)).toEqual({
        x: 100,
        y: 55,
        width: 105,
        height: 65,
      });
      expect(canvasPaintedBounds(shape({ x: 7 }))?.x).toBe(7);
    });

    it('leaves out a shadow with no opacity', () => {
      const object = shape({
        shadow: { color: '#000', blur: 10, offsetX: 500, offsetY: 0, opacity: 0 },
      });
      expect(canvasPaintedBounds(object)).toEqual(canvasObjectBounds(object));
    });

    it('has nothing for an object scaled away, which draws nothing', () => {
      expect(canvasObjectBounds(shape({ scaleX: 0 }))).toBeNull();
      expect(canvasObjectBounds(shape({ scaleY: 0 }))).toBeNull();
      const lost = shape({ x: 5000, y: 5000, scaleX: 0, layerId: 'layer-1' });
      expect(computeSvgViewBox(makeConfig([lost]), [defaultLayer]).vX).toBe(-20);
    });

    it('takes in where a smoothed path curves past its points', () => {
      const corner: CanvasPath = {
        ...baseObj,
        type: 'path',
        points: [0, 0, 100, 0, 100, 100],
        stroke: '#000',
        strokeWidth: 0,
        tension: 1,
        closed: false,
      };
      expect(canvasObjectBounds(corner)).toEqual({
        x: 0,
        y: -50,
        width: 150,
        height: 150,
      });
      expect(canvasObjectBounds({ ...corner, tension: 0 })).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    });

    it('casts a shadow the same way, whatever the object has turned to', () => {
      const object = shape({
        rotation: 90,
        shadow: { color: '#000', blur: 0, offsetX: 100, offsetY: 0 },
      });
      const painted = canvasPaintedBounds(object);
      expect(painted?.x).toBeCloseTo(-20);
      expect(painted?.width).toBeCloseTo(120);
      expect(painted?.height).toBeCloseTo(40);
    });

    it('fits the view around what a shadow paints', () => {
      const { vX, vW } = computeSvgViewBox(
        makeConfig([
          shape({
            layerId: 'layer-1',
            shadow: { color: '#000', blur: 0, offsetX: 300, offsetY: 0 },
          }),
        ]),
        [defaultLayer],
      );
      expect(vX).toBe(-20);
      expect(vW).toBe(380);
    });

    it('tells overlapping areas from those that only touch', () => {
      const area = { x: 0, y: 0, width: 10, height: 10 };
      expect(rectsOverlap(area, { ...area, x: 9 })).toBe(true);
      expect(rectsOverlap(area, { ...area, x: 10 })).toBe(false);
      expect(rectsOverlap(area, { ...area, y: -10 })).toBe(false);
    });

    it('has nothing for a polygon without points', () => {
      expect(
        canvasObjectBounds({
          ...baseObj,
          type: 'shape',
          shapeType: 'polygon',
          width: 0,
          height: 0,
          stroke: '#000',
          strokeWidth: 1,
        }),
      ).toBeNull();
    });
  });
});
