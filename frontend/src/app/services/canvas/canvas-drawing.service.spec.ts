import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CanvasToolSettings } from '@models/canvas.model';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  strokeWidth: 2,
  tension: 0,
  shapeType: 'rect',
} as CanvasToolSettings;

describe('CanvasDrawingService', () => {
  let service: CanvasDrawingService;
  let canvasSvc: { addObject: ReturnType<typeof vi.fn> };
  let renderer: {
    konvaLayers: Map<
      string,
      { add: ReturnType<typeof vi.fn>; batchDraw: ReturnType<typeof vi.fn> }
    >;
    selectionLayer: {
      add: ReturnType<typeof vi.fn>;
      batchDraw: ReturnType<typeof vi.fn>;
    } | null;
  };
  let pointer = signal<{ x: number; y: number } | null>({ x: 10, y: 20 });
  let handlers: DrawingHandlers;

  beforeEach(() => {
    canvasSvc = { addObject: vi.fn() };
    renderer = {
      konvaLayers: new Map([['L1', { add: vi.fn(), batchDraw: vi.fn() }]]),
      selectionLayer: { add: vi.fn(), batchDraw: vi.fn() },
    };
    pointer = signal<{ x: number; y: number } | null>({ x: 10, y: 20 });
    handlers = {
      ensureLayer: () => 'L1',
      pointer: () => pointer(),
      onRectSelect: vi.fn() as DrawingHandlers['onRectSelect'],
      onClearSelection: vi.fn() as DrawingHandlers['onClearSelection'],
    };

    TestBed.configureTestingModule({
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

    it('starts free-draw and sets isDrawing true', () => {
      expect(service.start('draw', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('starts line-draw and sets isDrawing true', () => {
      expect(service.start('line', baseSettings, handlers)).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('starts shape rect-draw and sets isDrawing true', () => {
      expect(
        service.start('shape', { ...baseSettings, shapeType: 'rect' }, handlers)
      ).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('starts shape ellipse-draw and sets isDrawing true', () => {
      expect(
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        )
      ).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('starts shape arrow-draw and sets isDrawing true', () => {
      expect(
        service.start(
          'shape',
          { ...baseSettings, shapeType: 'arrow' },
          handlers
        )
      ).toBe(true);
      expect(service.isDrawing()).toBe(true);
    });

    it('starts shape line-draw and sets isDrawing true', () => {
      expect(
        service.start('shape', { ...baseSettings, shapeType: 'line' }, handlers)
      ).toBe(true);
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

    it('updates shape arrow on move', () => {
      service.start('shape', { ...baseSettings, shapeType: 'arrow' }, handlers);
      pointer.set({ x: 50, y: 60 });
      expect(() =>
        service.move('shape', { ...baseSettings, shapeType: 'arrow' }, handlers)
      ).not.toThrow();
    });

    it('updates ellipse shape on move', () => {
      service.start(
        'shape',
        { ...baseSettings, shapeType: 'ellipse' },
        handlers
      );
      pointer.set({ x: 50, y: 60 });
      expect(() =>
        service.move(
          'shape',
          { ...baseSettings, shapeType: 'ellipse' },
          handlers
        )
      ).not.toThrow();
    });

    it('updates rect shape on move', () => {
      service.start('shape', { ...baseSettings, shapeType: 'rect' }, handlers);
      pointer.set({ x: 50, y: 60 });
      expect(() =>
        service.move('shape', { ...baseSettings, shapeType: 'rect' }, handlers)
      ).not.toThrow();
    });

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
});
