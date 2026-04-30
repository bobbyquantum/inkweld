import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  HostBinding,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, type MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { createMediaUrl } from '@components/image-paste/image-paste-plugin';
import { TabPresenceIndicatorComponent } from '@components/tab-presence-indicator/tab-presence-indicator.component';
import {
  CanvasPinDialogComponent,
  type CanvasPinDialogData,
  type CanvasPinDialogResult,
} from '@dialogs/canvas-pin-dialog/canvas-pin-dialog.component';
import {
  CanvasTextDialogComponent,
  type CanvasTextDialogData,
  type CanvasTextDialogResult,
} from '@dialogs/canvas-text-dialog/canvas-text-dialog.component';
import {
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasShapeType,
  type CanvasText,
  type CanvasTool,
  type CanvasToolSettings,
  createDefaultToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasColorService } from '@services/canvas/canvas-color.service';
import { CanvasLayerService } from '@services/canvas/canvas-layer.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { CanvasZoomService } from '@services/canvas/canvas-zoom.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { PresenceService } from '@services/presence/presence.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import Konva from 'konva';
import { nanoid } from 'nanoid';

import {
  createPinRelationship,
  removePinRelationship,
} from './canvas-pin-helpers';
import { downloadSvg } from './canvas-svg-export';
import { getObjectIcon, getObjectLabel, rectsIntersect } from './canvas-utils';

/** Delay (ms) after sidebar toggle before telling Konva to resize */
const SIDEBAR_RESIZE_DELAY_MS = 250;

@Component({
  selector: 'app-canvas-tab',
  templateUrl: './canvas-tab.component.html',
  styleUrls: ['./canvas-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TabPresenceIndicatorComponent,
    DocumentBreadcrumbsComponent,
  ],
  providers: [
    CanvasService,
    CanvasRendererService,
    CanvasLayerService,
    CanvasZoomService,
    CanvasColorService,
  ],
})
export class CanvasTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly canvasService = inject(CanvasService);
  private readonly canvasRenderer = inject(CanvasRendererService);
  private readonly canvasLayer = inject(CanvasLayerService);
  private readonly canvasZoom = inject(CanvasZoomService);
  private readonly canvasColor = inject(CanvasColorService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly presence = inject(PresenceService);

  /** Stable awareness location for this canvas tab. */
  protected readonly presenceLocation = computed(() => {
    const id = this.elementId();
    return id ? `canvas:${id}` : null;
  });

  /** Mirror our presence into the project's awareness whenever the route changes. */
  private readonly presenceLocationEffect = effect(() => {
    this.presence.setActiveLocation(this.presenceLocation());
  });

  /** Reference to the canvas container <div> */
  private readonly canvasContainer =
    viewChild<ElementRef<HTMLDivElement>>('canvasContainer');

  /** Trigger for the right-click context menu */
  private readonly contextMenuTrigger =
    viewChild<MatMenuTrigger>('contextMenuTrigger');

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  protected readonly elementId = signal<string>('');
  protected readonly elementName = signal<string>('Canvas');

  /** Currently active tool */
  protected readonly activeTool = signal<CanvasTool>('select');

  /** Tool settings (stroke, fill, font, etc.) */
  protected readonly toolSettings = signal<CanvasToolSettings>(
    createDefaultToolSettings()
  );

  /** Currently active layer ID */
  protected readonly activeLayerId = signal<string>('');

  /** Currently selected object ID */
  protected readonly selectedObjectId = signal<string | null>(null);

  /** Whether the sidebar panel is open */
  protected readonly sidebarOpen = signal(
    this.readLocalStorage('canvasSidebarOpen') !== 'false'
  );

  /** Current zoom level (updated by Konva stage events) */
  protected readonly zoomLevel = signal<number>(1);

  /** Clipboard for cut/copy/paste operations */
  protected readonly clipboard = signal<CanvasObject | null>(null);

  /** Whether the last clipboard operation was a cut (removes original on paste) */
  private clipboardIsCut = false;

  /** Position (in page pixels) where the context menu should appear */
  protected contextMenuPosition = { x: 0, y: 0 };

  /** Canvas-space position where the context menu was opened (for paste) */
  private contextMenuCanvasPos: { x: number; y: number } | null = null;

  /** Zoom as percentage string */
  protected readonly zoomPercent = computed(() =>
    Math.round(this.zoomLevel() * 100)
  );

  /** Layers sorted by order (bottom to top) */
  protected readonly sortedLayers = computed<CanvasLayer[]>(() => {
    const config = this.canvasService.activeConfig();
    if (!config) return [];
    return [...config.layers].sort((a, b) => a.order - b.order);
  });

  /** Objects on the active layer */
  protected readonly activeLayerObjects = computed<CanvasObject[]>(() => {
    const config = this.canvasService.activeConfig();
    const layerId = this.activeLayerId();
    if (!config || !layerId) return [];
    return config.objects.filter(o => o.layerId === layerId);
  });

  /** Whether there is a valid active layer (used to disable creation tools) */
  protected readonly hasActiveLayer = computed<boolean>(() => {
    const config = this.canvasService.activeConfig();
    return !!config && config.layers.length > 0;
  });

  /** Shape icon based on current shape type setting */
  protected readonly shapeIcon = computed<string>(() => {
    switch (this.toolSettings().shapeType) {
      case 'rect':
        return 'crop_square';
      case 'ellipse':
        return 'circle';
      case 'arrow':
        return 'arrow_right_alt';
      case 'line':
        return 'horizontal_rule';
      default:
        return 'crop_square';
    }
  });

  /**
   * Return the active layer ID, auto-selecting the first layer if the
   * current value is empty or no longer exists.  Returns '' only when
   * the canvas has no layers at all.
   */
  private ensureActiveLayer(): string {
    const id = this.activeLayerId();
    if (id) {
      // Make sure it still exists
      const config = this.canvasService.activeConfig();
      if (config?.layers.some(l => l.id === id)) return id;
    }
    // Fallback: select the first layer
    const layers = this.sortedLayers();
    if (layers.length > 0) {
      this.activeLayerId.set(layers[0].id);
      return layers[0].id;
    }
    return '';
  }

  /** CSS class on host for cursor styling */
  @HostBinding('class')
  get toolClass(): string {
    return `tool-${this.activeTool()}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Konva State
  // ─────────────────────────────────────────────────────────────────────────

  // Konva state lives in CanvasRendererService. Stage getters delegate to it.
  private get stage(): Konva.Stage | null {
    return this.canvasRenderer.stage;
  }
  private get konvaLayers(): Map<string, Konva.Layer> {
    return this.canvasRenderer.konvaLayers;
  }
  private get konvaNodes(): Map<string, Konva.Node> {
    return this.canvasRenderer.konvaNodes;
  }
  private get transformer(): Konva.Transformer | null {
    return this.canvasRenderer.transformer;
  }
  private get selectionLayer(): Konva.Layer | null {
    return this.canvasRenderer.selectionLayer;
  }

  /** Points being drawn with the draw/line tool */
  private drawingPoints: number[] = [];
  /** Temporary Konva.Line used during freehand/line drawing */
  private drawingLine: Konva.Line | null = null;
  /** Temporary Konva node for shape preview during drag-to-draw */
  private drawingShape: Konva.Node | null = null;
  /** Start position for line/shape drag drawing */
  private drawingStartPos: { x: number; y: number } | null = null;

  /** Rectangle selection state */
  private rectSelectRect: Konva.Rect | null = null;
  private rectSelectStart: { x: number; y: number } | null = null;

  /** Guard to ensure keyboard shortcuts are only registered once per component lifetime */
  private keyboardShortcutsInitialized = false;

  /** Handlers injected into CanvasRendererService for Konva node events */
  private nodeHandlers = {
    onSelect: (objId: string) => this.onSelectObject(objId),
    onSelectKonvaNode: (node: Konva.Node) => this.selectKonvaNode(node),
    onDragEnd: (objId: string, x: number, y: number) =>
      this.canvasService.updateObject(objId, { x, y }),
    onTransformEnd: (
      objId: string,
      x: number,
      y: number,
      scaleX: number,
      scaleY: number,
      rotation: number
    ) =>
      this.canvasService.updateObject(objId, {
        x,
        y,
        scaleX,
        scaleY,
        rotation,
      }),
    onDblClickText: (obj: CanvasText, textNode: Konva.Text) =>
      this.openTextEditDialog(obj, textNode),
  };

  constructor() {
    // Keep the tab title in sync with the underlying element's name.
    effect(() => {
      const elements = this.projectState.elements();
      const id = this.elementId();
      if (!id) return;
      const element = elements.find(e => e.id === id);
      if (element) this.elementName.set(element.name);
    });

    // Re-render Konva when config changes (local edits OR remote sync).
    effect(() => {
      const config = this.canvasService.activeConfig();
      const container = this.canvasContainer();
      if (config && container && this.stage) {
        this.canvasRenderer.syncKonvaFromConfig(
          config.layers,
          config.objects,
          this.selectedObjectId(),
          this.nodeHandlers
        );
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tabId = params.get('tabId') || '';
        this.elementId.set(tabId);

        // Destroy previous Konva stage
        this.destroyStage();

        // Find element name
        const element = this.projectState.elements().find(e => e.id === tabId);
        if (element) {
          this.elementName.set(element.name);
        }

        // Load canvas config — this binds the service to the element so
        // remote metadata updates re-render the canvas live.
        const config = this.canvasService.loadConfig(tabId);

        // Set active layer to the first layer
        if (config.layers.length > 0) {
          this.activeLayerId.set(config.layers[0].id);
        }

        // Initialize Konva stage after a tick so the DOM is ready
        setTimeout(() => this.initStage(), 0);
      });
  }

  ngOnDestroy(): void {
    this.saveViewport();
    this.destroyStage();
    // Stop broadcasting our presence on this canvas.
    this.presence.setActiveLocation(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Konva Initialization
  // ─────────────────────────────────────────────────────────────────────────

  private initStage(): void {
    const container = this.canvasContainer()?.nativeElement as HTMLDivElement;
    if (!container) return;

    const config = this.canvasService.activeConfig();
    if (!config) return;

    const savedViewport = this.canvasService.loadViewport(this.elementId());

    const { zoomLevel } = this.canvasRenderer.initStage(
      container,
      config.layers,
      config.objects,
      savedViewport,
      this.nodeHandlers
    );

    this.zoomLevel.set(zoomLevel);

    // Wheel zoom
    this.stage!.on('wheel', e => {
      e.evt.preventDefault();
      const pointer = this.stage!.getPointerPosition();
      if (!pointer) return;
      const factor =
        e.evt.deltaY > 0
          ? 1 / CanvasZoomService.ZOOM_STEP
          : CanvasZoomService.ZOOM_STEP;
      const newScale = this.canvasZoom.zoomToPoint(pointer, factor);
      if (newScale !== null) this.zoomLevel.set(newScale);
    });

    // Click on empty space → deselect
    this.stage!.on('click tap', e => {
      if (e.target === this.stage) {
        this.handleStageClick(
          e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
        );
      }
    });

    // Mouse events for drawing tools
    this.stage!.on('mousedown touchstart', e => {
      if (e.target !== this.stage) return;
      this.handleDrawStart(
        e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
      );
    });

    this.stage!.on('mousemove touchmove', () => {
      this.handleDrawMove();
    });

    this.stage!.on('mouseup touchend', () => {
      this.handleDrawEnd();
    });

    // Keyboard shortcuts (register only once per component lifetime)
    if (!this.keyboardShortcutsInitialized) {
      this.setupKeyboardShortcuts();
      this.keyboardShortcutsInitialized = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage Event Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private handleStageClick(
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): void {
    const tool = this.activeTool();

    if (tool === 'select' || tool === 'pan' || tool === 'rectSelect') {
      // Deselect
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
      this.selectionLayer?.batchDraw();
      return;
    }

    if (tool === 'pin') {
      this.placePin(e);
      return;
    }

    if (tool === 'text') {
      this.placeText(e);
      return;
    }

    if (tool === 'shape') {
      this.placeDefaultShape(e);
    }
  }

  private handleDrawStart(
    _e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): void {
    const tool = this.activeTool();
    if (
      tool !== 'draw' &&
      tool !== 'line' &&
      tool !== 'shape' &&
      tool !== 'rectSelect'
    )
      return;

    // Prevent stage from dragging during draw / rect-select
    this.stage!.draggable(false);

    if (tool === 'rectSelect') {
      this.initRectSelect();
      return;
    }

    const pos = this.getCanvasPointerPosition();
    if (!pos) return;

    const layerId = this.ensureActiveLayer();
    if (!layerId) return;
    const kLayer = this.konvaLayers.get(layerId);
    if (!kLayer) return;

    const settings = this.toolSettings();

    if (tool === 'draw') {
      this.initFreeDraw(pos, settings, kLayer);
    } else if (tool === 'line') {
      this.initLineDraw(pos, settings, kLayer);
    } else if (tool === 'shape') {
      this.initShapeDraw(pos, settings, kLayer);
    }
  }

  private initRectSelect(): void {
    const pos = this.getCanvasPointerPosition();
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
    this.selectionLayer?.add(this.rectSelectRect);
  }

  private initFreeDraw(
    pos: { x: number; y: number },
    settings: ReturnType<typeof this.toolSettings>,
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
    settings: ReturnType<typeof this.toolSettings>,
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
    settings: ReturnType<typeof this.toolSettings>,
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

  private handleDrawMove(): void {
    const pos = this.getCanvasPointerPosition();
    if (!pos) return;

    // ── Rectangle selection drag ──────────────────────────────────────────
    if (this.rectSelectRect && this.rectSelectStart) {
      const start = this.rectSelectStart;
      this.rectSelectRect.x(Math.min(start.x, pos.x));
      this.rectSelectRect.y(Math.min(start.y, pos.y));
      this.rectSelectRect.width(Math.abs(pos.x - start.x));
      this.rectSelectRect.height(Math.abs(pos.y - start.y));
      this.selectionLayer?.batchDraw();
      return;
    }

    // Freehand drawing or line/arrow preview
    if (this.drawingLine) {
      const tool = this.activeTool();
      if (tool === 'draw') {
        this.drawingPoints.push(pos.x, pos.y);
        this.drawingLine.points(this.drawingPoints);
      } else {
        // Line tool or arrow/line shape: update end point
        const start = this.drawingStartPos;
        if (start) {
          this.drawingLine.points([start.x, start.y, pos.x, pos.y]);
        }
      }
      this.drawingLine.getLayer()?.batchDraw();
    }

    // Rect/ellipse shape preview
    if (this.drawingShape && this.drawingStartPos) {
      const start = this.drawingStartPos;
      const settings = this.toolSettings();

      if (settings.shapeType === 'ellipse') {
        const ellipse = this.drawingShape as Konva.Ellipse;
        ellipse.x((start.x + pos.x) / 2);
        ellipse.y((start.y + pos.y) / 2);
        ellipse.radiusX(Math.abs(pos.x - start.x) / 2);
        ellipse.radiusY(Math.abs(pos.y - start.y) / 2);
      } else {
        const rect = this.drawingShape as Konva.Rect;
        rect.x(Math.min(start.x, pos.x));
        rect.y(Math.min(start.y, pos.y));
        rect.width(Math.abs(pos.x - start.x));
        rect.height(Math.abs(pos.y - start.y));
      }
      this.drawingShape.getLayer()?.batchDraw();
    }
  }

  private handleDrawEnd(): void {
    const tool = this.activeTool();
    const restoreDraggable = (): void => {
      this.stage?.draggable(tool === 'select' || tool === 'pan');
    };

    if (this.rectSelectRect && this.rectSelectStart) {
      this.finalizeRectSelect();
    } else if (this.drawingLine && tool === 'draw') {
      this.finalizeFreeDraw();
    } else if (this.drawingLine && tool === 'line') {
      this.finalizeLineDraw();
    } else if (this.drawingLine && tool === 'shape') {
      this.finalizeLineShapeDraw();
    } else if (this.drawingShape && tool === 'shape') {
      this.finalizeRectShapeDraw();
    }

    restoreDraggable();
  }

  private finalizeRectSelect(): void {
    const selRect = {
      x: this.rectSelectRect!.x(),
      y: this.rectSelectRect!.y(),
      width: this.rectSelectRect!.width(),
      height: this.rectSelectRect!.height(),
    };
    this.rectSelectRect!.destroy();
    this.rectSelectRect = null;
    this.rectSelectStart = null;

    if (selRect.width > 2 || selRect.height > 2) {
      this.selectNodesInRect(selRect);
    } else {
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
    }
    this.selectionLayer?.batchDraw();
  }

  private finalizeFreeDraw(): void {
    if (this.drawingPoints.length >= 4) {
      const layerId = this.ensureActiveLayer();
      if (layerId) {
        const settings = this.toolSettings();
        const pathObj: CanvasPath = {
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
        };
        this.canvasService.addObject(pathObj);
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingPoints = [];
  }

  private finalizeLineDraw(): void {
    const points = this.drawingLine!.points();
    const dx = (points[2] ?? 0) - (points[0] ?? 0);
    const dy = (points[3] ?? 0) - (points[1] ?? 0);
    const len = Math.hypot(dx, dy);

    if (len > 5) {
      const layerId = this.ensureActiveLayer();
      if (layerId) {
        const settings = this.toolSettings();
        const pathObj: CanvasPath = {
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
        };
        this.canvasService.addObject(pathObj);
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingStartPos = null;
  }

  private finalizeLineShapeDraw(): void {
    const points = this.drawingLine!.points();
    const dx = (points[2] ?? 0) - (points[0] ?? 0);
    const dy = (points[3] ?? 0) - (points[1] ?? 0);
    const len = Math.hypot(dx, dy);

    if (len > 5) {
      const layerId = this.ensureActiveLayer();
      if (layerId) {
        const settings = this.toolSettings();
        const shapeObj: CanvasShape = {
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
        };
        this.canvasService.addObject(shapeObj);
      }
    }
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingStartPos = null;
  }

  private finalizeRectShapeDraw(): void {
    const settings = this.toolSettings();
    let w: number, h: number, sx: number, sy: number;

    if (settings.shapeType === 'ellipse') {
      const ellipse = this.drawingShape as Konva.Ellipse;
      w = ellipse.radiusX() * 2;
      h = ellipse.radiusY() * 2;
      sx = ellipse.x() - ellipse.radiusX();
      sy = ellipse.y() - ellipse.radiusY();
    } else {
      const rect = this.drawingShape as Konva.Rect;
      w = rect.width();
      h = rect.height();
      sx = rect.x();
      sy = rect.y();
    }

    if (w > 5 && h > 5) {
      const layerId = this.ensureActiveLayer();
      if (layerId) {
        const shapeObj: CanvasShape = {
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
          height: h,
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          fill: settings.fill,
        };
        this.canvasService.addObject(shapeObj);
      }
    }
    this.drawingShape?.destroy();
    this.drawingShape = null;
    this.drawingStartPos = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Object Placement
  // ─────────────────────────────────────────────────────────────────────────

  private placePin(_e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    const pos = this.getCanvasPointerPosition();
    if (!pos) return;

    const data: CanvasPinDialogData = {
      title: 'Place Pin',
      label: 'New Pin',
      color: '#E53935',
    };
    const dialogRef = this.dialog.open(CanvasPinDialogComponent, {
      data,
      width: '420px',
    });
    dialogRef
      .afterClosed()
      .subscribe((result: CanvasPinDialogResult | undefined) => {
        if (!result) return;
        const layerId = this.ensureActiveLayer();
        if (!layerId) return;

        // Create formal relationship if linking to an element
        let relationshipId: string | undefined;
        if (result.linkedElementId) {
          relationshipId = createPinRelationship(
            this.relationshipService,
            this.elementId(),
            result.linkedElementId
          );
        }

        const pin = this.canvasService.createPin(
          layerId,
          pos.x,
          pos.y,
          result.label,
          {
            color: result.color,
            linkedElementId: result.linkedElementId,
            relationshipId,
          }
        );
        this.canvasService.addObject(pin);
      });
  }

  private placeText(_e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    const pos = this.getCanvasPointerPosition();
    if (!pos) return;

    const settings = this.toolSettings();
    const data: CanvasTextDialogData = {
      title: 'Add Text',
      text: 'Text',
      color: settings.fill,
    };
    const dialogRef = this.dialog.open(CanvasTextDialogComponent, {
      data,
      width: '450px',
    });
    dialogRef
      .afterClosed()
      .subscribe((result: CanvasTextDialogResult | undefined) => {
        if (!result) return;
        const layerId = this.ensureActiveLayer();
        if (!layerId) return;
        const textObj: CanvasText = {
          id: nanoid(),
          layerId,
          type: 'text',
          x: pos.x,
          y: pos.y,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          text: result.text,
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          fontStyle: 'normal',
          fill: result.color,
          width: 200,
          align: 'left',
          name: result.text.substring(0, 30),
        };
        this.canvasService.addObject(textObj);
      });
  }

  /** Click with shape tool → place a default-sized shape */
  private placeDefaultShape(
    _e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): void {
    const pos = this.getCanvasPointerPosition();
    if (!pos) return;

    const settings = this.toolSettings();
    const defaultSize = 100;
    const isLinear =
      settings.shapeType === 'line' || settings.shapeType === 'arrow';
    const layerId = this.ensureActiveLayer();
    if (!layerId) return;
    const shapeObj: CanvasShape = {
      id: nanoid(),
      layerId,
      type: 'shape',
      x: pos.x - defaultSize / 2,
      y: pos.y - defaultSize / 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      shapeType: settings.shapeType,
      width: defaultSize,
      height: isLinear ? 0 : defaultSize,
      points: isLinear ? [0, 0, defaultSize, 0] : undefined,
      stroke: settings.stroke,
      strokeWidth: settings.strokeWidth,
      fill: settings.fill,
    };
    this.canvasService.addObject(shapeObj);
  }

  /** Open a dialog to edit an existing text node's content and color. */
  private openTextEditDialog(obj: CanvasText, textNode: Konva.Text): void {
    const data: CanvasTextDialogData = {
      title: 'Edit Text',
      text: obj.text,
      color: obj.fill,
      confirmLabel: 'Save',
    };
    const dialogRef = this.dialog.open(CanvasTextDialogComponent, {
      data,
      width: '450px',
    });
    dialogRef
      .afterClosed()
      .subscribe((result: CanvasTextDialogResult | undefined) => {
        if (!result) return;
        textNode.text(result.text);
        textNode.fill(result.color);
        this.canvasService.updateObject(obj.id, {
          text: result.text,
          fill: result.color,
          name: result.text.substring(0, 30),
        });
      });
  }

  /** Open a dialog to edit an existing pin's label and color. */
  private openPinEditDialog(
    obj: CanvasPin,
    label: Konva.Text,
    marker: Konva.Circle,
    group: Konva.Group
  ): void {
    // Resolve linked element name for display
    const linkedElement = obj.linkedElementId
      ? this.projectState.elements().find(e => e.id === obj.linkedElementId)
      : undefined;

    const data: CanvasPinDialogData = {
      title: 'Edit Pin',
      label: obj.label,
      color: obj.color,
      confirmLabel: 'Save',
      linkedElementId: obj.linkedElementId,
      linkedElementName: linkedElement?.name,
    };
    const dialogRef = this.dialog.open(CanvasPinDialogComponent, {
      data,
      width: '420px',
    });
    dialogRef
      .afterClosed()
      .subscribe((result: CanvasPinDialogResult | undefined) => {
        if (!result) return;
        label.text(result.label);
        label.x(-label.width() / 2);
        marker.fill(result.color);

        // Update or remove link indicator
        CanvasRendererService.updatePinLinkIndicator(
          group,
          !!result.linkedElementId
        );

        // Manage relationships when link changes
        const oldLink = obj.linkedElementId;
        const newLink = result.linkedElementId;
        let relationshipId = obj.relationshipId;

        if (oldLink !== newLink) {
          // Remove old relationship if it existed
          if (oldLink && relationshipId) {
            removePinRelationship(this.relationshipService, obj);
            relationshipId = undefined;
          }
          // Create new relationship if linking to an element
          if (newLink) {
            relationshipId = createPinRelationship(
              this.relationshipService,
              this.elementId(),
              newLink
            );
          }
        }

        group.getLayer()?.batchDraw();
        this.canvasService.updateObject(obj.id, {
          label: result.label,
          color: result.color,
          name: result.label,
          linkedElementId: result.linkedElementId,
          relationshipId,
        });
      });
  }

  /** Convert pointer position to canvas world coordinates */
  private getCanvasPointerPosition(): {
    x: number;
    y: number;
  } | null {
    if (!this.stage) return null;
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;

    const transform = this.stage.getAbsoluteTransform().copy().invert();
    return transform.point(pointer);
  }

  /** Get the center of the visible viewport in canvas world coordinates */
  private getViewportCenter(): { x: number; y: number } {
    if (!this.stage) return { x: 0, y: 0 };
    const transform = this.stage.getAbsoluteTransform().copy().invert();
    return transform.point({
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Selection
  // ─────────────────────────────────────────────────────────────────────────

  private selectKonvaNode(node: Konva.Node): void {
    if (!this.transformer) return;

    // If node is a Group (like image or pin), attach transformer to it
    this.transformer.nodes([node]);
    this.selectionLayer?.batchDraw();
  }

  /** Select all Konva nodes whose bounding box intersects the given rect. */
  private selectNodesInRect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    if (!this.transformer) return;

    const selected: Konva.Node[] = [];

    // Iterate every Konva layer (skipping the selection layer)
    for (const [, kLayer] of this.konvaLayers) {
      kLayer.getChildren().forEach(child => {
        const box = child.getClientRect({ relativeTo: kLayer });
        if (rectsIntersect(rect, box)) {
          selected.push(child);
        }
      });
    }

    this.transformer.nodes(selected);

    if (selected.length === 1) {
      // Single selection → also track in selectedObjectId
      const id = selected[0].id();
      if (id) {
        this.selectedObjectId.set(id);
      }
    } else {
      // Multi-select → clear single object selection
      this.selectedObjectId.set(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard Shortcuts
  // ─────────────────────────────────────────────────────────────────────────

  private readonly keyHandler = (e: KeyboardEvent) => {
    if (this.isTypingTarget(e.target)) return;

    const key = e.key.toLowerCase();
    if (this.handleClipboardAndDuplicateShortcuts(e, key)) return;
    if (this.handleToolSelectionShortcuts(key, e.ctrlKey || e.metaKey)) return;
    if (this.handleEditingShortcuts(e, key)) return;
    this.handleZoomShortcuts(e, key);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return true;
    }

    // Check for contentEditable elements
    if (target instanceof HTMLElement) {
      return (
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true'
      );
    }

    return false;
  }

  private handleClipboardAndDuplicateShortcuts(
    e: KeyboardEvent,
    key: string
  ): boolean {
    if (!e.ctrlKey && !e.metaKey) return false;

    if (key === 'c') {
      e.preventDefault();
      this.onCopy();
      return true;
    }

    if (key === 'x') {
      e.preventDefault();
      this.onCut();
      return true;
    }

    if (key === 'v') {
      e.preventDefault();
      this.contextMenuCanvasPos = null;
      this.onPaste();
      return true;
    }

    if (key === 'd') {
      e.preventDefault();
      this.onDuplicateObject();
      return true;
    }

    return false;
  }

  private static readonly TOOL_KEY_MAP: Record<string, CanvasTool> = {
    v: 'select',
    r: 'rectSelect',
    h: 'pan',
    p: 'pin',
    d: 'draw',
    l: 'line',
    s: 'shape',
    t: 'text',
  };

  private handleToolSelectionShortcuts(
    key: string,
    hasModifier: boolean
  ): boolean {
    if (hasModifier) return false;

    const tool = CanvasTabComponent.TOOL_KEY_MAP[key];
    if (!tool) return false;

    this.onToolChange(tool);
    return true;
  }

  private handleEditingShortcuts(e: KeyboardEvent, key: string): boolean {
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      this.deleteSelectedObject();
      return true;
    }

    if (key !== 'escape') return false;

    this.selectedObjectId.set(null);
    this.transformer?.nodes([]);
    this.selectionLayer?.batchDraw();
    this.activeTool.set('select');
    return true;
  }

  private handleZoomShortcuts(e: KeyboardEvent, key: string): void {
    if (!e.ctrlKey && !e.metaKey) return;

    if (key === '=' || key === '+') {
      e.preventDefault();
      this.onZoomIn();
      return;
    }

    if (key === '-') {
      e.preventDefault();
      this.onZoomOut();
      return;
    }

    if (key === '0') {
      e.preventDefault();
      this.onFitAll();
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.keyHandler);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('keydown', this.keyHandler);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Toolbar Actions (called from template)
  // ─────────────────────────────────────────────────────────────────────────

  protected onToolChange(tool: CanvasTool): void {
    this.activeTool.set(tool);
    // Adjust stage draggable based on tool
    if (this.stage) {
      this.stage.draggable(tool === 'select' || tool === 'pan');
    }
  }

  /** Open a color dialog for the currently-selected object. */
  protected onEditObjectColors(): void {
    const objId = this.selectedObjectId();
    if (!objId) return;
    this.canvasColor.openEditColorsDialog(objId);
  }

  protected async onAddImage(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    const result = await this.dialogGateway.openInsertImageDialog({
      username: project.username,
      slug: project.slug,
    });
    if (!result?.mediaId || !result?.imageBlob) return;

    const projectKey = `${project.username}/${project.slug}`;

    // Save blob to IndexedDB
    await this.localStorageService.saveMedia(
      projectKey,
      result.mediaId,
      result.imageBlob
    );

    // Pre-cache a blob URL so createImageNode can resolve it immediately
    // without waiting for another IndexedDB round-trip
    this.localStorageService.preCacheMediaUrl(
      projectKey,
      result.mediaId,
      result.imageBlob
    );

    // Get image dimensions from the blob
    const blobUrl = URL.createObjectURL(result.imageBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const center = this.getViewportCenter();
      const layerId = this.ensureActiveLayer();
      if (!layerId) {
        return;
      }
      const imageObj: CanvasImage = {
        id: nanoid(),
        layerId,
        type: 'image',
        x: center.x - img.naturalWidth / 2,
        y: center.y - img.naturalHeight / 2,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        src: createMediaUrl(result.mediaId),
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: result.mediaId,
      };
      this.canvasService.addObject(imageObj);
    };
    img.onerror = () => URL.revokeObjectURL(blobUrl);
    img.src = blobUrl;
  }

  protected onShapeTypeChange(shapeType: CanvasShapeType): void {
    this.toolSettings.update(s => ({ ...s, shapeType }));
    this.activeTool.set('shape');
  }

  protected onZoomIn(): void {
    const z = this.canvasZoom.zoomIn();
    if (z !== null) this.zoomLevel.set(z);
  }

  protected onZoomOut(): void {
    const z = this.canvasZoom.zoomOut();
    if (z !== null) this.zoomLevel.set(z);
  }

  protected onFitAll(): void {
    const z = this.canvasZoom.fitAll();
    if (z !== null) this.zoomLevel.set(z);
  }

  private zoomToPoint(point: { x: number; y: number }, factor: number): void {
    const z = this.canvasZoom.zoomToPoint(point, factor);
    if (z !== null) this.zoomLevel.set(z);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar Actions (called from template)
  // ─────────────────────────────────────────────────────────────────────────

  protected toggleSidebar(): void {
    this.sidebarOpen.update(v => {
      const next = !v;
      this.writeLocalStorage('canvasSidebarOpen', String(next));
      return next;
    });
    setTimeout(() => {
      if (!this.stage) return;
      const container = this.canvasContainer()?.nativeElement;
      if (container) {
        this.stage.width(container.clientWidth);
        this.stage.height(container.clientHeight);
      }
    }, SIDEBAR_RESIZE_DELAY_MS);
  }

  // ── Layer actions ──────────────────────────────────────────────────────

  protected onAddLayer(): void {
    const layerId = this.canvasLayer.addLayer();
    if (layerId) {
      this.activeLayerId.set(layerId);
    }
  }

  protected onSelectLayer(layerId: string): void {
    this.activeLayerId.set(layerId);
  }

  protected onToggleLayerVisibility(layerId: string, event: Event): void {
    event.stopPropagation();
    this.canvasLayer.toggleVisibility(layerId);
  }

  protected onToggleLayerLock(layerId: string, event: Event): void {
    event.stopPropagation();
    this.canvasLayer.toggleLock(layerId);
  }

  protected async onRenameLayer(layerId: string): Promise<void> {
    await this.canvasLayer.renameLayer(layerId);
  }

  protected onDuplicateLayer(layerId: string): void {
    this.canvasLayer.duplicateLayer(layerId);
  }

  protected async onDeleteLayer(layerId: string): Promise<void> {
    const deleted = await this.canvasLayer.deleteLayer(layerId);
    if (deleted) {
      // Switch to first remaining layer
      const remaining = this.sortedLayers();
      if (remaining.length > 0 && remaining[0].id !== layerId) {
        this.activeLayerId.set(remaining[0].id);
      } else if (remaining.length > 1) {
        this.activeLayerId.set(remaining[1].id);
      }
    }
  }

  // ── Object actions ─────────────────────────────────────────────────────

  protected onSelectObject(objectId: string): void {
    this.selectedObjectId.set(objectId);

    // Find and select the Konva node
    const node = this.konvaNodes.get(objectId);
    if (node) {
      this.selectKonvaNode(node);
    }
  }

  protected onDeleteObject(objectId: string, event: Event): void {
    event.stopPropagation();
    // Clean up relationship if this is a linked pin
    const obj = this.canvasService
      .activeConfig()
      ?.objects.find(o => o.id === objectId);
    if (obj?.type === 'pin')
      removePinRelationship(this.relationshipService, obj);
    this.canvasService.removeObject(objectId);
    if (this.selectedObjectId() === objectId) {
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
      this.selectionLayer?.batchDraw();
    }
  }

  private deleteSelectedObject(): void {
    const id = this.selectedObjectId();
    if (id) {
      // Clean up relationship if this is a linked pin
      const obj = this.canvasService
        .activeConfig()
        ?.objects.find(o => o.id === id);
      if (obj?.type === 'pin')
        removePinRelationship(this.relationshipService, obj);
      this.canvasService.removeObject(id);
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
      this.selectionLayer?.batchDraw();
    }
  }

  /** Get icon for an object type */
  protected readonly getObjectIcon = getObjectIcon;

  /** Get a display label for an unnamed object */
  protected readonly getObjectLabel = getObjectLabel;

  // ─────────────────────────────────────────────────────────────────────────
  // Context Menu & Clipboard
  // ─────────────────────────────────────────────────────────────────────────

  /** Open the right-click context menu at the cursor position */
  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Position the hidden trigger at the mouse location
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };

    // Record canvas-space position for paste
    this.contextMenuCanvasPos = this.getCanvasPointerPosition();

    this.selectObjectAtPointer();

    // Open the menu on the next tick so Angular picks up position changes
    setTimeout(() => {
      this.contextMenuTrigger()?.openMenu();
    });
  }

  private selectObjectAtPointer(): void {
    if (!this.stage) return;

    const pos = this.stage.getPointerPosition();
    if (!pos) return;

    const shape = this.stage.getIntersection(pos);
    if (!shape) return;

    const target = this.getTopLayerNode(shape);
    const objId = target.id();
    if (objId && this.konvaNodes.has(objId)) {
      this.onSelectObject(objId);
    }
  }

  private getTopLayerNode(shape: Konva.Node): Konva.Node {
    let target: Konva.Node = shape;
    while (target.parent && !(target.parent instanceof Konva.Layer)) {
      target = target.parent;
    }
    return target;
  }

  /** Copy the selected object to the clipboard */
  protected onCopy(): void {
    const config = this.canvasService.activeConfig();
    const id = this.selectedObjectId();
    if (!config || !id) return;

    const obj = config.objects.find(o => o.id === id);
    if (obj) {
      // Strip relationship ownership so copies don't share IDs
      const copy =
        obj.type === 'pin' ? { ...obj, relationshipId: undefined } : { ...obj };
      this.clipboard.set(copy);
      this.clipboardIsCut = false;
    }
  }

  /** Cut the selected object (copy + remove) */
  protected onCut(): void {
    const config = this.canvasService.activeConfig();
    const id = this.selectedObjectId();
    if (!config || !id) return;

    const obj = config.objects.find(o => o.id === id);
    if (obj) {
      // Clean up relationship if cutting a linked pin
      if (obj.type === 'pin')
        removePinRelationship(this.relationshipService, obj);
      // Strip stale relationship ID from clipboard
      const copy =
        obj.type === 'pin' ? { ...obj, relationshipId: undefined } : { ...obj };
      this.clipboard.set(copy);
      this.clipboardIsCut = true;
      this.canvasService.removeObject(id);
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
      this.selectionLayer?.batchDraw();
    }
  }

  /** Paste from clipboard at the context menu position (or viewport center) */
  protected onPaste(): void {
    const source = this.clipboard();
    if (!source) return;

    const layerId = this.ensureActiveLayer();
    if (!layerId) return;

    // Determine paste position
    const pastePos = this.contextMenuCanvasPos ?? this.getViewportCenter();

    const PASTE_OFFSET = 20;
    const newObj: CanvasObject = {
      ...source,
      id: nanoid(),
      layerId,
      x: pastePos.x + PASTE_OFFSET,
      y: pastePos.y + PASTE_OFFSET,
    };

    // Create a fresh relationship for pasted linked pins
    if (newObj.type === 'pin' && newObj.linkedElementId) {
      newObj.relationshipId = createPinRelationship(
        this.relationshipService,
        this.elementId(),
        newObj.linkedElementId
      );
    }

    this.canvasService.addObject(newObj);

    // If it was a cut, clear the clipboard so it can only be pasted once
    if (this.clipboardIsCut) {
      this.clipboard.set(null);
      this.clipboardIsCut = false;
    }

    // Select the newly pasted object
    this.selectedObjectId.set(newObj.id);
    this.contextMenuCanvasPos = null;
  }

  /** Duplicate the selected object with a small offset */
  protected onDuplicateObject(): void {
    const config = this.canvasService.activeConfig();
    const id = this.selectedObjectId();
    if (!config || !id) return;

    const obj = config.objects.find(o => o.id === id);
    if (!obj) return;

    const OFFSET = 20;
    const duplicate: CanvasObject = {
      ...obj,
      id: nanoid(),
      x: obj.x + OFFSET,
      y: obj.y + OFFSET,
    };

    this.canvasService.addObject(duplicate);
    this.selectedObjectId.set(duplicate.id);
  }

  /** Delete from context menu (no event arg needed) */
  protected onContextDelete(): void {
    this.deleteSelectedObject();
  }

  /** Get the layer ID of the currently selected object */
  protected getSelectedObjectLayerId(): string {
    const config = this.canvasService.activeConfig();
    const id = this.selectedObjectId();
    if (!config || !id) return '';
    const obj = config.objects.find(o => o.id === id);
    return obj?.layerId ?? '';
  }

  /** Move the selected object to a different layer */
  protected onSendToLayer(targetLayerId: string): void {
    const id = this.selectedObjectId();
    if (!id) return;
    this.canvasService.moveObjectToLayer(id, targetLayerId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────

  protected exportAsPng(): void {
    if (!this.stage) return;
    const dataUrl = this.stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `${this.elementName()}.png`;
    link.href = dataUrl;
    link.click();
  }

  protected exportAsHighResPng(): void {
    if (!this.stage) return;
    const dataUrl = this.stage.toDataURL({ pixelRatio: 3 });
    const link = document.createElement('a');
    link.download = `${this.elementName()}-highres.png`;
    link.href = dataUrl;
    link.click();
  }

  protected exportAsSvg(): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;
    downloadSvg(config, this.elementName());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  private saveViewport(): void {
    if (!this.stage) return;
    const id = this.elementId();
    if (!id) return;
    this.canvasService.saveViewport(id, {
      x: this.stage.x(),
      y: this.stage.y(),
      zoom: this.stage.scaleX(),
    });
  }

  private destroyStage(): void {
    // Clean up any in-progress drawing
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingShape?.destroy();
    this.drawingShape = null;
    this.drawingStartPos = null;
    this.drawingPoints = [];

    this.canvasRenderer.destroyStage();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private readLocalStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeLocalStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota exceeded or unavailable */
    }
  }
}
