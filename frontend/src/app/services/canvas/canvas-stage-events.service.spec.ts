import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CanvasStageEventsService,
  type StageEventCallbacks,
} from './canvas-stage-events.service';
import { CanvasZoomService } from './canvas-zoom.service';

describe('CanvasStageEventsService', () => {
  let service: CanvasStageEventsService;
  let zoom: { zoomToPoint: ReturnType<typeof vi.fn> };
  let callbacks: StageEventCallbacks;
  let stage: {
    on: ReturnType<typeof vi.fn>;
    getPointerPosition: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (e?: unknown) => void>;

  beforeEach(() => {
    zoom = { zoomToPoint: vi.fn(() => 1.5) };
    callbacks = {
      onZoomChange: vi.fn(),
      onStageClick: vi.fn(),
      onDrawStart: vi.fn(),
      onDrawMove: vi.fn(),
      onDrawEnd: vi.fn(),
    };

    handlers = {};
    stage = {
      on: vi.fn((events: string, fn: (e?: unknown) => void) => {
        for (const ev of events.split(' ')) handlers[ev] = fn;
      }),
      getPointerPosition: vi.fn(() => ({ x: 10, y: 20 })),
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasStageEventsService,
        { provide: CanvasZoomService, useValue: zoom },
      ],
    });
    service = TestBed.inject(CanvasStageEventsService);

    service.attach(
      stage as unknown as import('konva').default.Stage,
      callbacks
    );
  });

  it('zooms on wheel and reports new scale', () => {
    handlers['wheel']({ evt: { preventDefault: vi.fn(), deltaY: -1 } });
    expect(zoom.zoomToPoint).toHaveBeenCalled();
    expect(callbacks.onZoomChange).toHaveBeenCalledWith(1.5);
  });

  it('forwards click on empty stage to onStageClick', () => {
    const e = { target: stage };
    handlers['click'](e);
    expect(callbacks.onStageClick).toHaveBeenCalled();
  });

  it('does not call onStageClick when clicking a node', () => {
    handlers['click']({ target: { not: 'stage' } });
    expect(callbacks.onStageClick).not.toHaveBeenCalled();
  });

  it('routes mouseup to onDrawEnd', () => {
    handlers['mouseup']();
    expect(callbacks.onDrawEnd).toHaveBeenCalled();
  });
});
