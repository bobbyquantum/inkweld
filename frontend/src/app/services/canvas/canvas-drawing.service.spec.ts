import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CanvasToolSettings } from '@models/canvas.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import {
  CanvasDrawingService,
  type DrawingHandlers,
} from './canvas-drawing.service';
import { CanvasRendererService } from './canvas-renderer.service';

const baseSettings: CanvasToolSettings = {
  stroke: '#000',
  fill: '#fff',
  strokeWidth: 2,
  tension: 0,
  shapeType: 'rect',
} as CanvasToolSettings;

/**
 * Note: behaviours that actually instantiate Konva nodes (rect-select,
 * free-draw, line/shape draw, finalize/cancel) are exercised by the
 * `CanvasTabComponent` integration spec; jsdom does not provide a real
 * `<canvas>` 2D context, and module-mocking Konva here would break other
 * specs that share the same Vitest worker.
 *
 * This spec narrowly covers the tool-dispatch contract that lives entirely
 * in plain TypeScript: which tools `start()` consumes, and the layer /
 * pointer / known-layer guards that bail out before any Konva work runs.
 */
describe('CanvasDrawingService', () => {
  let service: CanvasDrawingService;
  let canvasSvc: { addObject: ReturnType<typeof vi.fn> };
  let renderer: { konvaLayers: Map<string, unknown>; selectionLayer: unknown };
  let pointer = signal<{ x: number; y: number } | null>({ x: 10, y: 20 });
  let handlers: DrawingHandlers;

  beforeEach(() => {
    canvasSvc = { addObject: vi.fn() };
    renderer = {
      konvaLayers: new Map<string, unknown>([['L1', {}]]),
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
  });

  describe('isDrawing()', () => {
    it('starts false', () => {
      expect(service.isDrawing()).toBe(false);
    });
  });
});
