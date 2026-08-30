import { DestroyRef, inject, Injectable } from '@angular/core';
import type { DrawInput } from '@services/canvas/canvas-drawing.service';
import { CanvasZoomService } from '@services/canvas/canvas-zoom.service';
import type Konva from 'konva';

/** Callbacks invoked by the stage event service. */
export interface StageEventCallbacks {
  /** Called after a wheel-zoom or pinch with the new scale. */
  onZoomChange: (scale: number) => void;
  /** Called when the user clicks empty stage space. */
  onStageClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /** Called on pointer-down over the stage. */
  onDrawStart: (input: DrawInput) => void;
  /** Called while the pointer moves with a button held. */
  onDrawMove: (input: DrawInput) => void;
  /** Called when the pointer is released — anywhere, not just over the stage. */
  onDrawEnd: () => void;
  /** Called when the gesture is abandoned (pointer cancel, blur, pinch). */
  onDrawCancel: () => void;
  /**
   * Called on every pointer move over the container, whether or not a button
   * is held, so the host can position a brush cursor. `null` on pointer-out.
   */
  onPointerFrame?: (position: { x: number; y: number } | null) => void;
}

/** Ignore touch input for this long after the stylus was last used. */
const PEN_GRACE_MS = 1200;

/** Wheel deltas are scaled down to a comfortable pan speed. */
const WHEEL_PAN_FACTOR = 1;

/**
 * Component-scoped service that wires Konva stage event listeners
 * (wheel zoom and pan, pinch, click-to-deselect, drawing pointer events)
 * to the supplied callbacks. Keeps stage event boilerplate out of the
 * canvas tab component.
 *
 * Pointer events are used rather than separate mouse and touch handlers, so a
 * stylus reports real pressure and tilt, and the drawing tools get one
 * consistent stream from every input device.
 */
@Injectable()
export class CanvasStageEventsService {
  private readonly canvasZoom = inject(CanvasZoomService);
  private readonly destroyRef = inject(DestroyRef);

  /** Torn down and re-registered on every {@link attach}. */
  private detachWindowListeners: (() => void) | null = null;

  /** Whether a pointer gesture that started on the stage is still active. */
  private pointerActive = false;

  /**
   * Pointer id of the gesture in flight. A palm resting on the screen is
   * rejected on the way down, but it still produces a release — without this
   * that release would commit the stylus stroke mid-draw and every later
   * stylus move would be dropped.
   */
  private activePointerId: number | null = null;

  /** Timestamp of the last stylus event, used for palm rejection. */
  private lastPenAt = 0;

  /** Two-finger gesture state. */
  private pinchDistance: number | null = null;
  private pinchCenter: { x: number; y: number } | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.detach());
  }

  /** Remove any window-level listeners registered by a previous attach. */
  detach(): void {
    this.detachWindowListeners?.();
    this.detachWindowListeners = null;
    this.pointerActive = false;
    this.activePointerId = null;
    this.pinchDistance = null;
    this.pinchCenter = null;
  }

  /** Attach all stage listeners. Safe to call once per stage. */
  attach(stage: Konva.Stage, callbacks: StageEventCallbacks): void {
    this.detach();

    stage.on('wheel', e => this.handleWheel(e, stage, callbacks));

    stage.on('click tap', e => {
      if (e.target === stage) {
        callbacks.onStageClick(
          e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
        );
      }
    });

    stage.on('pointerdown', e => {
      if (this.shouldIgnore(e.evt)) return;
      this.pointerActive = true;
      this.activePointerId = e.evt.pointerId;
      callbacks.onDrawStart(CanvasStageEventsService.toInput(e.evt));
    });

    stage.on('pointermove', e => {
      if (this.shouldIgnore(e.evt)) return;
      if (!this.isActivePointer(e.evt)) return;
      callbacks.onDrawMove(CanvasStageEventsService.toInput(e.evt));
    });

    stage.on('pointerup', e => {
      if (!this.isActivePointer(e.evt)) return;
      this.endGesture();
      callbacks.onDrawEnd();
    });

    // Pinch to zoom and two-finger pan.
    stage.on('touchmove', e => this.handleTouchMove(e, stage, callbacks));
    stage.on('touchend touchcancel', () => {
      this.pinchDistance = null;
      this.pinchCenter = null;
    });

    this.attachWindowListeners(stage, callbacks);
  }

  /**
   * A gesture that ends off-canvas must still finish the stroke — without
   * this, releasing the button past the edge of the canvas left the stroke
   * hanging and the next press continued it.
   */
  private attachWindowListeners(
    stage: Konva.Stage,
    callbacks: StageEventCallbacks
  ): void {
    const container = stage.container();

    const onWindowPointerUp = (evt: PointerEvent) => {
      if (!this.isActivePointer(evt)) return;
      this.endGesture();
      callbacks.onDrawEnd();
    };

    const onPointerCancel = (evt: PointerEvent) => {
      if (!this.isActivePointer(evt)) return;
      this.endGesture();
      callbacks.onDrawCancel();
    };

    // Losing the window entirely abandons whatever was in flight.
    const onAbort = () => {
      this.pinchDistance = null;
      this.pinchCenter = null;
      if (!this.pointerActive) return;
      this.endGesture();
      callbacks.onDrawCancel();
    };

    const onContainerMove = (evt: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      callbacks.onPointerFrame?.({
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      });
    };

    const onContainerLeave = () => callbacks.onPointerFrame?.(null);

    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onAbort);
    container.addEventListener('pointermove', onContainerMove);
    container.addEventListener('pointerleave', onContainerLeave);

    this.detachWindowListeners = () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onAbort);
      container.removeEventListener('pointermove', onContainerMove);
      container.removeEventListener('pointerleave', onContainerLeave);
    };
  }

  /**
   * Wheel behaviour follows the convention every canvas tool shares: the
   * wheel (or a two-finger trackpad scroll) pans, and Ctrl/⌘ + wheel — which
   * is also what a trackpad pinch reports — zooms around the cursor.
   */
  private handleWheel(
    e: Konva.KonvaEventObject<WheelEvent>,
    stage: Konva.Stage,
    callbacks: StageEventCallbacks
  ): void {
    e.evt.preventDefault();

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor =
        e.evt.deltaY > 0
          ? 1 / CanvasZoomService.ZOOM_STEP
          : CanvasZoomService.ZOOM_STEP;
      const newScale = this.canvasZoom.zoomToPoint(pointer, factor);
      if (newScale !== null) callbacks.onZoomChange(newScale);
      return;
    }

    const deltaX = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
    const deltaY = e.evt.shiftKey ? 0 : e.evt.deltaY;
    stage.position({
      x: stage.x() - deltaX * WHEEL_PAN_FACTOR,
      y: stage.y() - deltaY * WHEEL_PAN_FACTOR,
    });
    stage.batchDraw();
  }

  /** Pinch to zoom plus two-finger pan, anchored on the gesture midpoint. */
  private handleTouchMove(
    e: Konva.KonvaEventObject<TouchEvent>,
    stage: Konva.Stage,
    callbacks: StageEventCallbacks
  ): void {
    const touches = e.evt.touches;
    if (touches.length < 2) return;

    e.evt.preventDefault();

    // A second finger means navigation, not drawing.
    if (this.pointerActive) {
      this.endGesture();
      callbacks.onDrawCancel();
    }

    const rect = stage.container().getBoundingClientRect();
    const p1 = {
      x: touches[0].clientX - rect.left,
      y: touches[0].clientY - rect.top,
    };
    const p2 = {
      x: touches[1].clientX - rect.left,
      y: touches[1].clientY - rect.top,
    };
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const previousDistance = this.pinchDistance;
    const previousCenter = this.pinchCenter;
    this.pinchDistance = distance;
    this.pinchCenter = center;

    if (previousDistance === null || previousCenter === null) return;
    if (previousDistance <= 0) return;

    const newScale = this.canvasZoom.zoomToPoint(
      center,
      distance / previousDistance
    );

    stage.position({
      x: stage.x() + (center.x - previousCenter.x),
      y: stage.y() + (center.y - previousCenter.y),
    });
    stage.batchDraw();

    if (newScale !== null) callbacks.onZoomChange(newScale);
  }

  /**
   * Whether an event belongs to the gesture in flight. Releases from any other
   * pointer — a resting palm, a second finger — are not ours to act on.
   */
  private isActivePointer(evt: PointerEvent | undefined): boolean {
    if (!this.pointerActive) return false;
    if (this.activePointerId === null) return true;
    return (
      evt?.pointerId === undefined || evt.pointerId === this.activePointerId
    );
  }

  private endGesture(): void {
    this.pointerActive = false;
    this.activePointerId = null;
  }

  /**
   * Palm rejection: while a stylus is in use, resting a hand on the screen
   * would otherwise start a second stroke.
   */
  private shouldIgnore(evt: PointerEvent): boolean {
    if (evt.pointerType === 'pen') {
      this.lastPenAt = Date.now();
      return false;
    }
    if (evt.pointerType !== 'touch') return false;
    return Date.now() - this.lastPenAt < PEN_GRACE_MS;
  }

  /** Reduce a pointer event to the bits the drawing tools need. */
  static toInput(evt: PointerEvent | undefined): DrawInput {
    return {
      pressure: evt?.pressure,
      pointerType: evt?.pointerType,
      shiftKey: evt?.shiftKey,
      altKey: evt?.altKey,
    };
  }
}
