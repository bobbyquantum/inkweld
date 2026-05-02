import { inject, Injectable } from '@angular/core';
import { CanvasZoomService } from '@services/canvas/canvas-zoom.service';
import type Konva from 'konva';

/** Callbacks invoked by the stage event service. */
export interface StageEventCallbacks {
  /** Called after a wheel-zoom with the new scale. */
  onZoomChange: (scale: number) => void;
  /** Called when the user clicks empty stage space. */
  onStageClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /** Called on mousedown/touchstart over empty stage space. */
  onDrawStart: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /** Called on mousemove/touchmove. */
  onDrawMove: () => void;
  /** Called on mouseup/touchend. */
  onDrawEnd: () => void;
}

/**
 * Component-scoped service that wires Konva stage event listeners
 * (wheel zoom, click-to-deselect, drawing pointer events) to the
 * supplied callbacks. Keeps stage event boilerplate out of the
 * canvas tab component.
 */
@Injectable()
export class CanvasStageEventsService {
  private readonly canvasZoom = inject(CanvasZoomService);

  /** Attach all stage listeners. Safe to call once per stage. */
  attach(stage: Konva.Stage, callbacks: StageEventCallbacks): void {
    // Wheel zoom (anchored at the cursor)
    stage.on('wheel', e => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor =
        e.evt.deltaY > 0
          ? 1 / CanvasZoomService.ZOOM_STEP
          : CanvasZoomService.ZOOM_STEP;
      const newScale = this.canvasZoom.zoomToPoint(pointer, factor);
      if (newScale !== null) callbacks.onZoomChange(newScale);
    });

    // Click on empty space
    stage.on('click tap', e => {
      if (e.target === stage) {
        callbacks.onStageClick(
          e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
        );
      }
    });

    // Pointer events for drawing tools (only on empty stage space)
    stage.on('mousedown touchstart', e => {
      if (e.target !== stage) return;
      callbacks.onDrawStart(
        e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
      );
    });

    stage.on('mousemove touchmove', () => {
      callbacks.onDrawMove();
    });

    stage.on('mouseup touchend', () => {
      callbacks.onDrawEnd();
    });
  }
}
