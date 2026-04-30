import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasRendererService } from './canvas-renderer.service';
import { CanvasZoomService } from './canvas-zoom.service';

function createStageStub() {
  const state = { x: 0, y: 0, scale: 1 };
  return {
    width: vi.fn(() => 400),
    height: vi.fn(() => 200),
    scaleX: vi.fn(() => state.scale),
    x: vi.fn(() => state.x),
    y: vi.fn(() => state.y),
    scale: vi.fn((v?: { x: number; y: number }) => {
      if (v) state.scale = v.x;
      return state.scale;
    }),
    position: vi.fn((v?: { x: number; y: number }) => {
      if (v) {
        state.x = v.x;
        state.y = v.y;
      }
      return { x: state.x, y: state.y };
    }),
  };
}

describe('CanvasZoomService', () => {
  let service: CanvasZoomService;
  let mockRenderer: { stage: unknown; konvaLayers: Map<string, unknown> };
  let mockCanvasService: { activeConfig: ReturnType<typeof signal> };

  beforeEach(() => {
    mockRenderer = { stage: null, konvaLayers: new Map() };
    mockCanvasService = { activeConfig: signal(null) };

    TestBed.configureTestingModule({
      providers: [
        CanvasZoomService,
        { provide: CanvasService, useValue: mockCanvasService },
        { provide: CanvasRendererService, useValue: mockRenderer },
      ],
    });
    service = TestBed.inject(CanvasZoomService);
  });

  describe('zoomIn / zoomOut', () => {
    it('returns null when stage is missing', () => {
      expect(service.zoomIn()).toBeNull();
      expect(service.zoomOut()).toBeNull();
    });

    it('zooms in around the stage center', () => {
      const stage = createStageStub();
      mockRenderer.stage = stage;
      const result = service.zoomIn();
      expect(result).toBeCloseTo(1.1);
      expect(stage.scale).toHaveBeenCalledWith({ x: 1.1, y: 1.1 });
    });

    it('zooms out around the stage center', () => {
      const stage = createStageStub();
      mockRenderer.stage = stage;
      const result = service.zoomOut();
      expect(result).toBeCloseTo(1 / 1.1);
    });
  });

  describe('zoomToPoint', () => {
    it('returns null when stage is missing', () => {
      expect(service.zoomToPoint({ x: 0, y: 0 }, 1.5)).toBeNull();
    });

    it('clamps to MIN_ZOOM and MAX_ZOOM', () => {
      const stage = createStageStub();
      mockRenderer.stage = stage;
      // huge factor → clamped to MAX_ZOOM
      const upper = service.zoomToPoint({ x: 0, y: 0 }, 1e6);
      expect(upper).toBe(CanvasZoomService.MAX_ZOOM);
      // tiny factor → clamped to MIN_ZOOM
      const lower = service.zoomToPoint({ x: 0, y: 0 }, 1e-12);
      expect(lower).toBe(CanvasZoomService.MIN_ZOOM);
    });
  });

  describe('fitAll', () => {
    it('returns null when stage is missing', () => {
      expect(service.fitAll()).toBeNull();
    });

    it('resets stage when there are no objects', () => {
      const stage = createStageStub();
      mockRenderer.stage = stage;
      mockCanvasService.activeConfig.set({ objects: [], layers: [] });

      const result = service.fitAll();
      expect(result).toBe(1);
      expect(stage.position).toHaveBeenCalledWith({ x: 0, y: 0 });
      expect(stage.scale).toHaveBeenCalledWith({ x: 1, y: 1 });
    });

    it('returns null when no visible layer has content', () => {
      const stage = createStageStub();
      mockRenderer.stage = stage;
      mockCanvasService.activeConfig.set({
        objects: [{ id: 'o1' }],
        layers: [],
      });

      const layer = {
        visible: vi.fn(() => false),
        getClientRect: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      };
      mockRenderer.konvaLayers.set('l1', layer);

      expect(service.fitAll()).toBeNull();
    });

    it('fits visible layer content into the viewport', () => {
      const stage = createStageStub();
      mockRenderer.stage = stage;
      mockCanvasService.activeConfig.set({
        objects: [{ id: 'o1' }],
        layers: [],
      });

      const layer = {
        visible: vi.fn(() => true),
        getClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
      };
      mockRenderer.konvaLayers.set('l1', layer);

      const scale = service.fitAll();
      expect(scale).not.toBeNull();
      expect(stage.scale).toHaveBeenCalled();
      expect(stage.position).toHaveBeenCalled();
    });
  });
});
