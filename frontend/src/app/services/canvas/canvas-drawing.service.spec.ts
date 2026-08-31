import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CanvasConfig,
  CanvasPath,
  CanvasTool,
  CanvasToolSettings,
} from '@models/canvas.model';
import Konva from 'konva';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { CanvasService } from './canvas.service';
import {
  CanvasDrawingService,
  type DrawingHandlers,
} from './canvas-drawing.service';
import { CanvasRendererService } from './canvas-renderer.service';

// jsdom does not implement canvas.getContext('2d'). Stub it so Konva works.
function makeCanvas2dStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    })),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),
    putImageData: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })),
    createImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    canvas: { width: 300, height: 150 },
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
  };
}

beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (type: string) => unknown;
  };
  proto.getContext = (type: string) =>
    type === '2d' ? makeCanvas2dStub() : null;
});

const baseSettings: CanvasToolSettings = {
  stroke: '#000',
  fill: '#fff',
  fillEnabled: false,
  opacity: 1,
  strokeWidth: 2,
  tension: 0,
  pressure: false,
  eraserSize: 10,
  shapeType: 'rect',
} as CanvasToolSettings;

interface FakeLayer {
  add: ReturnType<typeof vi.fn>;
  batchDraw: ReturnType<typeof vi.fn>;
}

function makeLayer(): FakeLayer {
  return { add: vi.fn(), batchDraw: vi.fn() };
}

describe('CanvasDrawingService', () => {
  let service: CanvasDrawingService;
  let canvasSvc: {
    addObject: ReturnType<typeof vi.fn>;
    removeObjects: ReturnType<typeof vi.fn>;
    activeConfig: ReturnType<typeof vi.fn>;
  };
  let renderer: {
    konvaLayers: Map<string, FakeLayer>;
    selectionLayer: FakeLayer | null;
    previewLayer: FakeLayer | null;
    konvaNodes: Map<string, Konva.Node>;
    stage: unknown;
  };
  let pointer = signal<{ x: number; y: number } | null>({ x: 10, y: 20 });
  let handlers: DrawingHandlers;

  beforeEach(() => {
    canvasSvc = {
      addObject: vi.fn(),
      removeObjects: vi.fn(),
      activeConfig: vi.fn(() => null),
    };
    renderer = {
      konvaLayers: new Map([['L1', makeLayer()]]),
      selectionLayer: makeLayer(),
      previewLayer: makeLayer(),
      konvaNodes: new Map<string, Konva.Node>(),
      stage: null,
    };
    pointer = signal<{ x: number; y: number } | null>({ x: 10, y: 20 });
    handlers = {
      ensureLayer: () => 'L1',
      pointer: () => pointer(),
      onRectSelect: vi.fn() as DrawingHandlers['onRectSelect'],
      onClearSelection: vi.fn() as DrawingHandlers['onClearSelection'],
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        CanvasDrawingService,
        { provide: CanvasService, useValue: canvasSvc },
        { provide: CanvasRendererService, useValue: renderer },
      ],
    });
    service = TestBed.inject(CanvasDrawingService);
  });

  describe('isDrawing()', () => {
    it('starts false', () => {
      expect(service.isDrawing()).toBe(false);
    });
  });

  describe('start()', () => {
    it.each(['select', 'pan', 'pin', 'text'] as const)(
      'returns false for non-drawing tool %s',
      tool => {
        expect(service.start(tool, baseSettings, handlers)).toBe(false);
        expect(service.isDrawing()).toBe(false);
      }
    );

    it('returns true but stays idle when there is no active layer', () => {
      handlers = { ...handlers, ensureLayer: () => '' };
      expect(service.start('draw', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(false);
    });

    it('returns true but stays idle when there is no pointer', () => {
      pointer.set(null);
      expect(service.start('draw', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(false);
    });

    it('returns true but stays idle when the layer id has no Konva layer', () => {
      renderer.konvaLayers.clear();
      expect(service.start('draw', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(false);
    });

    it.each<{
      label: string;
      tool: CanvasTool;
      shapeType: CanvasToolSettings['shapeType'] | undefined;
    }>([
      { label: 'free-draw', tool: 'draw', shapeType: undefined },
      { label: 'line-draw', tool: 'line', shapeType: undefined },
      { label: 'shape rect-draw', tool: 'shape', shapeType: 'rect' },
      { label: 'shape ellipse-draw', tool: 'shape', shapeType: 'ellipse' },
      { label: 'shape arrow-draw', tool: 'shape', shapeType: 'arrow' },
      { label: 'shape line-draw', tool: 'shape', shapeType: 'line' },
    ])('starts $label and sets isDrawing true', ({ tool, shapeType }) => {
      const settings =
        shapeType === undefined ? baseSettings : { ...baseSettings, shapeType };
      expect(service.start(tool, settings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('starts rectSelect and sets isDrawing true', () => {
      expect(service.start('rectSelect', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('rectSelect with null pointer does not set isDrawing', () => {
      pointer.set(null);
      service.start('rectSelect', baseSettings, handlers);
      expect(service.isDrawing()).toBe(false);
    });

    it('rectSelect with null selectionLayer does not throw', () => {
      renderer.selectionLayer = null;
      pointer.set({ x: 5, y: 5 });
      expect(() =>
        service.start('rectSelect', baseSettings, handlers)
      ).not.toThrow();
    });
  });

  describe('move()', () => {
    it('no-ops when pointer is null', () => {
      service.start('draw', baseSettings, handlers);
      pointer.set(null);
      expect(() => service.move('draw', baseSettings, handlers)).not.toThrow();
    });

    it('updates free-draw line points on move', () => {
      service.start('draw', baseSettings, handlers);
      pointer.set({ x: 30, y: 40 });
      expect(() => service.move('draw', baseSettings, handlers)).not.toThrow();
      expect(service.isDrawing()).toBe(true);
    });

    it('updates line-draw endpoints on move', () => {
      service.start('line', baseSettings, handlers);
      pointer.set({ x: 50, y: 60 });
      expect(() => service.move('line', baseSettings, handlers)).not.toThrow();
      expect(service.isDrawing()).toBe(true);
    });

    it.each(['arrow', 'ellipse', 'rect'] as const)(
      'updates shape %s on move',
      shapeType => {
        service.start('shape', { ...baseSettings, shapeType }, handlers);
        pointer.set({ x: 50, y: 60 });
        expect(() =>
          service.move('shape', { ...baseSettings, shapeType }, handlers)
        ).not.toThrow();
      }
    );

    it('updates rectSelect rect on move', () => {
      service.start('rectSelect', baseSettings, handlers);
      pointer.set({ x: 50, y: 60 });
      expect(() =>
        service.move('rectSelect', baseSettings, handlers)
      ).not.toThrow();
    });
  });

  describe('end()', () => {
    it('no-ops when nothing is drawing', () => {
      expect(() => service.end('draw', baseSettings, handlers)).not.toThrow();
      expect(service.isDrawing()).toBe(false);
    });

    describe('free-draw', () => {
      it('calls addObject when path has enough points', () => {
        service.start('draw', baseSettings, handlers);
        pointer.set({ x: 20, y: 30 });
        service.move('draw', baseSettings, handlers);
        pointer.set({ x: 40, y: 50 });
        service.move('draw', baseSettings, handlers);
        service.end('draw', baseSettings, handlers);
        expect(canvasSvc.addObject).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'path', layerId: 'L1' })
        );
        expect(service.isDrawing()).toBe(false);
      });

      it('does not call addObject when path is too short', () => {
        service.start('draw', baseSettings, handlers);
        // Only starting point, no moves → drawingPoints has 2 values (< 4)
        service.end('draw', baseSettings, handlers);
        expect(canvasSvc.addObject).not.toHaveBeenCalled();
        expect(service.isDrawing()).toBe(false);
      });

      it('does not call addObject when no layer at end', () => {
        service.start('draw', baseSettings, handlers);
        pointer.set({ x: 20, y: 30 });
        service.move('draw', baseSettings, handlers);
        pointer.set({ x: 40, y: 50 });
        service.move('draw', baseSettings, handlers);
        // remove layer before end
        handlers = { ...handlers, ensureLayer: () => '' };
        service.end('draw', baseSettings, handlers);
        expect(canvasSvc.addObject).not.toHaveBeenCalled();
      });
    });

    describe('line-draw', () => {
      it('calls addObject with type path when line is long enough', () => {
        service.start('line', baseSettings, handlers);
        pointer.set({ x: 100, y: 100 });
        service.move('line', baseSettings, handlers);
        service.end('line', baseSettings, handlers);
        expect(canvasSvc.addObject).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'path', layerId: 'L1' })
        );
        expect(service.isDrawing()).toBe(false);
      });

      it('does not call addObject when line is too short', () => {
        service.start('line', baseSettings, handlers);
        // pointer stays at (10,20) — line is zero length
        service.end('line', baseSettings, handlers);
        expect(canvasSvc.addObject).not.toHaveBeenCalled();
        expect(service.isDrawing()).toBe(false);
      });
    });

    describe('shape draw – arrow/line (line-based)', () => {
      it('calls addObject with type shape for arrow when long enough', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'arrow' },
          handlers
        );
        pointer.set({ x: 100, y: 100 });
        service.move(
          'shape',
          { ...baseSettings, shapeType: 'arrow' },
          handlers
        );
        service.end('shape', { ...baseSettings, shapeType: 'arrow' }, handlers);
        expect(canvasSvc.addObject).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'shape', shapeType: 'arrow' })
        );
        expect(service.isDrawing()).toBe(false);
      });

      it('calls addObject with type shape for line-shape when long enough', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'line' },
          handlers
        );
        pointer.set({ x: 100, y: 100 });
        service.move('shape', { ...baseSettings, shapeType: 'line' }, handlers);
        service.end('shape', { ...baseSettings, shapeType: 'line' }, handlers);
        expect(canvasSvc.addObject).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'shape', shapeType: 'line' })
        );
      });

      it('does not call addObject for arrow when too short', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'arrow' },
          handlers
        );
        service.end('shape', { ...baseSettings, shapeType: 'arrow' }, handlers);
        expect(canvasSvc.addObject).not.toHaveBeenCalled();
      });
    });

    describe('shape draw – ellipse (rect-based)', () => {
      it('calls addObject with type shape for ellipse when big enough', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        );
        pointer.set({ x: 100, y: 100 });
        service.move(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        );
        service.end(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        );
        expect(canvasSvc.addObject).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'shape', shapeType: 'ellipse' })
        );
        expect(service.isDrawing()).toBe(false);
      });

      it('does not call addObject for ellipse when too small', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        );
        pointer.set({ x: 11, y: 21 }); // only 1px move
        service.move(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        );
        service.end(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        );
        expect(canvasSvc.addObject).not.toHaveBeenCalled();
      });
    });

    describe('shape draw – rect', () => {
      it('calls addObject with type shape for rect when big enough', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'rect' },
          handlers
        );
        pointer.set({ x: 100, y: 100 });
        service.move('shape', { ...baseSettings, shapeType: 'rect' }, handlers);
        service.end('shape', { ...baseSettings, shapeType: 'rect' }, handlers);
        expect(canvasSvc.addObject).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'shape', shapeType: 'rect' })
        );
        expect(service.isDrawing()).toBe(false);
      });

      it('does not call addObject for rect when too small', () => {
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'rect' },
          handlers
        );
        pointer.set({ x: 11, y: 21 }); // only 1px move
        service.move('shape', { ...baseSettings, shapeType: 'rect' }, handlers);
        service.end('shape', { ...baseSettings, shapeType: 'rect' }, handlers);
        expect(canvasSvc.addObject).not.toHaveBeenCalled();
      });
    });

    describe('rectSelect', () => {
      it('calls onRectSelect when rect is big enough', () => {
        service.start('rectSelect', baseSettings, handlers);
        pointer.set({ x: 60, y: 70 });
        service.move('rectSelect', baseSettings, handlers);
        service.end('rectSelect', baseSettings, handlers);
        expect(handlers.onRectSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            width: expect.any(Number),
            height: expect.any(Number),
          })
        );
        expect(service.isDrawing()).toBe(false);
      });

      it('calls onClearSelection when rect is too small', () => {
        service.start('rectSelect', baseSettings, handlers);
        // pointer stays at (10,20) — no move, width/height = 0
        service.end('rectSelect', baseSettings, handlers);
        expect(handlers.onClearSelection).toHaveBeenCalled();
        expect(service.isDrawing()).toBe(false);
      });
    });
  });

  describe('end() reports whether it committed', () => {
    it('is true after a shape drag big enough to keep', () => {
      const settings = { ...baseSettings, shapeType: 'ellipse' as const };
      service.start('shape', settings, handlers);
      pointer.set({ x: 100, y: 100 });
      service.move('shape', settings, handlers);

      expect(service.end('shape', settings, handlers)).toBe(true);
    });

    it('is false when the drag was too small to keep', () => {
      const settings = { ...baseSettings, shapeType: 'ellipse' as const };
      service.start('shape', settings, handlers);
      pointer.set({ x: 11, y: 21 });
      service.move('shape', settings, handlers);

      expect(service.end('shape', settings, handlers)).toBe(false);
    });

    it('is true after a committed freehand stroke', () => {
      service.start('draw', baseSettings, handlers);
      pointer.set({ x: 40, y: 50 });
      service.move('draw', baseSettings, handlers);
      pointer.set({ x: 80, y: 90 });
      service.move('draw', baseSettings, handlers);

      expect(service.end('draw', baseSettings, handlers)).toBe(true);
    });

    it('is true after a committed line', () => {
      service.start('line', baseSettings, handlers);
      pointer.set({ x: 100, y: 100 });
      service.move('line', baseSettings, handlers);

      expect(service.end('line', baseSettings, handlers)).toBe(true);
    });

    it('is false for an eraser sweep and a rect-select', () => {
      service.start('eraser', baseSettings, handlers);
      expect(service.end('eraser', baseSettings, handlers)).toBe(false);

      service.start('rectSelect', baseSettings, handlers);
      pointer.set({ x: 90, y: 90 });
      service.move('rectSelect', baseSettings, handlers);
      expect(service.end('rectSelect', baseSettings, handlers)).toBe(false);
    });

    it('is false when nothing was in progress', () => {
      expect(service.end('shape', baseSettings, handlers)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Stroke capture
  // ───────────────────────────────────────────────────────────────────────

  describe('freehand sampling', () => {
    /**
     * Draw a stroke through `path` and return the persisted object. Points may
     * carry a third element: the stylus pressure reported at that sample.
     */
    function drawThrough(
      points: [number, number][] | [number, number, number][],
      settings: CanvasToolSettings = baseSettings
    ): CanvasPath {
      const input = (p: number[]) =>
        p.length > 2
          ? { pressure: p[2], pointerType: 'pen' }
          : { pointerType: 'mouse' };

      pointer.set({ x: points[0][0], y: points[0][1] });
      service.start('draw', settings, handlers, input(points[0]));
      for (const p of points.slice(1)) {
        pointer.set({ x: p[0], y: p[1] });
        service.move('draw', settings, handlers, input(p));
      }
      service.end('draw', settings, handlers);
      return canvasSvc.addObject.mock.calls.at(-1)?.[0] as CanvasPath;
    }

    it('ignores samples closer than the minimum distance', () => {
      const path = drawThrough([
        [0, 0],
        [0.2, 0],
        [0.4, 0],
        [60, 0],
      ]);
      // The two sub-pixel samples are dropped, the far one is kept.
      expect(path.points).toEqual([0, 0, 60, 0]);
    });

    it('simplifies collinear samples away', () => {
      const path = drawThrough([
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
        [40, 0],
      ]);
      expect(path.points).toEqual([0, 0, 40, 0]);
    });

    it('keeps points that carry the shape of the stroke', () => {
      const path = drawThrough([
        [0, 0],
        [20, 40],
        [40, 0],
      ]);
      expect(path.points).toHaveLength(6);
    });

    it('stores points relative to the object origin', () => {
      const path = drawThrough([
        [100, 200],
        [140, 260],
        [180, 200],
      ]);
      expect(path.x).toBe(100);
      expect(path.y).toBe(200);
      expect(path.points[0]).toBe(0);
      expect(path.points[1]).toBe(0);
      expect(Math.min(...path.points)).toBeGreaterThanOrEqual(0);
    });

    it('rounds coordinates to two decimals', () => {
      const path = drawThrough([
        [0, 0],
        [10.123456, 20.987654],
        [30.5, 0],
      ]);
      for (const value of path.points) {
        expect(Number(value.toFixed(2))).toBe(value);
      }
    });

    it('records no pressures when the pressure setting is off', () => {
      const path = drawThrough([
        [0, 0],
        [30, 30],
        [60, 0],
      ]);
      expect(path.pressures).toBeUndefined();
      expect(path.tension).toBe(baseSettings.tension);
    });

    it('keeps the pressure swell on a geometrically straight stroke', () => {
      const settings = { ...baseSettings, pressure: true };
      // A dead-straight line whose pressure builds to a peak and fades.
      const points: [number, number, number][] = [];
      for (let i = 0; i <= 20; i++) {
        points.push([i * 10, 0, 0.1 + Math.sin((i / 20) * Math.PI) * 0.9]);
      }

      const path = drawThrough(points, settings);

      // Geometry alone would collapse this to two points and lose the swell.
      expect(path.points.length / 2).toBeGreaterThan(2);
      const widest = Math.max(...(path.pressures ?? []));
      const thinnest = Math.min(...(path.pressures ?? []));
      expect(widest - thinnest).toBeGreaterThan(0.3);
    });

    it('still collapses a straight stroke drawn at a steady pressure', () => {
      const settings = { ...baseSettings, pressure: true };
      const points: [number, number, number][] = [];
      for (let i = 0; i <= 20; i++) points.push([i * 10, 0, 0.6]);

      expect(drawThrough(points, settings).points).toEqual([0, 0, 200, 0]);
    });

    it('records one pressure per point when pressure is on', () => {
      const settings = { ...baseSettings, pressure: true, tension: 0.4 };
      const path = drawThrough(
        [
          [0, 0],
          [30, 40],
          [60, 0],
        ],
        settings
      );
      expect(path.pressures).toBeDefined();
      expect(path.pressures).toHaveLength(path.points.length / 2);
      // Outlined ink carries its own shape, so spline tension is dropped.
      expect(path.tension).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Modifier constraints
  // ───────────────────────────────────────────────────────────────────────

  describe('constrainLine', () => {
    const start = { x: 0, y: 0 };

    it('passes the point through without shift', () => {
      const end = { x: 10, y: 3 };
      expect(CanvasDrawingService.constrainLine(start, end)).toEqual(end);
    });

    it('snaps a near-horizontal drag flat', () => {
      const result = CanvasDrawingService.constrainLine(
        start,
        { x: 100, y: 4 },
        { shiftKey: true }
      );
      expect(result.y).toBeCloseTo(0, 6);
      expect(result.x).toBeCloseTo(Math.hypot(100, 4), 6);
    });

    it('snaps to 45 degrees', () => {
      const result = CanvasDrawingService.constrainLine(
        start,
        { x: 100, y: 96 },
        { shiftKey: true }
      );
      expect(result.x).toBeCloseTo(result.y, 6);
    });

    it('preserves the drag length', () => {
      const result = CanvasDrawingService.constrainLine(
        start,
        { x: 30, y: 42 },
        { shiftKey: true }
      );
      expect(Math.hypot(result.x, result.y)).toBeCloseTo(Math.hypot(30, 42), 6);
    });

    it('handles a zero-length drag', () => {
      const result = CanvasDrawingService.constrainLine(start, start, {
        shiftKey: true,
      });
      expect(result).toEqual(start);
    });
  });

  describe('constrainBox', () => {
    const start = { x: 10, y: 10 };

    it('builds a box from the drag corners', () => {
      expect(
        CanvasDrawingService.constrainBox(start, { x: 40, y: 30 })
      ).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    });

    it('normalizes a drag towards the origin', () => {
      expect(CanvasDrawingService.constrainBox(start, { x: 0, y: 0 })).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
    });

    it('forces a square with shift', () => {
      const box = CanvasDrawingService.constrainBox(
        start,
        { x: 60, y: 30 },
        { shiftKey: true }
      );
      expect(box.width).toBe(box.height);
      expect(box.width).toBe(50);
    });

    it('grows from the centre with alt', () => {
      const box = CanvasDrawingService.constrainBox(
        start,
        { x: 40, y: 30 },
        { altKey: true }
      );
      expect(box).toEqual({ x: -20, y: -10, width: 60, height: 40 });
    });

    it('combines shift and alt into a centred square', () => {
      const box = CanvasDrawingService.constrainBox(
        start,
        { x: 60, y: 30 },
        { shiftKey: true, altKey: true }
      );
      expect(box.width).toBe(box.height);
      expect(box.x).toBe(start.x - box.width / 2);
      expect(box.y).toBe(start.y - box.height / 2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Eraser
  // ───────────────────────────────────────────────────────────────────────

  describe('pathHits', () => {
    const path: CanvasPath = {
      id: 'p1',
      layerId: 'L1',
      type: 'path',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      points: [0, 0, 100, 0],
      stroke: '#000',
      strokeWidth: 4,
      closed: false,
      tension: 0,
    };

    it('hits a point on the stroke', () => {
      expect(CanvasDrawingService.pathHits(path, { x: 50, y: 0 }, 1)).toBe(
        true
      );
    });

    it('hits within the stroke half-width plus the radius', () => {
      expect(CanvasDrawingService.pathHits(path, { x: 50, y: 5 }, 4)).toBe(
        true
      );
    });

    it('misses beyond the radius', () => {
      expect(CanvasDrawingService.pathHits(path, { x: 50, y: 40 }, 4)).toBe(
        false
      );
    });

    it('misses past the end of the segment', () => {
      expect(CanvasDrawingService.pathHits(path, { x: 140, y: 0 }, 4)).toBe(
        false
      );
    });

    it('treats a single-point path as a dot', () => {
      const dot = { ...path, points: [10, 10] };
      expect(CanvasDrawingService.pathHits(dot, { x: 11, y: 10 }, 1)).toBe(
        true
      );
      expect(CanvasDrawingService.pathHits(dot, { x: 60, y: 10 }, 1)).toBe(
        false
      );
    });
  });

  describe('eraser', () => {
    /** Register a real Konva node so hit-testing has geometry to work with. */
    function seedCanvas(objects: CanvasPath[]): void {
      const config: CanvasConfig = {
        elementId: 'e1',
        layers: [
          {
            id: 'L1',
            name: 'Layer 1',
            visible: true,
            locked: false,
            opacity: 1,
            order: 0,
          },
        ],
        objects,
      };
      canvasSvc.activeConfig.mockReturnValue(config);
      renderer.stage = {
        scaleX: () => 1,
        getAbsoluteTransform: () => ({
          point: (p: { x: number; y: number }) => p,
        }),
      };
      for (const obj of objects) {
        renderer.konvaNodes.set(
          obj.id,
          new Konva.Line({
            id: obj.id,
            x: obj.x,
            y: obj.y,
            points: obj.points,
            strokeWidth: obj.strokeWidth,
          })
        );
      }
    }

    function makePath(overrides: Partial<CanvasPath> = {}): CanvasPath {
      return {
        id: 'p1',
        layerId: 'L1',
        type: 'path',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        points: [0, 0, 100, 0],
        stroke: '#000',
        strokeWidth: 4,
        closed: false,
        tension: 0,
        ...overrides,
      };
    }

    it('marks the object under the pointer and removes it on release', () => {
      seedCanvas([makePath()]);
      pointer.set({ x: 50, y: 0 });

      expect(service.start('eraser', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(true);
      expect(renderer.konvaNodes.get('p1')?.opacity()).toBeLessThan(1);

      service.end('eraser', baseSettings, handlers);
      expect(canvasSvc.removeObjects).toHaveBeenCalledWith(['p1']);
      expect(service.isDrawing()).toBe(false);
    });

    it('collects everything swept in one gesture into a single removal', () => {
      seedCanvas([
        makePath({ id: 'a' }),
        makePath({ id: 'b', points: [0, 200, 100, 200] }),
      ]);

      pointer.set({ x: 50, y: 0 });
      service.start('eraser', baseSettings, handlers);
      pointer.set({ x: 50, y: 200 });
      service.move('eraser', baseSettings, handlers);
      service.end('eraser', baseSettings, handlers);

      expect(canvasSvc.removeObjects).toHaveBeenCalledTimes(1);
      expect(canvasSvc.removeObjects.mock.calls[0][0]).toEqual(['a', 'b']);
    });

    it('leaves untouched objects alone', () => {
      seedCanvas([makePath({ id: 'far', points: [0, 500, 100, 500] })]);
      pointer.set({ x: 50, y: 0 });

      service.start('eraser', baseSettings, handlers);
      service.end('eraser', baseSettings, handlers);
      expect(canvasSvc.removeObjects).not.toHaveBeenCalled();
    });

    it('skips locked and hidden objects', () => {
      seedCanvas([
        makePath({ id: 'locked', locked: true }),
        makePath({ id: 'hidden', visible: false }),
      ]);
      pointer.set({ x: 50, y: 0 });

      service.start('eraser', baseSettings, handlers);
      service.end('eraser', baseSettings, handlers);
      expect(canvasSvc.removeObjects).not.toHaveBeenCalled();
    });

    it('does nothing without a pointer', () => {
      seedCanvas([makePath()]);
      pointer.set(null);

      service.start('eraser', baseSettings, handlers);
      service.end('eraser', baseSettings, handlers);
      expect(canvasSvc.removeObjects).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Cancellation
  // ───────────────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('is safe when nothing is in progress', () => {
      expect(() => service.cancel()).not.toThrow();
      expect(service.isDrawing()).toBe(false);
    });

    it('throws away an in-progress stroke', () => {
      service.start('draw', baseSettings, handlers);
      pointer.set({ x: 90, y: 90 });
      service.move('draw', baseSettings, handlers);

      service.cancel();
      expect(service.isDrawing()).toBe(false);
      expect(canvasSvc.addObject).not.toHaveBeenCalled();
    });

    it('throws away an in-progress shape', () => {
      service.start('shape', baseSettings, handlers);
      service.cancel();
      expect(service.isDrawing()).toBe(false);
      expect(canvasSvc.addObject).not.toHaveBeenCalled();
    });

    it('drops a rect-select without selecting', () => {
      service.start('rectSelect', baseSettings, handlers);
      service.cancel();
      expect(service.isDrawing()).toBe(false);
      expect(handlers.onRectSelect).not.toHaveBeenCalled();
    });
  });
});
