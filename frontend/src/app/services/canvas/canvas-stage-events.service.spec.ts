import { TestBed } from '@angular/core/testing';
import type Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  CanvasStageEventsService,
  type StageEventCallbacks,
} from './canvas-stage-events.service';
import { CanvasZoomService } from './canvas-zoom.service';

/** Minimal wheel event stub. */
function wheelEvent(overrides: Partial<WheelEvent> = {}) {
  return {
    evt: {
      preventDefault: vi.fn(),
      deltaX: 0,
      deltaY: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...overrides,
    },
  };
}

/** Minimal pointer event stub. */
function pointerEvent(overrides: Partial<PointerEvent> = {}) {
  return {
    evt: {
      pointerId: 1,
      pointerType: 'mouse',
      pressure: 0.5,
      shiftKey: false,
      altKey: false,
      ...overrides,
    },
  };
}

/** A window-level pointer event carrying an id, which jsdom's Event lacks. */
function windowPointerEvent(type: string, pointerId: number): Event {
  return Object.assign(new Event(type), { pointerId });
}

function touch(clientX: number, clientY: number) {
  return { clientX, clientY };
}

describe('CanvasStageEventsService', () => {
  let service: CanvasStageEventsService;
  let zoom: { zoomToPoint: ReturnType<typeof vi.fn> };
  let callbacks: StageEventCallbacks;
  let container: HTMLDivElement;
  let position: { x: number; y: number };
  let stage: {
    on: ReturnType<typeof vi.fn>;
    getPointerPosition: ReturnType<typeof vi.fn>;
    container: () => HTMLDivElement;
    position: (p?: { x: number; y: number }) => { x: number; y: number };
    x: () => number;
    y: () => number;
    batchDraw: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (e?: unknown) => void>;

  /** Fire the Konva handler registered for `event`. */
  function fire(event: string, payload?: unknown): void {
    handlers[event]?.(payload);
  }

  function attach(): void {
    service.attach(stage as unknown as Konva.Stage, callbacks);
  }

  beforeEach(() => {
    zoom = { zoomToPoint: vi.fn(() => 1.5) };
    callbacks = {
      onZoomChange: vi.fn(),
      onStageClick: vi.fn(),
      onDrawStart: vi.fn(),
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
      onDrawCancel: vi.fn(),
      onPointerFrame: vi.fn(),
    };

    container = document.createElement('div');
    document.body.append(container);
    position = { x: 0, y: 0 };

    handlers = {};
    stage = {
      on: vi.fn((events: string, fn: (e?: unknown) => void) => {
        for (const ev of events.split(' ')) handlers[ev] = fn;
      }),
      getPointerPosition: vi.fn(() => ({ x: 10, y: 20 })),
      container: () => container,
      position: (p?: { x: number; y: number }) => {
        if (p) position = p;
        return position;
      },
      x: () => position.x,
      y: () => position.y,
      batchDraw: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        CanvasStageEventsService,
        { provide: CanvasZoomService, useValue: zoom },
      ],
    });
    service = TestBed.inject(CanvasStageEventsService);
    attach();
  });

  afterEach(() => {
    service.detach();
    container.remove();
  });

  // ── Wheel ──────────────────────────────────────────────────────────────

  describe('wheel', () => {
    it('pans on a plain wheel instead of zooming', () => {
      fire('wheel', wheelEvent({ deltaY: 120 }));

      expect(zoom.zoomToPoint).not.toHaveBeenCalled();
      expect(position.y).toBe(-120);
    });

    it('pans horizontally from a trackpad deltaX', () => {
      fire('wheel', wheelEvent({ deltaX: 40 }));
      expect(position.x).toBe(-40);
    });

    it('maps shift + wheel to horizontal panning', () => {
      fire('wheel', wheelEvent({ deltaY: 60, shiftKey: true }));
      expect(position.x).toBe(-60);
      expect(position.y).toBe(0);
    });

    it('zooms in on ctrl + wheel up', () => {
      fire('wheel', wheelEvent({ deltaY: -1, ctrlKey: true }));

      expect(zoom.zoomToPoint).toHaveBeenCalledWith(
        { x: 10, y: 20 },
        CanvasZoomService.ZOOM_STEP
      );
      expect(callbacks.onZoomChange).toHaveBeenCalledWith(1.5);
    });

    it('zooms out on meta + wheel down', () => {
      fire('wheel', wheelEvent({ deltaY: 1, metaKey: true }));

      expect(zoom.zoomToPoint).toHaveBeenCalledWith(
        { x: 10, y: 20 },
        1 / CanvasZoomService.ZOOM_STEP
      );
    });

    it('ignores a zoom gesture with no pointer position', () => {
      stage.getPointerPosition.mockReturnValue(null);
      fire('wheel', wheelEvent({ deltaY: -1, ctrlKey: true }));
      expect(zoom.zoomToPoint).not.toHaveBeenCalled();
    });
  });

  // ── Clicks ─────────────────────────────────────────────────────────────

  it('forwards a click on empty stage to onStageClick', () => {
    fire('click', { target: stage });
    expect(callbacks.onStageClick).toHaveBeenCalled();
  });

  it('does not call onStageClick when clicking a node', () => {
    fire('click', { target: { not: 'stage' } });
    expect(callbacks.onStageClick).not.toHaveBeenCalled();
  });

  // ── Pointer stream ─────────────────────────────────────────────────────

  describe('pointer stream', () => {
    it('starts, moves and ends a gesture', () => {
      fire('pointerdown', pointerEvent());
      fire('pointermove', pointerEvent());
      fire('pointerup', pointerEvent());

      expect(callbacks.onDrawStart).toHaveBeenCalled();
      expect(callbacks.onDrawMove).toHaveBeenCalled();
      expect(callbacks.onDrawEnd).toHaveBeenCalled();
    });

    it('ignores moves before the gesture starts', () => {
      fire('pointermove', pointerEvent());
      expect(callbacks.onDrawMove).not.toHaveBeenCalled();
    });

    it('passes stylus pressure and modifiers through', () => {
      fire(
        'pointerdown',
        pointerEvent({ pointerType: 'pen', pressure: 0.8, shiftKey: true })
      );

      expect(callbacks.onDrawStart).toHaveBeenCalledWith({
        pressure: 0.8,
        pointerType: 'pen',
        shiftKey: true,
        altKey: false,
      });
    });

    it('finishes a stroke released outside the canvas', () => {
      fire('pointerdown', pointerEvent());
      window.dispatchEvent(new Event('pointerup'));

      expect(callbacks.onDrawEnd).toHaveBeenCalledTimes(1);
    });

    it('does not double-finish when released over the canvas', () => {
      fire('pointerdown', pointerEvent());
      fire('pointerup', pointerEvent());
      window.dispatchEvent(new Event('pointerup'));

      expect(callbacks.onDrawEnd).toHaveBeenCalledTimes(1);
    });

    it('cancels the gesture when the pointer is cancelled', () => {
      fire('pointerdown', pointerEvent());
      window.dispatchEvent(new Event('pointercancel'));

      expect(callbacks.onDrawCancel).toHaveBeenCalled();
      expect(callbacks.onDrawEnd).not.toHaveBeenCalled();
    });

    it('cancels the gesture when the window loses focus', () => {
      fire('pointerdown', pointerEvent());
      window.dispatchEvent(new Event('blur'));

      expect(callbacks.onDrawCancel).toHaveBeenCalled();
    });

    it('ignores a stray cancel with no gesture in flight', () => {
      window.dispatchEvent(new Event('pointercancel'));
      expect(callbacks.onDrawCancel).not.toHaveBeenCalled();
    });
  });

  // ── Palm rejection ─────────────────────────────────────────────────────

  describe('palm rejection', () => {
    it('ignores touch input shortly after stylus input', () => {
      fire('pointerdown', pointerEvent({ pointerType: 'pen' }));
      fire('pointerup', pointerEvent({ pointerType: 'pen' }));
      vi.mocked(callbacks.onDrawStart).mockClear();

      fire('pointerdown', pointerEvent({ pointerType: 'touch' }));
      expect(callbacks.onDrawStart).not.toHaveBeenCalled();
    });

    it('accepts touch input when no stylus has been used', () => {
      fire('pointerdown', pointerEvent({ pointerType: 'touch' }));
      expect(callbacks.onDrawStart).toHaveBeenCalled();
    });

    it('a rejected palm release does not end the stylus stroke', () => {
      fire('pointerdown', pointerEvent({ pointerType: 'pen', pointerId: 1 }));
      // The palm is rejected on the way down but still reports a release.
      fire('pointerdown', pointerEvent({ pointerType: 'touch', pointerId: 2 }));
      window.dispatchEvent(windowPointerEvent('pointerup', 2));

      expect(callbacks.onDrawEnd).not.toHaveBeenCalled();

      // The stylus keeps drawing, and its own release still commits.
      fire('pointermove', pointerEvent({ pointerType: 'pen', pointerId: 1 }));
      expect(callbacks.onDrawMove).toHaveBeenCalled();

      fire('pointerup', pointerEvent({ pointerType: 'pen', pointerId: 1 }));
      expect(callbacks.onDrawEnd).toHaveBeenCalledTimes(1);
    });

    it('a cancel from another pointer does not abandon the stroke', () => {
      fire('pointerdown', pointerEvent({ pointerType: 'pen', pointerId: 1 }));
      window.dispatchEvent(windowPointerEvent('pointercancel', 7));

      expect(callbacks.onDrawCancel).not.toHaveBeenCalled();
    });
  });

  // ── Pinch ──────────────────────────────────────────────────────────────

  describe('pinch', () => {
    function pinch(a: [number, number], b: [number, number]) {
      return {
        evt: {
          preventDefault: vi.fn(),
          touches: [touch(...a), touch(...b)],
        },
      };
    }

    it('ignores a single-finger touch move', () => {
      fire('touchmove', {
        evt: { preventDefault: vi.fn(), touches: [touch(0, 0)] },
      });
      expect(zoom.zoomToPoint).not.toHaveBeenCalled();
    });

    it('needs two frames before it scales', () => {
      fire('touchmove', pinch([0, 0], [100, 0]));
      expect(zoom.zoomToPoint).not.toHaveBeenCalled();

      fire('touchmove', pinch([0, 0], [200, 0]));
      expect(zoom.zoomToPoint).toHaveBeenCalledWith({ x: 100, y: 0 }, 2);
      expect(callbacks.onZoomChange).toHaveBeenCalledWith(1.5);
    });

    it('pans by the movement of the gesture midpoint', () => {
      fire('touchmove', pinch([0, 0], [100, 0]));
      fire('touchmove', pinch([20, 10], [120, 10]));

      expect(position).toEqual({ x: 20, y: 10 });
    });

    it('abandons an in-flight stroke when a second finger lands', () => {
      fire('pointerdown', pointerEvent({ pointerType: 'touch' }));
      fire('touchmove', pinch([0, 0], [100, 0]));

      expect(callbacks.onDrawCancel).toHaveBeenCalled();
    });

    it('starts a fresh gesture after the fingers lift', () => {
      fire('touchmove', pinch([0, 0], [100, 0]));
      fire('touchend');
      fire('touchmove', pinch([0, 0], [200, 0]));

      expect(zoom.zoomToPoint).not.toHaveBeenCalled();
    });
  });

  // ── Brush cursor tracking ──────────────────────────────────────────────

  describe('pointer frames', () => {
    it('reports container-relative pointer positions', () => {
      container.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 30, clientY: 40 })
      );
      expect(callbacks.onPointerFrame).toHaveBeenCalledWith({ x: 30, y: 40 });
    });

    it('clears the position when the pointer leaves', () => {
      container.dispatchEvent(new MouseEvent('pointerleave'));
      expect(callbacks.onPointerFrame).toHaveBeenCalledWith(null);
    });
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────

  describe('detach', () => {
    it('stops listening to window events', () => {
      fire('pointerdown', pointerEvent());
      service.detach();
      window.dispatchEvent(new Event('pointerup'));

      expect(callbacks.onDrawEnd).not.toHaveBeenCalled();
    });

    it('re-attaching does not double-fire', () => {
      attach();
      fire('pointerdown', pointerEvent());
      window.dispatchEvent(new Event('pointerup'));

      expect(callbacks.onDrawEnd).toHaveBeenCalledTimes(1);
    });
  });
});
