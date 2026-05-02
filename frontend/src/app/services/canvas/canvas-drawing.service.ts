import { inject, Injectable } from '@angular/core';
import type { CanvasTool, CanvasToolSettings } from '@models/canvas.model';
import Konva from 'konva';
import { nanoid } from 'nanoid';

import { CanvasService } from './canvas.service';
import { CanvasRendererService } from './canvas-renderer.service';

/** Callbacks the host supplies for things only it can decide. */
export interface DrawingHandlers {
  /** Resolve the layer id new objects should be added to, or '' for none. */
  ensureLayer(): string;
  /** Current pointer position in canvas-space, or null. */
  pointer(): { x: number; y: number } | null;
  /** Called after the user completes a rect-select. */
  onRectSelect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void;
  /** Called after a rect-select that was too small to mean anything. */
  onClearSelection(): void;
}

const RECT_SELECT_MIN = 2;
const LINE_MIN_LENGTH = 5;
const RECT_MIN_SIZE = 5;

/**
 * Owns the drawing-tool state machine: free-draw, line, shape and rect-select.
 *
 * The host component is responsible for stage/draggable management and for
 * selection mutation (via {@link DrawingHandlers}); this service only knows
 * about Konva nodes it created and the model objects it persists.
 */
@Injectable()
export class CanvasDrawingService {
  private readonly canvasService = inject(CanvasService);
  private readonly canvasRenderer = inject(CanvasRendererService);

  // Drawing state
  private drawingPoints: number[] = [];
  private drawingLine: Konva.Line | null = null;
  private drawingShape: Konva.Node | null = null;
  private drawingStartPos: { x: number; y: number } | null = null;

  // Rect-select state
  private rectSelectRect: Konva.Rect | null = null;
  private rectSelectStart: { x: number; y: number } | null = null;

  // Visible-for-tests helpers ────────────────────────────────────────────
  /** Whether a draw operation is currently in progress. */
  isDrawing(): boolean {
    return !!this.drawingLine || !!this.drawingShape || !!this.rectSelectRect;
  }

  /**
   * Begin a draw operation if `tool` is one of the drawing tools. Returns
   * true when the host should disable stage-dragging.
   */
  start(
    tool: CanvasTool,
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): boolean {
    if (
      tool !== 'draw' &&
      tool !== 'line' &&
      tool !== 'shape' &&
      tool !== 'rectSelect'
    )
      return false;

    if (tool === 'rectSelect') {
      this.initRectSelect(h);
      return true;
    }

    const pos = h.pointer();
    if (!pos) return true;

    const layerId = h.ensureLayer();
    if (!layerId) return true;
    const kLayer = this.canvasRenderer.konvaLayers.get(layerId);
    if (!kLayer) return true;

    if (tool === 'draw') this.initFreeDraw(pos, settings, kLayer);
    else if (tool === 'line') this.initLineDraw(pos, settings, kLayer);
    else this.initShapeDraw(pos, settings, kLayer);

    return true;
  }

  /** Continue an in-progress draw operation. */
  move(
    tool: CanvasTool,
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): void {
    const pos = h.pointer();
    if (!pos) return;

    if (this.rectSelectRect && this.rectSelectStart) {
      const start = this.rectSelectStart;
      this.rectSelectRect.x(Math.min(start.x, pos.x));
      this.rectSelectRect.y(Math.min(start.y, pos.y));
      this.rectSelectRect.width(Math.abs(pos.x - start.x));
      this.rectSelectRect.height(Math.abs(pos.y - start.y));
      this.canvasRenderer.selectionLayer?.batchDraw();
      return;
    }

    if (this.drawingLine) {
      if (tool === 'draw') {
        this.drawingPoints.push(pos.x, pos.y);
        this.drawingLine.points(this.drawingPoints);
      } else if (this.drawingStartPos) {
        const s = this.drawingStartPos;
        this.drawingLine.points([s.x, s.y, pos.x, pos.y]);
      }
      this.drawingLine.getLayer()?.batchDraw();
    }

    if (this.drawingShape && this.drawingStartPos) {
      const s = this.drawingStartPos;
      if (settings.shapeType === 'ellipse') {
        const e = this.drawingShape as Konva.Ellipse;
        e.x((s.x + pos.x) / 2);
        e.y((s.y + pos.y) / 2);
        e.radiusX(Math.abs(pos.x - s.x) / 2);
        e.radiusY(Math.abs(pos.y - s.y) / 2);
      } else {
        const r = this.drawingShape as Konva.Rect;
        r.x(Math.min(s.x, pos.x));
        r.y(Math.min(s.y, pos.y));
        r.width(Math.abs(pos.x - s.x));
        r.height(Math.abs(pos.y - s.y));
      }
      this.drawingShape.getLayer()?.batchDraw();
    }
  }

  /** Finalize an in-progress draw operation. */
  end(
    tool: CanvasTool,
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): void {
    if (this.rectSelectRect && this.rectSelectStart) {
      this.finalizeRectSelect(h);
      return;
    }
    if (this.drawingLine && tool === 'draw') {
      this.finalizeFreeDraw(settings, h);
      return;
    }
    if (this.drawingLine && tool === 'line') {
      this.finalizeLineDraw(settings, h);
      return;
    }
    if (this.drawingLine && tool === 'shape') {
      this.finalizeLineShapeDraw(settings, h);
      return;
    }
    if (this.drawingShape && tool === 'shape') {
      this.finalizeRectShapeDraw(settings, h);
    }
  }

  // ── Init helpers ──────────────────────────────────────────────────────

  private initRectSelect(h: DrawingHandlers): void {
    const pos = h.pointer();
    if (!pos) return;
    this.rectSelectStart = pos;
    this.rectSelectRect = new Konva.Rect({
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      stroke: '#1976d2',
      strokeWidth: 1,
      dash: [6, 3],
      fill: 'rgba(25,118,210,0.08)',
      listening: false,
    });
    this.canvasRenderer.selectionLayer?.add(this.rectSelectRect);
  }

  private initFreeDraw(
    pos: { x: number; y: number },
    settings: CanvasToolSettings,
    kLayer: Konva.Layer
  ): void {
    this.drawingPoints = [pos.x, pos.y];
    this.drawingLine = new Konva.Line({
      stroke: settings.stroke,
      strokeWidth: settings.strokeWidth,
      points: this.drawingPoints,
      lineCap: 'round',
      lineJoin: 'round',
      tension: settings.tension,
    });
    kLayer.add(this.drawingLine);
  }

  private initLineDraw(
    pos: { x: number; y: number },
    settings: CanvasToolSettings,
    kLayer: Konva.Layer
  ): void {
    this.drawingStartPos = pos;
    this.drawingLine = new Konva.Line({
      stroke: settings.stroke,
      strokeWidth: settings.strokeWidth,
      points: [pos.x, pos.y, pos.x, pos.y],
      lineCap: 'round',
    });
    kLayer.add(this.drawingLine);
  }

  private initShapeDraw(
    pos: { x: number; y: number },
    settings: CanvasToolSettings,
    kLayer: Konva.Layer
  ): void {
    this.drawingStartPos = pos;
    const shapeType = settings.shapeType;

    if (shapeType === 'arrow' || shapeType === 'line') {
      this.drawingLine = new Konva.Arrow({
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
        points: [pos.x, pos.y, pos.x, pos.y],
        fill: settings.stroke,
        pointerLength: shapeType === 'arrow' ? 10 : 0,
        pointerWidth: shapeType === 'arrow' ? 10 : 0,
      });
      kLayer.add(this.drawingLine);
    } else if (shapeType === 'ellipse') {
      this.drawingShape = new Konva.Ellipse({
        x: pos.x,
        y: pos.y,
        radiusX: 0,
        radiusY: 0,
        fill: settings.fill,
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
      });
      kLayer.add(this.drawingShape as Konva.Ellipse);
    } else {
      this.drawingShape = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        fill: settings.fill,
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
      });
      kLayer.add(this.drawingShape as Konva.Rect);
    }
  }

  // ── Finalize helpers ──────────────────────────────────────────────────

  private finalizeRectSelect(h: DrawingHandlers): void {
    const r = this.rectSelectRect!;
    const sel = {
      x: r.x(),
      y: r.y(),
      width: r.width(),
      height: r.height(),
    };
    r.destroy();
    this.rectSelectRect = null;
    this.rectSelectStart = null;

    if (sel.width > RECT_SELECT_MIN || sel.height > RECT_SELECT_MIN) {
      h.onRectSelect(sel);
    } else {
      h.onClearSelection();
    }
    this.canvasRenderer.selectionLayer?.batchDraw();
  }

  private finalizeFreeDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): void {
    if (this.drawingPoints.length >= 4) {
      const layerId = h.ensureLayer();
      if (layerId) {
        this.canvasService.addObject({
          id: nanoid(),
          layerId,
          type: 'path',
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          points: [...this.drawingPoints],
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          closed: false,
          tension: settings.tension,
        });
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingPoints = [];
  }

  private finalizeLineDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): void {
    const points = this.drawingLine!.points();
    const dx = (points[2] ?? 0) - (points[0] ?? 0);
    const dy = (points[3] ?? 0) - (points[1] ?? 0);
    const len = Math.hypot(dx, dy);

    if (len > LINE_MIN_LENGTH) {
      const layerId = h.ensureLayer();
      if (layerId) {
        this.canvasService.addObject({
          id: nanoid(),
          layerId,
          type: 'path',
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          points: [...points],
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          closed: false,
          tension: 0,
        });
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingStartPos = null;
  }

  private finalizeLineShapeDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): void {
    const points = this.drawingLine!.points();
    const dx = (points[2] ?? 0) - (points[0] ?? 0);
    const dy = (points[3] ?? 0) - (points[1] ?? 0);
    const len = Math.hypot(dx, dy);

    if (len > LINE_MIN_LENGTH) {
      const layerId = h.ensureLayer();
      if (layerId) {
        this.canvasService.addObject({
          id: nanoid(),
          layerId,
          type: 'shape',
          x: points[0] ?? 0,
          y: points[1] ?? 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          shapeType: settings.shapeType,
          width: len,
          height: 0,
          points: [0, 0, dx, dy],
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          fill: settings.stroke,
        });
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingStartPos = null;
  }

  private finalizeRectShapeDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): void {
    let w: number, hh: number, sx: number, sy: number;

    if (settings.shapeType === 'ellipse') {
      const e = this.drawingShape as Konva.Ellipse;
      w = e.radiusX() * 2;
      hh = e.radiusY() * 2;
      sx = e.x() - e.radiusX();
      sy = e.y() - e.radiusY();
    } else {
      const r = this.drawingShape as Konva.Rect;
      w = r.width();
      hh = r.height();
      sx = r.x();
      sy = r.y();
    }

    if (w > RECT_MIN_SIZE && hh > RECT_MIN_SIZE) {
      const layerId = h.ensureLayer();
      if (layerId) {
        this.canvasService.addObject({
          id: nanoid(),
          layerId,
          type: 'shape',
          x: sx,
          y: sy,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          shapeType: settings.shapeType,
          width: w,
          height: hh,
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          fill: settings.fill,
        });
      }
    }
    this.drawingShape?.destroy();
    this.drawingShape = null;
    this.drawingStartPos = null;
  }
}
