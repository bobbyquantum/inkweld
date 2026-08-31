import { inject, Injectable } from '@angular/core';
import {
  type CanvasObject,
  type CanvasPath,
  type CanvasTool,
  type CanvasToolSettings,
  isBackgroundImage,
} from '@models/canvas.model';
import Konva from 'konva';
import { nanoid } from 'nanoid';

import {
  buildInkOutline,
  MIN_SAMPLE_DISTANCE,
  normalizeToOrigin,
  pickAt,
  rawWidthFactor,
  refineByValue,
  roundCoords,
  sampleWidthFactor,
  simplifyIndices,
} from '../../pages/project/tabs/canvas/ink-stroke';
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

/**
 * The parts of a pointer event the drawing tools care about. Supplied by the
 * stage event service; every field is optional so callers (and tests) can pass
 * nothing and get sensible mouse-like behaviour.
 */
export interface DrawInput {
  /** Stylus pressure, 0–1. Mouse and touch report a constant 0.5. */
  pressure?: number;
  /** `pen`, `mouse` or `touch`. */
  pointerType?: string;
  /** Constrain: 15° angle snapping for lines, square/circle for boxes. */
  shiftKey?: boolean;
  /** Draw boxes and ellipses outward from the start point. */
  altKey?: boolean;
}

const RECT_SELECT_MIN = 2;
const LINE_MIN_LENGTH = 5;
const RECT_MIN_SIZE = 5;

/** Angle increment (radians) lines snap to while Shift is held. */
const ANGLE_SNAP = Math.PI / 12;

/** Opacity applied to objects marked for erasure before the sweep commits. */
const ERASE_PREVIEW_OPACITY = 0.15;

/** Coordinate precision persisted for freehand strokes. */
const STROKE_PRECISION = 2;

/** Width-factor change worth keeping a sample for, as a fraction of full width. */
const PRESSURE_TOLERANCE = 0.07;

/**
 * Owns the drawing-tool state machine: free-draw, line, shape, eraser and
 * rect-select.
 *
 * The host component is responsible for stage/draggable management and for
 * selection mutation (via {@link DrawingHandlers}); this service only knows
 * about Konva nodes it created and the model objects it persists.
 *
 * In-progress geometry is drawn on the renderer's preview layer, so a stroke
 * over a large image doesn't force that image to redraw on every sample.
 */
@Injectable()
export class CanvasDrawingService {
  private readonly canvasService = inject(CanvasService);
  private readonly canvasRenderer = inject(CanvasRendererService);

  // Free-draw state
  private drawingPoints: number[] = [];
  private widthFactors: number[] = [];
  private lastSample: { x: number; y: number; time: number } | null = null;
  private lastWidthFactor = 1;

  // Shared preview state
  private drawingLine: Konva.Line | null = null;
  private drawingShape: Konva.Node | null = null;
  private drawingStartPos: { x: number; y: number } | null = null;

  // Rect-select state
  private rectSelectRect: Konva.Rect | null = null;
  private rectSelectStart: { x: number; y: number } | null = null;

  // Eraser state
  private erasing = false;
  private readonly erasedIds = new Set<string>();

  // Visible-for-tests helpers ────────────────────────────────────────────
  /** Whether a draw operation is currently in progress. */
  isDrawing(): boolean {
    return (
      !!this.drawingLine ||
      !!this.drawingShape ||
      !!this.rectSelectRect ||
      this.erasing
    );
  }

  /**
   * Begin a draw operation if `tool` is one of the drawing tools. Returns
   * true when the host should disable stage-dragging.
   */
  start(
    tool: CanvasTool,
    settings: CanvasToolSettings,
    h: DrawingHandlers,
    input?: DrawInput
  ): boolean {
    if (
      tool !== 'draw' &&
      tool !== 'line' &&
      tool !== 'shape' &&
      tool !== 'eraser' &&
      tool !== 'rectSelect'
    )
      return false;

    if (tool === 'rectSelect') {
      this.initRectSelect(h);
      return true;
    }

    if (tool === 'eraser') {
      this.erasing = true;
      this.eraseAt(h, settings);
      return true;
    }

    const pos = h.pointer();
    if (!pos) return true;

    const layerId = h.ensureLayer();
    if (!layerId) return true;
    const kLayer = this.canvasRenderer.konvaLayers.get(layerId);
    if (!kLayer) return true;

    const previewLayer = this.canvasRenderer.previewLayer ?? kLayer;

    if (tool === 'draw') this.initFreeDraw(pos, settings, previewLayer, input);
    else if (tool === 'line') this.initLineDraw(pos, settings, previewLayer);
    else this.initShapeDraw(pos, settings, previewLayer);

    return true;
  }

  /** Continue an in-progress draw operation. */
  move(
    tool: CanvasTool,
    settings: CanvasToolSettings,
    h: DrawingHandlers,
    input?: DrawInput
  ): void {
    if (this.erasing && tool === 'eraser') {
      this.eraseAt(h, settings);
      return;
    }

    const pos = h.pointer();
    if (!pos) return;

    if (this.rectSelectRect && this.rectSelectStart) {
      this.moveRectSelect(pos);
      return;
    }

    if (this.drawingLine) {
      if (tool === 'draw') this.sampleFreeDraw(pos, settings, input);
      else if (this.drawingStartPos) {
        const end = CanvasDrawingService.constrainLine(
          this.drawingStartPos,
          pos,
          input
        );
        this.drawingLine.points([
          this.drawingStartPos.x,
          this.drawingStartPos.y,
          end.x,
          end.y,
        ]);
      }
      this.drawingLine.getLayer()?.batchDraw();
    }

    if (this.drawingShape && this.drawingStartPos) {
      this.moveShape(pos, settings, input);
      this.drawingShape.getLayer()?.batchDraw();
    }
  }

  /**
   * Finalize an in-progress draw operation.
   *
   * Returns whether an object was committed. A drag that ends on the stage is
   * followed by a browser `click`, and the host places a default-sized shape on
   * click — without this the drag and the click would each create one.
   */
  end(
    tool: CanvasTool,
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): boolean {
    if (this.erasing) {
      this.commitErase();
      return false;
    }
    if (this.rectSelectRect && this.rectSelectStart) {
      this.finalizeRectSelect(h);
      return false;
    }
    if (this.drawingLine && tool === 'draw') {
      return this.finalizeFreeDraw(settings, h);
    }
    if (this.drawingLine && tool === 'line') {
      return this.finalizeLineDraw(settings, h);
    }
    if (this.drawingLine && tool === 'shape') {
      return this.finalizeLineShapeDraw(settings, h);
    }
    if (this.drawingShape && tool === 'shape') {
      return this.finalizeRectShapeDraw(settings, h);
    }
    return false;
  }

  /**
   * Abandon whatever is in progress without persisting it — used when the
   * pointer is lost (window blur, pointer cancel) or the user presses Escape.
   */
  cancel(): void {
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingShape?.destroy();
    this.drawingShape = null;
    this.drawingStartPos = null;
    this.drawingPoints = [];
    this.widthFactors = [];
    this.lastSample = null;

    if (this.rectSelectRect) {
      this.rectSelectRect.destroy();
      this.rectSelectRect = null;
      this.rectSelectStart = null;
    }

    if (this.erasing) {
      this.restoreErasePreview();
      this.erasedIds.clear();
      this.erasing = false;
    }

    this.canvasRenderer.previewLayer?.batchDraw();
    this.canvasRenderer.selectionLayer?.batchDraw();
  }

  // ── Constraints ───────────────────────────────────────────────────────

  /** Snap a line's end point to 15° increments while Shift is held. */
  static constrainLine(
    start: { x: number; y: number },
    end: { x: number; y: number },
    input?: DrawInput
  ): { x: number; y: number } {
    if (!input?.shiftKey) return end;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return end;

    const angle = Math.round(Math.atan2(dy, dx) / ANGLE_SNAP) * ANGLE_SNAP;
    return {
      x: start.x + Math.cos(angle) * length,
      y: start.y + Math.sin(angle) * length,
    };
  }

  /**
   * Resolve the box a rect/ellipse drag describes. Shift forces a square,
   * Alt grows the box outward from the start point instead of from a corner.
   */
  static constrainBox(
    start: { x: number; y: number },
    end: { x: number; y: number },
    input?: DrawInput
  ): { x: number; y: number; width: number; height: number } {
    let dx = end.x - start.x;
    let dy = end.y - start.y;

    if (input?.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * size;
      dy = Math.sign(dy || 1) * size;
    }

    if (input?.altKey) {
      return {
        x: start.x - Math.abs(dx),
        y: start.y - Math.abs(dy),
        width: Math.abs(dx) * 2,
        height: Math.abs(dy) * 2,
      };
    }

    return {
      x: Math.min(start.x, start.x + dx),
      y: Math.min(start.y, start.y + dy),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
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
    kLayer: Konva.Layer,
    input?: DrawInput
  ): void {
    this.drawingPoints = [pos.x, pos.y];
    this.lastSample = { x: pos.x, y: pos.y, time: Date.now() };
    // Seed from the raw sample: a pen put down hard should start thick rather
    // than ease into it.
    this.lastWidthFactor = settings.pressure
      ? rawWidthFactor(input?.pressure, input?.pointerType, 0)
      : 1;
    this.widthFactors = [this.lastWidthFactor];

    this.drawingLine = new Konva.Line({
      stroke: settings.stroke,
      strokeWidth: settings.strokeWidth,
      points: this.drawingPoints,
      lineCap: 'round',
      lineJoin: 'round',
      tension: settings.tension,
      opacity: settings.opacity,
      listening: false,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
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
      opacity: settings.opacity,
      listening: false,
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
    const fill = settings.fillEnabled ? settings.fill : undefined;

    if (shapeType === 'arrow' || shapeType === 'line') {
      this.drawingLine = new Konva.Arrow({
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
        points: [pos.x, pos.y, pos.x, pos.y],
        fill: settings.stroke,
        opacity: settings.opacity,
        listening: false,
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
        fill,
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
        opacity: settings.opacity,
        listening: false,
      });
      kLayer.add(this.drawingShape as Konva.Ellipse);
    } else {
      this.drawingShape = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        fill,
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
        opacity: settings.opacity,
        listening: false,
      });
      kLayer.add(this.drawingShape as Konva.Rect);
    }
  }

  // ── Move helpers ──────────────────────────────────────────────────────

  private moveRectSelect(pos: { x: number; y: number }): void {
    const rect = this.rectSelectRect;
    const start = this.rectSelectStart;
    if (!rect || !start) return;

    rect.x(Math.min(start.x, pos.x));
    rect.y(Math.min(start.y, pos.y));
    rect.width(Math.abs(pos.x - start.x));
    rect.height(Math.abs(pos.y - start.y));
    this.canvasRenderer.selectionLayer?.batchDraw();
  }

  /**
   * Add a sample to the current stroke if it is far enough from the last one.
   *
   * Recording every pointer event produced thousands of near-duplicate
   * coordinates per stroke; the distance gate keeps the stream proportional to
   * the ink actually drawn, at any zoom level.
   */
  private sampleFreeDraw(
    pos: { x: number; y: number },
    settings: CanvasToolSettings,
    input?: DrawInput
  ): void {
    const line = this.drawingLine;
    if (!line) return;

    const scale = this.stageScale();
    const last = this.lastSample;
    const now = Date.now();

    if (last) {
      const distance = Math.hypot(pos.x - last.x, pos.y - last.y);
      if (distance < MIN_SAMPLE_DISTANCE / scale) return;

      if (settings.pressure) {
        const elapsed = Math.max(now - last.time, 1);
        const speed = (distance * scale) / elapsed;
        this.lastWidthFactor = sampleWidthFactor(
          input?.pressure,
          input?.pointerType,
          speed,
          this.lastWidthFactor
        );
      }
    }

    this.drawingPoints.push(pos.x, pos.y);
    this.widthFactors.push(settings.pressure ? this.lastWidthFactor : 1);
    this.lastSample = { x: pos.x, y: pos.y, time: now };

    if (settings.pressure) {
      line.points(
        buildInkOutline(
          this.drawingPoints,
          this.widthFactors,
          settings.strokeWidth
        )
      );
      line.closed(true);
      line.fill(settings.stroke);
      line.strokeWidth(0);
      line.strokeEnabled(false);
    } else {
      line.points(this.drawingPoints);
    }
  }

  private moveShape(
    pos: { x: number; y: number },
    settings: CanvasToolSettings,
    input?: DrawInput
  ): void {
    const start = this.drawingStartPos;
    if (!start || !this.drawingShape) return;

    const box = CanvasDrawingService.constrainBox(start, pos, input);

    if (settings.shapeType === 'ellipse') {
      const ellipse = this.drawingShape as Konva.Ellipse;
      ellipse.x(box.x + box.width / 2);
      ellipse.y(box.y + box.height / 2);
      ellipse.radiusX(box.width / 2);
      ellipse.radiusY(box.height / 2);
    } else {
      const rect = this.drawingShape as Konva.Rect;
      rect.x(box.x);
      rect.y(box.y);
      rect.width(box.width);
      rect.height(box.height);
    }
  }

  // ── Eraser ────────────────────────────────────────────────────────────

  /** Mark everything under the eraser for removal, with immediate feedback. */
  private eraseAt(h: DrawingHandlers, settings: CanvasToolSettings): void {
    const pos = h.pointer();
    if (!pos) return;

    for (const id of this.hitObjectIds(pos, settings.eraserSize)) {
      if (this.erasedIds.has(id)) continue;
      this.erasedIds.add(id);
      const node = this.canvasRenderer.konvaNodes.get(id);
      if (node) {
        node.opacity(ERASE_PREVIEW_OPACITY);
        node.getLayer()?.batchDraw();
      }
    }
  }

  private commitErase(): void {
    const ids = [...this.erasedIds];
    this.erasedIds.clear();
    this.erasing = false;
    if (ids.length > 0) this.canvasService.removeObjects(ids);
  }

  private restoreErasePreview(): void {
    const config = this.canvasService.activeConfig();
    for (const id of this.erasedIds) {
      const node = this.canvasRenderer.konvaNodes.get(id);
      if (!node) continue;
      const obj = config?.objects.find(o => o.id === id);
      node.opacity(obj?.opacity ?? 1);
      node.getLayer()?.batchDraw();
    }
  }

  /**
   * Objects whose geometry falls within `radius` of a canvas point.
   *
   * Deliberately geometric rather than Konva's hit graph: while a drawing tool
   * is active the content layers stop listening for pointer events, so there
   * is no hit graph to query.
   */
  private hitObjectIds(
    point: { x: number; y: number },
    radius: number
  ): string[] {
    const config = this.canvasService.activeConfig();
    if (!config) return [];

    const layerById = new Map(config.layers.map(l => [l.id, l]));
    const hits: string[] = [];

    // Topmost first so a sweep bites the visible object, not what's beneath.
    for (let i = config.objects.length - 1; i >= 0; i--) {
      const obj = config.objects[i];
      if (obj.locked || !obj.visible || isBackgroundImage(obj)) continue;
      // Pins are annotations, not artwork — the eraser never bites them.
      if (obj.type === 'pin') continue;
      const layer = layerById.get(obj.layerId);
      if (!layer?.visible || layer.locked) continue;

      const node = this.canvasRenderer.konvaNodes.get(obj.id);
      if (!node) continue;
      if (this.nodeHitsPoint(node, obj, point, radius)) hits.push(obj.id);
    }

    return hits;
  }

  private nodeHitsPoint(
    node: Konva.Node,
    obj: CanvasObject,
    point: { x: number; y: number },
    radius: number
  ): boolean {
    const local = this.toNodeSpace(node, point);
    if (!local) return false;

    const nodeScale = this.nodeScale(node);
    const localRadius = radius / nodeScale;

    if (obj.type === 'path') {
      return CanvasDrawingService.pathHits(obj, local, localRadius);
    }

    const rect = node.getClientRect({ skipTransform: true });
    return (
      local.x >= rect.x - localRadius &&
      local.x <= rect.x + rect.width + localRadius &&
      local.y >= rect.y - localRadius &&
      local.y <= rect.y + rect.height + localRadius
    );
  }

  /** True when `point` lies within `radius` of the path's centreline. */
  static pathHits(
    obj: CanvasPath,
    point: { x: number; y: number },
    radius: number
  ): boolean {
    const points = obj.points;
    const reach = radius + obj.strokeWidth / 2;
    const reachSq = reach * reach;

    if (points.length === 2) {
      const dx = point.x - points[0];
      const dy = point.y - points[1];
      return dx * dx + dy * dy <= reachSq;
    }

    for (let i = 0; i < points.length - 3; i += 2) {
      const ax = points[i];
      const ay = points[i + 1];
      const bx = points[i + 2];
      const by = points[i + 3];

      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = ((point.x - ax) * dx + (point.y - ay) * dy) / lenSq;
        t = Math.min(Math.max(t, 0), 1);
      }
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const distSq = (point.x - cx) ** 2 + (point.y - cy) ** 2;
      if (distSq <= reachSq) return true;
    }

    return false;
  }

  /** Convert a canvas-space point into a node's own coordinate space. */
  private toNodeSpace(
    node: Konva.Node,
    point: { x: number; y: number }
  ): { x: number; y: number } | null {
    const stage = this.canvasRenderer.stage;
    if (!stage) return null;
    const absolute = stage.getAbsoluteTransform().point(point);
    return node.getAbsoluteTransform().copy().invert().point(absolute);
  }

  /** A node's scale relative to canvas space (i.e. excluding stage zoom). */
  private nodeScale(node: Konva.Node): number {
    const stageScale = this.stageScale();
    const absolute = node.getAbsoluteScale();
    const scale = Math.abs(absolute.x) / stageScale;
    return scale > 1e-6 ? scale : 1;
  }

  private stageScale(): number {
    const scale = this.canvasRenderer.stage?.scaleX() ?? 1;
    return Math.abs(scale) > 1e-6 ? Math.abs(scale) : 1;
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

  /**
   * Commit a freehand stroke: thin the samples, round the coordinates and
   * move the points into the object's own space before persisting.
   */
  private finalizeFreeDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): boolean {
    const layerId = this.drawingPoints.length >= 4 ? h.ensureLayer() : '';

    if (layerId) {
      const epsilon =
        Math.max(0.15, settings.strokeWidth * 0.08) / this.stageScale();
      const geometry = simplifyIndices(this.drawingPoints, epsilon);
      const kept = settings.pressure
        ? refineByValue(geometry, this.widthFactors, PRESSURE_TOLERANCE)
        : geometry;

      const simplified: number[] = [];
      for (const i of kept) {
        simplified.push(
          this.drawingPoints[i * 2],
          this.drawingPoints[i * 2 + 1]
        );
      }

      const normalized = normalizeToOrigin(simplified);
      const path: CanvasPath = {
        id: nanoid(),
        layerId,
        type: 'path',
        x: normalized.offsetX,
        y: normalized.offsetY,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        opacity: settings.opacity,
        points: roundCoords(normalized.points, STROKE_PRECISION),
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
        closed: false,
        tension: settings.tension,
      };

      if (settings.pressure) {
        path.pressures = roundCoords(pickAt(this.widthFactors, kept), 2);
        // The outline already carries the shape of the stroke.
        path.tension = 0;
      }

      this.canvasService.addObject(path);
    }

    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingPoints = [];
    this.widthFactors = [];
    this.lastSample = null;
    this.canvasRenderer.previewLayer?.batchDraw();
    return !!layerId;
  }

  private finalizeLineDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): boolean {
    let committed = false;
    const points = this.drawingLine!.points();
    const dx = (points[2] ?? 0) - (points[0] ?? 0);
    const dy = (points[3] ?? 0) - (points[1] ?? 0);
    const len = Math.hypot(dx, dy);

    if (len > LINE_MIN_LENGTH) {
      const layerId = h.ensureLayer();
      if (layerId) {
        committed = true;
        this.canvasService.addObject({
          id: nanoid(),
          layerId,
          type: 'path',
          x: points[0] ?? 0,
          y: points[1] ?? 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          opacity: settings.opacity,
          points: roundCoords([0, 0, dx, dy], STROKE_PRECISION),
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
    this.canvasRenderer.previewLayer?.batchDraw();
    return committed;
  }

  private finalizeLineShapeDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): boolean {
    let committed = false;
    const points = this.drawingLine!.points();
    const dx = (points[2] ?? 0) - (points[0] ?? 0);
    const dy = (points[3] ?? 0) - (points[1] ?? 0);
    const len = Math.hypot(dx, dy);

    if (len > LINE_MIN_LENGTH) {
      const layerId = h.ensureLayer();
      if (layerId) {
        committed = true;
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
          opacity: settings.opacity,
          shapeType: settings.shapeType,
          width: len,
          height: 0,
          points: roundCoords([0, 0, dx, dy], STROKE_PRECISION),
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          fill: settings.stroke,
        });
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingStartPos = null;
    this.canvasRenderer.previewLayer?.batchDraw();
    return committed;
  }

  private finalizeRectShapeDraw(
    settings: CanvasToolSettings,
    h: DrawingHandlers
  ): boolean {
    let committed = false;
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
        committed = true;
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
          opacity: settings.opacity,
          shapeType: settings.shapeType,
          width: w,
          height: hh,
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          fill: settings.fillEnabled ? settings.fill : undefined,
        });
      }
    }
    this.drawingShape?.destroy();
    this.drawingShape = null;
    this.drawingStartPos = null;
    this.canvasRenderer.previewLayer?.batchDraw();
    return committed;
  }
}
