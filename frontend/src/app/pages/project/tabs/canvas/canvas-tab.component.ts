import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostBinding,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import {
  createMediaUrl,
  extractMediaId,
  isMediaUrl,
} from '@components/image-paste/image-paste-plugin';
import {
  CanvasColorDialogComponent,
  CanvasColorDialogData,
} from '@dialogs/canvas-color-dialog/canvas-color-dialog.component';
import {
  CanvasPinDialogComponent,
  CanvasPinDialogData,
  CanvasPinDialogResult,
} from '@dialogs/canvas-pin-dialog/canvas-pin-dialog.component';
import {
  CanvasTextDialogComponent,
  CanvasTextDialogData,
  CanvasTextDialogResult,
} from '@dialogs/canvas-text-dialog/canvas-text-dialog.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import {
  RenameDialogComponent,
  RenameDialogData,
} from '@dialogs/rename-dialog/rename-dialog.component';
import {
  CanvasImage,
  CanvasLayer,
  CanvasObject,
  CanvasPath,
  CanvasPin,
  CanvasShape,
  CanvasShapeType,
  CanvasText,
  CanvasTool,
  CanvasToolSettings,
  createDefaultToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import Konva from 'konva';
import { nanoid } from 'nanoid';
import { firstValueFrom, Observable } from 'rxjs';

/** Delay (ms) after sidebar toggle before telling Konva to resize */
const SIDEBAR_RESIZE_DELAY_MS = 250;

/** Min/max zoom levels */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;

/** Zoom step multiplier for wheel events */
const ZOOM_STEP = 1.1;

@Component({
  selector: 'app-canvas-tab',
  templateUrl: './canvas-tab.component.html',
  styleUrls: ['./canvas-tab.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  providers: [
    // Each canvas tab gets its own service instance so config never bleeds
    // between multiple open canvases.
    CanvasService,
  ],
})
export class CanvasTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly canvasService = inject(CanvasService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

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

  private stage: Konva.Stage | null = null;
  /** Map from CanvasLayer.id → Konva.Layer */
  private konvaLayers = new Map<string, Konva.Layer>();
  /** Map from CanvasObject.id → Konva.Node */
  private konvaNodes = new Map<string, Konva.Node>();
  /** Konva Transformer for selection handles */
  private transformer: Konva.Transformer | null = null;
  /** Top-level layer for the transformer and selection */
  private selectionLayer: Konva.Layer | null = null;

  /** Whether config has been loaded from element metadata */
  private configLoadedFromMetadata = false;

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

  /** ResizeObserver for canvas container */
  private resizeObserver: ResizeObserver | null = null;

  /** Guard to ensure keyboard shortcuts are only registered once per component lifetime */
  private keyboardShortcutsInitialized = false;

  constructor() {
    // Re-load canvas config when elements become available (handles cold-start)
    effect(() => {
      const elements = this.projectState.elements();
      const id = this.elementId();
      if (!id || elements.length === 0 || this.configLoadedFromMetadata) return;

      const element = elements.find(e => e.id === id);
      if (!element) return;

      this.elementName.set(element.name);

      if (element.metadata?.['canvasConfig']) {
        this.canvasService.loadConfig(id);
        this.configLoadedFromMetadata = true;
      }
    });

    // Re-render Konva when config changes
    effect(() => {
      const config = this.canvasService.activeConfig();
      const container = this.canvasContainer();
      if (config && container) {
        this.syncKonvaFromConfig(config.layers, config.objects);
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
        this.configLoadedFromMetadata = false;

        // Destroy previous Konva stage
        this.destroyStage();

        // Find element name
        const element = this.projectState.elements().find(e => e.id === tabId);
        if (element) {
          this.elementName.set(element.name);
        }

        // Load canvas config
        const config = this.canvasService.loadConfig(tabId);

        // Set active layer to the first layer
        if (config.layers.length > 0) {
          this.activeLayerId.set(config.layers[0].id);
        }

        if (element?.metadata?.['canvasConfig']) {
          this.configLoadedFromMetadata = true;
        }

        // Initialize Konva stage after a tick so the DOM is ready
        setTimeout(() => this.initStage(), 0);
      });
  }

  ngOnDestroy(): void {
    this.saveViewport();
    this.destroyStage();
    this.resizeObserver?.disconnect();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Konva Initialization
  // ─────────────────────────────────────────────────────────────────────────

  private initStage(): void {
    const container = this.canvasContainer()?.nativeElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.stage = new Konva.Stage({
      container,
      width,
      height,
      draggable: true, // pan by dragging the stage
    });

    // Selection layer (always on top)
    this.selectionLayer = new Konva.Layer();
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: [
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
        'middle-left',
        'middle-right',
        'top-center',
        'bottom-center',
      ],
    });
    this.selectionLayer.add(this.transformer);

    // Create Konva layers from config
    const config = this.canvasService.activeConfig();
    if (config) {
      this.buildKonvaLayers(config.layers);
      this.buildKonvaObjects(config.objects);
    }

    // Add selection layer last (on top)
    this.stage.add(this.selectionLayer);

    // Restore saved viewport
    const savedViewport = this.canvasService.loadViewport(this.elementId());
    if (savedViewport) {
      this.stage.position({ x: savedViewport.x, y: savedViewport.y });
      this.stage.scale({
        x: savedViewport.zoom,
        y: savedViewport.zoom,
      });
      this.zoomLevel.set(savedViewport.zoom);
    }

    // ── Event Handlers ─────────────────────────────────────────────────

    // Wheel zoom
    this.stage.on('wheel', e => {
      e.evt.preventDefault();
      const oldScale = this.stage!.scaleX();
      const pointer = this.stage!.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(
        Math.max(
          direction > 0 ? oldScale * ZOOM_STEP : oldScale / ZOOM_STEP,
          MIN_ZOOM
        ),
        MAX_ZOOM
      );

      const mousePointTo = {
        x: (pointer.x - this.stage!.x()) / oldScale,
        y: (pointer.y - this.stage!.y()) / oldScale,
      };

      this.stage!.scale({ x: newScale, y: newScale });
      this.stage!.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
      this.zoomLevel.set(newScale);
    });

    // Click on empty space → deselect
    this.stage.on('click tap', e => {
      if (e.target === this.stage) {
        this.handleStageClick(
          e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
        );
      }
    });

    // Mouse events for drawing tools
    this.stage.on('mousedown touchstart', e => {
      if (e.target !== this.stage) return;
      this.handleDrawStart(
        e as Konva.KonvaEventObject<MouseEvent | TouchEvent>
      );
    });

    this.stage.on('mousemove touchmove', () => {
      this.handleDrawMove();
    });

    this.stage.on('mouseup touchend', () => {
      this.handleDrawEnd();
    });

    // Keyboard shortcuts (register only once per component lifetime)
    if (!this.keyboardShortcutsInitialized) {
      this.setupKeyboardShortcuts();
      this.keyboardShortcutsInitialized = true;
    }

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.stage) return;
      this.stage.width(container.clientWidth);
      this.stage.height(container.clientHeight);
    });
    this.resizeObserver.observe(container);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Konva Layer/Object Sync
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build Konva layers from config layers.
   * Layers are added to the stage in order.
   */
  private buildKonvaLayers(layers: CanvasLayer[]): void {
    if (!this.stage) return;

    const sorted = [...layers].sort((a, b) => a.order - b.order);
    for (const layerDef of sorted) {
      const kLayer = new Konva.Layer({
        id: layerDef.id,
        visible: layerDef.visible,
        opacity: layerDef.opacity,
        listening: !layerDef.locked,
      });
      this.konvaLayers.set(layerDef.id, kLayer);
      this.stage.add(kLayer);
    }
  }

  /**
   * Build Konva nodes from config objects and add to their layers.
   */
  private buildKonvaObjects(objects: CanvasObject[]): void {
    for (const obj of objects) {
      const kLayer = this.konvaLayers.get(obj.layerId);
      if (!kLayer) continue;

      const node = this.createKonvaNode(obj);
      if (node) {
        this.konvaNodes.set(obj.id, node);
        kLayer.add(node as Konva.Group | Konva.Shape);
      }
    }
    // Redraw all layers
    for (const kLayer of this.konvaLayers.values()) {
      kLayer.batchDraw();
    }
  }

  /**
   * Called by the config-watching effect.
   * Diffs the config against existing Konva nodes and applies changes.
   * For simplicity in v1, we do a full rebuild when layers or object count changes,
   * and just update positions/properties for simple changes.
   */
  private syncKonvaFromConfig(
    layers: CanvasLayer[],
    objects: CanvasObject[]
  ): void {
    if (!this.stage) return;

    // Sync layer visibility/opacity/lock without full rebuild
    for (const layerDef of layers) {
      const kLayer = this.konvaLayers.get(layerDef.id);
      if (kLayer) {
        kLayer.visible(layerDef.visible);
        kLayer.opacity(layerDef.opacity);
        kLayer.listening(!layerDef.locked);
      }
    }

    // Check if we need a full rebuild (layer added/removed or object count changed)
    const configLayerIds = new Set(layers.map(l => l.id));
    const existingLayerIds = new Set(this.konvaLayers.keys());
    const configObjectIds = new Set(objects.map(o => o.id));
    const existingObjectIds = new Set(this.konvaNodes.keys());

    const layersChanged =
      configLayerIds.size !== existingLayerIds.size ||
      [...configLayerIds].some(id => !existingLayerIds.has(id));
    const objectsChanged =
      configObjectIds.size !== existingObjectIds.size ||
      [...configObjectIds].some(id => !existingObjectIds.has(id));

    if (layersChanged || objectsChanged) {
      this.rebuildAllKonvaNodes(layers, objects);
    } else {
      // Just sync positions/transforms
      for (const obj of objects) {
        const node = this.konvaNodes.get(obj.id);
        if (node) {
          node.position({ x: obj.x, y: obj.y });
          node.rotation(obj.rotation);
          node.scale({ x: obj.scaleX, y: obj.scaleY });
          node.visible(obj.visible);
        }
      }
    }

    // Re-add selection layer as the topmost layer
    this.selectionLayer?.moveToTop();
  }

  /**
   * Full rebuild: destroy all Konva layers/nodes and recreate from config.
   */
  private rebuildAllKonvaNodes(
    layers: CanvasLayer[],
    objects: CanvasObject[]
  ): void {
    // Remove all existing layers (but keep the selection layer)
    for (const kLayer of this.konvaLayers.values()) {
      kLayer.destroy();
    }
    this.konvaLayers.clear();
    this.konvaNodes.clear();

    // Recreate
    this.buildKonvaLayers(layers);
    this.buildKonvaObjects(objects);
  }

  /**
   * Create a Konva node from a CanvasObject definition.
   */
  private createKonvaNode(obj: CanvasObject): Konva.Node | null {
    const commonAttrs: Konva.NodeConfig = {
      id: obj.id,
      x: obj.x,
      y: obj.y,
      rotation: obj.rotation,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      visible: obj.visible,
      draggable: !obj.locked,
    };

    let node: Konva.Node | null = null;

    switch (obj.type) {
      case 'image':
        node = this.createImageNode(obj, commonAttrs);
        break;
      case 'text':
        node = this.createTextNode(obj, commonAttrs);
        break;
      case 'path':
        node = this.createPathNode(obj, commonAttrs);
        break;
      case 'shape':
        node = this.createShapeNode(obj, commonAttrs);
        break;
      case 'pin':
        node = this.createPinNode(obj, commonAttrs);
        break;
    }

    if (node) {
      // Click to select
      node.on('click tap', () => {
        this.onSelectObject(obj.id);
        this.selectKonvaNode(node);
      });

      // Drag end → save position
      node.on('dragend', () => {
        const pos = node.position();
        this.canvasService.updateObject(obj.id, {
          x: pos.x,
          y: pos.y,
        });
      });

      // Transform end → save scale/rotation
      node.on('transformend', () => {
        this.canvasService.updateObject(obj.id, {
          x: node.x(),
          y: node.y(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          rotation: node.rotation(),
        });
      });
    }

    return node;
  }

  private createImageNode(
    obj: CanvasImage,
    attrs: Konva.NodeConfig
  ): Konva.Node {
    // Create a placeholder rect first; load image async
    const group = new Konva.Group({
      ...attrs,
    });

    const placeholder = new Konva.Rect({
      width: obj.width,
      height: obj.height,
      fill: '#e0e0e0',
      stroke: '#bdbdbd',
      strokeWidth: 1,
    });
    group.add(placeholder);

    // Resolve the image source (media: URLs → blob URLs from IndexedDB)
    void this.resolveImageSrc(obj.src).then(
      resolvedSrc => {
        const imageObj = new Image();
        if (resolvedSrc.startsWith('http')) {
          imageObj.crossOrigin = 'anonymous';
        }
        imageObj.onload = () => {
          const kImage = new Konva.Image({
            image: imageObj,
            width: obj.width,
            height: obj.height,
          });
          placeholder.destroy();
          group.add(kImage);
          group.getLayer()?.batchDraw();
        };
        imageObj.onerror = () => {
          this.logger.warn(
            '[Canvas]',
            `Failed to load image: ${obj.id} src=${obj.src} resolved=${resolvedSrc}`
          );
          placeholder.fill('#ffcdd2');
          group.getLayer()?.batchDraw();
        };
        imageObj.src = resolvedSrc;
      },
      err => {
        this.logger.warn(
          '[Canvas]',
          'Failed to resolve image src:',
          obj.src,
          err
        );
        placeholder.fill('#ffcdd2');
        group.getLayer()?.batchDraw();
      }
    );

    return group;
  }

  private createTextNode(obj: CanvasText, attrs: Konva.NodeConfig): Konva.Text {
    const textNode = new Konva.Text({
      ...attrs,
      text: obj.text,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontStyle: obj.fontStyle,
      fill: obj.fill,
      width: obj.width || undefined,
      align: obj.align,
    });

    // Double-click to edit text content
    textNode.on('dblclick dbltap', () => {
      this.openTextEditDialog(obj, textNode);
    });

    return textNode;
  }

  private createPathNode(obj: CanvasPath, attrs: Konva.NodeConfig): Konva.Line {
    return new Konva.Line({
      ...attrs,
      points: obj.points,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      closed: obj.closed,
      fill: obj.closed ? obj.fill : undefined,
      tension: obj.tension,
      lineCap: 'round',
      lineJoin: 'round',
    });
  }

  private createShapeNode(
    obj: CanvasShape,
    attrs: Konva.NodeConfig
  ): Konva.Node {
    switch (obj.shapeType) {
      case 'rect':
        return new Konva.Rect({
          ...attrs,
          width: obj.width,
          height: obj.height,
          fill: obj.fill,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          cornerRadius: obj.cornerRadius,
          dash: obj.dash,
        });
      case 'ellipse':
        return new Konva.Ellipse({
          ...attrs,
          radiusX: obj.width / 2,
          radiusY: obj.height / 2,
          fill: obj.fill,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          dash: obj.dash,
        });
      case 'line':
      case 'arrow':
        return new Konva.Arrow({
          ...attrs,
          points: obj.points || [0, 0, obj.width, 0],
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          fill: obj.stroke,
          dash: obj.dash,
          pointerLength: obj.shapeType === 'arrow' ? 10 : 0,
          pointerWidth: obj.shapeType === 'arrow' ? 10 : 0,
        });
      case 'polygon':
        return new Konva.Line({
          ...attrs,
          points: obj.points || [],
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          fill: obj.fill,
          closed: true,
          dash: obj.dash,
        });
      default:
        return new Konva.Rect({
          ...attrs,
          width: obj.width,
          height: obj.height,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
        });
    }
  }

  private createPinNode(obj: CanvasPin, attrs: Konva.NodeConfig): Konva.Group {
    const group = new Konva.Group({
      ...attrs,
    });

    // Pin marker (circle with border)
    const pinSize = 24;
    const marker = new Konva.Circle({
      radius: pinSize / 2,
      fill: obj.color,
      stroke: '#fff',
      strokeWidth: 2,
      shadowColor: '#000',
      shadowBlur: 4,
      shadowOpacity: 0.3,
      shadowOffset: { x: 0, y: 2 },
    });
    group.add(marker);

    // Pin label
    const label = new Konva.Text({
      text: obj.label,
      fontSize: 12,
      fontFamily: 'Arial',
      fill: '#333',
      y: pinSize / 2 + 4,
      align: 'center',
    });
    // Center label under pin
    label.x(-label.width() / 2);
    group.add(label);

    // Double-click to edit pin label
    group.on('dblclick dbltap', () => {
      this.openPinEditDialog(obj, label, marker, group);
    });

    return group;
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
      return;
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
    } else if (tool === 'line') {
      this.drawingStartPos = pos;
      this.drawingLine = new Konva.Line({
        stroke: settings.stroke,
        strokeWidth: settings.strokeWidth,
        points: [pos.x, pos.y, pos.x, pos.y],
        lineCap: 'round',
      });
      kLayer.add(this.drawingLine);
    } else if (tool === 'shape') {
      this.drawingStartPos = pos;
      const shapeType = settings.shapeType;

      if (shapeType === 'arrow' || shapeType === 'line') {
        // Arrow/line shapes drawn as Konva.Arrow
        this.drawingLine = new Konva.Arrow({
          stroke: settings.stroke,
          strokeWidth: settings.strokeWidth,
          points: [pos.x, pos.y, pos.x, pos.y],
          fill: settings.stroke,
          pointerLength: shapeType === 'arrow' ? 10 : 0,
          pointerWidth: shapeType === 'arrow' ? 10 : 0,
        }) as unknown as Konva.Line;
        kLayer.add(this.drawingLine as unknown as Konva.Arrow);
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
        // Rect (default)
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

    // ── Rectangle selection ─────────────────────────────────────────────
    if (this.rectSelectRect && this.rectSelectStart) {
      const selRect = {
        x: this.rectSelectRect.x(),
        y: this.rectSelectRect.y(),
        width: this.rectSelectRect.width(),
        height: this.rectSelectRect.height(),
      };
      this.rectSelectRect.destroy();
      this.rectSelectRect = null;
      this.rectSelectStart = null;

      if (selRect.width > 2 || selRect.height > 2) {
        this.selectNodesInRect(selRect);
      } else {
        // Tiny marquee = deselect
        this.selectedObjectId.set(null);
        this.transformer?.nodes([]);
      }
      this.selectionLayer?.batchDraw();
      restoreDraggable();
      return;
    }

    // ── Freehand drawing ────────────────────────────────────────────────
    if (this.drawingLine && tool === 'draw') {
      if (this.drawingPoints.length >= 4) {
        const layerId = this.ensureActiveLayer();
        if (!layerId) {
          this.drawingLine?.destroy();
          this.drawingLine = null;
          restoreDraggable();
          return;
        }
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
        this.drawingLine.destroy();
        this.drawingLine = null;
        this.drawingPoints = [];
        this.canvasService.addObject(pathObj);
      } else {
        this.drawingLine.destroy();
        this.drawingLine = null;
        this.drawingPoints = [];
      }
      restoreDraggable();
      return;
    }

    // ── Line tool ───────────────────────────────────────────────────────
    if (this.drawingLine && tool === 'line') {
      const points = this.drawingLine.points();
      const dx = (points[2] ?? 0) - (points[0] ?? 0);
      const dy = (points[3] ?? 0) - (points[1] ?? 0);
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 5) {
        const layerId = this.ensureActiveLayer();
        if (!layerId) {
          this.drawingLine?.destroy();
          this.drawingLine = null;
          this.drawingStartPos = null;
          restoreDraggable();
          return;
        }
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
        this.drawingLine.destroy();
        this.drawingLine = null;
        this.drawingStartPos = null;
        this.canvasService.addObject(pathObj);
      } else {
        this.drawingLine.destroy();
        this.drawingLine = null;
        this.drawingStartPos = null;
      }
      restoreDraggable();
      return;
    }

    // ── Shape tool: arrow/line variant (uses drawingLine) ───────────────
    if (this.drawingLine && tool === 'shape') {
      const points = this.drawingLine.points();
      const dx = (points[2] ?? 0) - (points[0] ?? 0);
      const dy = (points[3] ?? 0) - (points[1] ?? 0);
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 5) {
        const layerId = this.ensureActiveLayer();
        if (!layerId) {
          this.drawingLine?.destroy();
          this.drawingLine = null;
          this.drawingStartPos = null;
          restoreDraggable();
          return;
        }
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
        this.drawingLine.destroy();
        this.drawingLine = null;
        this.drawingStartPos = null;
        this.canvasService.addObject(shapeObj);
      } else {
        this.drawingLine.destroy();
        this.drawingLine = null;
        this.drawingStartPos = null;
      }
      restoreDraggable();
      return;
    }

    // ── Shape tool: rect/ellipse variant (uses drawingShape) ────────────
    if (this.drawingShape && tool === 'shape') {
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
        if (!layerId) {
          this.drawingShape?.destroy();
          this.drawingShape = null;
          this.drawingStartPos = null;
          restoreDraggable();
          return;
        }
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
        this.drawingShape.destroy();
        this.drawingShape = null;
        this.drawingStartPos = null;
        this.canvasService.addObject(shapeObj);
      } else {
        this.drawingShape.destroy();
        this.drawingShape = null;
        this.drawingStartPos = null;
      }
      restoreDraggable();
      return;
    }

    restoreDraggable();
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
        const pin = this.canvasService.createPin(
          layerId,
          pos.x,
          pos.y,
          result.label,
          result.color
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
        } as Partial<CanvasText>);
      });
  }

  /** Open a dialog to edit an existing pin's label and color. */
  private openPinEditDialog(
    obj: CanvasPin,
    label: Konva.Text,
    marker: Konva.Circle,
    group: Konva.Group
  ): void {
    const data: CanvasPinDialogData = {
      title: 'Edit Pin',
      label: obj.label,
      color: obj.color,
      confirmLabel: 'Save',
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
        group.getLayer()?.batchDraw();
        this.canvasService.updateObject(obj.id, {
          label: result.label,
          color: result.color,
          name: result.label,
        } as Partial<CanvasPin>);
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
        if (this.rectsIntersect(rect, box)) {
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

  /** Check if two axis-aligned bounding boxes overlap. */
  private rectsIntersect(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard Shortcuts
  // ─────────────────────────────────────────────────────────────────────────

  private keyHandler = (e: KeyboardEvent) => {
    // Don't handle shortcuts when typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'c':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.onCopy();
        }
        break;
      case 'x':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.onCut();
        }
        break;
      case 'v':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.contextMenuCanvasPos = null; // paste at viewport center
          this.onPaste();
        } else {
          this.onToolChange('select');
        }
        break;
      case 'r':
        this.onToolChange('rectSelect');
        break;
      case 'h':
        this.onToolChange('pan');
        break;
      case 'p':
        this.onToolChange('pin');
        break;
      case 'd':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.onDuplicateObject();
        } else {
          this.onToolChange('draw');
        }
        break;
      case 'l':
        this.onToolChange('line');
        break;
      case 's':
        // Only change tool if no modifier keys
        if (!e.ctrlKey && !e.metaKey) {
          this.onToolChange('shape');
        }
        break;
      case 't':
        this.onToolChange('text');
        break;
      case 'delete':
      case 'backspace':
        e.preventDefault();
        this.deleteSelectedObject();
        break;
      case 'escape':
        this.selectedObjectId.set(null);
        this.transformer?.nodes([]);
        this.selectionLayer?.batchDraw();
        this.activeTool.set('select');
        break;
      case '=':
      case '+':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.onZoomIn();
        }
        break;
      case '-':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.onZoomOut();
        }
        break;
      case '0':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.onFitAll();
        }
        break;
    }
  };

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

    const config = this.canvasService.activeConfig();
    if (!config) return;

    const obj = config.objects.find(o => o.id === objId);
    if (!obj) return;

    // Determine which color properties are relevant
    let showFill = false;
    let showStroke = false;
    let fill: string | undefined;
    let stroke: string | undefined;
    const objType = obj.type;

    if (objType === 'text') {
      showFill = true;
      fill = obj.fill;
    } else if (objType === 'path') {
      showStroke = true;
      stroke = obj.stroke;
      if (obj.closed) {
        showFill = true;
        fill = obj.fill;
      }
    } else if (objType === 'shape') {
      showFill = true;
      showStroke = true;
      fill = obj.fill;
      stroke = obj.stroke;
    } else if (objType === 'pin') {
      showFill = true;
      fill = obj.color;
    } else {
      return; // images have no user-editable color
    }

    const data: CanvasColorDialogData = {
      title: 'Edit Colors',
      showFill,
      showStroke,
      fill,
      stroke,
    };

    const dialogRef = this.dialog.open(CanvasColorDialogComponent, {
      data,
      width: '420px',
    });

    dialogRef
      .afterClosed()
      .subscribe((result: { fill?: string; stroke?: string } | undefined) => {
        if (!result) return;

        // Build update payload per object type
        const updates: Record<string, unknown> = {};

        if (objType === 'pin') {
          if (result.fill) updates['color'] = result.fill;
        } else {
          if (result.fill !== undefined) updates['fill'] = result.fill;
          if (result.stroke !== undefined) updates['stroke'] = result.stroke;
        }

        this.canvasService.updateObject(
          objId,
          updates as Partial<CanvasObject>
        );

        // Also update the Konva node visually
        this.updateKonvaNodeColors(objId, objType, result);
      });
  }

  /** Apply color changes to the live Konva node. */
  private updateKonvaNodeColors(
    objId: string,
    type: string,
    result: { fill?: string; stroke?: string }
  ): void {
    let node: Konva.Node | undefined;

    for (const [, kLayer] of this.konvaLayers) {
      const found = kLayer.findOne(`#${objId}`);
      if (found) {
        node = found;
        break;
      }
    }
    if (!node) return;

    if (type === 'pin' && node instanceof Konva.Group) {
      const marker = node.findOne('Circle');
      if (marker && result.fill) {
        (marker as Konva.Circle).fill(result.fill);
      }
    } else if (type === 'text' && node instanceof Konva.Text) {
      if (result.fill) node.fill(result.fill);
    } else if (type === 'path' && node instanceof Konva.Line) {
      if (result.stroke) node.stroke(result.stroke);
      if (result.fill) node.fill(result.fill);
    } else if (type === 'shape') {
      if (result.fill && 'fill' in node) {
        (node as Konva.Shape).fill(result.fill);
      }
      if (result.stroke && 'stroke' in node) {
        (node as Konva.Shape).stroke(result.stroke);
      }
    }

    node.getLayer()?.batchDraw();
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
    if (!this.stage) return;
    const center = {
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    };
    this.zoomToPoint(center, ZOOM_STEP);
  }

  protected onZoomOut(): void {
    if (!this.stage) return;
    const center = {
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    };
    this.zoomToPoint(center, 1 / ZOOM_STEP);
  }

  protected onFitAll(): void {
    if (!this.stage) return;

    // Find bounding box of all content
    const config = this.canvasService.activeConfig();
    if (!config || config.objects.length === 0) {
      this.stage.position({ x: 0, y: 0 });
      this.stage.scale({ x: 1, y: 1 });
      this.zoomLevel.set(1);
      return;
    }

    // Get bounds of all visible layers' nodes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const kLayer of this.konvaLayers.values()) {
      if (!kLayer.visible()) continue;
      const rect = kLayer.getClientRect({ skipTransform: true });
      if (rect.width === 0 && rect.height === 0) continue;
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    if (!isFinite(minX)) return;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 40;

    const scaleX =
      (this.stage.width() - padding * 2) / Math.max(contentWidth, 1);
    const scaleY =
      (this.stage.height() - padding * 2) / Math.max(contentHeight, 1);
    const scale = Math.min(scaleX, scaleY, MAX_ZOOM);

    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x:
        -minX * scale +
        padding +
        (this.stage.width() - padding * 2 - contentWidth * scale) / 2,
      y:
        -minY * scale +
        padding +
        (this.stage.height() - padding * 2 - contentHeight * scale) / 2,
    });
    this.zoomLevel.set(scale);
  }

  private zoomToPoint(point: { x: number; y: number }, factor: number): void {
    if (!this.stage) return;
    const oldScale = this.stage.scaleX();
    const newScale = Math.min(Math.max(oldScale * factor, MIN_ZOOM), MAX_ZOOM);

    const mousePointTo = {
      x: (point.x - this.stage.x()) / oldScale,
      y: (point.y - this.stage.y()) / oldScale,
    };

    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position({
      x: point.x - mousePointTo.x * newScale,
      y: point.y - mousePointTo.y * newScale,
    });
    this.zoomLevel.set(newScale);
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
    const layerId = this.canvasService.addLayer();
    if (layerId) {
      this.activeLayerId.set(layerId);
    }
  }

  protected onSelectLayer(layerId: string): void {
    this.activeLayerId.set(layerId);
  }

  protected onToggleLayerVisibility(layerId: string, event: Event): void {
    event.stopPropagation();
    const config = this.canvasService.activeConfig();
    const layer = config?.layers.find(l => l.id === layerId);
    if (layer) {
      this.canvasService.updateLayer(layerId, { visible: !layer.visible });
    }
  }

  protected onToggleLayerLock(layerId: string, event: Event): void {
    event.stopPropagation();
    const config = this.canvasService.activeConfig();
    const layer = config?.layers.find(l => l.id === layerId);
    if (layer) {
      this.canvasService.updateLayer(layerId, { locked: !layer.locked });
    }
  }

  protected async onRenameLayer(layerId: string): Promise<void> {
    const config = this.canvasService.activeConfig();
    const layer = config?.layers.find(l => l.id === layerId);
    if (!layer) return;

    const data: RenameDialogData = {
      currentName: layer.name,
      title: 'Rename Layer',
    };
    const newName = await firstValueFrom(
      this.dialog
        .open(RenameDialogComponent, {
          data,
          width: '400px',
          disableClose: true,
        })
        .afterClosed() as Observable<string | undefined>
    );
    if (newName && typeof newName === 'string' && newName.trim()) {
      this.canvasService.updateLayer(layerId, { name: newName.trim() });
    }
  }

  protected onDuplicateLayer(layerId: string): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;

    const layer = config.layers.find(l => l.id === layerId);
    if (!layer) return;

    const newLayerId = this.canvasService.addLayer(`${layer.name} (copy)`);
    if (!newLayerId) return;

    // Copy all objects from the source layer to the new layer
    const objectsToCopy = config.objects.filter(o => o.layerId === layerId);
    for (const obj of objectsToCopy) {
      const copy: CanvasObject = {
        ...obj,
        id: nanoid(),
        layerId: newLayerId,
      } as CanvasObject;
      this.canvasService.addObject(copy);
    }
  }

  protected async onDeleteLayer(layerId: string): Promise<void> {
    const data: ConfirmationDialogData = {
      title: 'Delete Layer',
      message: 'Delete this layer and all its objects? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    };
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, { data, disableClose: true })
        .afterClosed() as Observable<boolean | undefined>
    );
    if (confirmed) {
      this.canvasService.removeLayer(layerId);
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
      this.canvasService.removeObject(id);
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
      this.selectionLayer?.batchDraw();
    }
  }

  /** Get icon for an object type */
  protected getObjectIcon(obj: CanvasObject): string {
    switch (obj.type) {
      case 'image':
        return 'image';
      case 'text':
        return 'title';
      case 'path':
        return 'draw';
      case 'shape':
        return 'crop_square';
      case 'pin':
        return 'place';
      default:
        return 'category';
    }
  }

  /** Get a display label for an unnamed object */
  protected getObjectLabel(obj: CanvasObject): string {
    switch (obj.type) {
      case 'image':
        return 'Image';
      case 'text':
        return obj.text.substring(0, 30) || 'Text';
      case 'path':
        return `Path (${Math.floor(obj.points.length / 2)} pts)`;
      case 'shape':
        return obj.shapeType;
      case 'pin':
        return obj.label;
      default:
        return 'Object';
    }
  }

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

    // If right-clicking a Konva node, select it first
    if (this.stage) {
      const pos = this.stage.getPointerPosition();
      if (pos) {
        const shape = this.stage.getIntersection(pos);
        if (shape) {
          // Walk up to the top-level group/shape within a Konva layer
          let target: Konva.Node = shape;
          while (target.parent && !(target.parent instanceof Konva.Layer)) {
            target = target.parent;
          }
          const objId = target.id();
          if (objId && this.konvaNodes.has(objId)) {
            this.onSelectObject(objId);
          }
        }
      }
    }

    // Open the menu on the next tick so Angular picks up position changes
    setTimeout(() => {
      this.contextMenuTrigger()?.openMenu();
    });
  }

  /** Copy the selected object to the clipboard */
  protected onCopy(): void {
    const config = this.canvasService.activeConfig();
    const id = this.selectedObjectId();
    if (!config || !id) return;

    const obj = config.objects.find(o => o.id === id);
    if (obj) {
      this.clipboard.set({ ...obj });
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
      this.clipboard.set({ ...obj });
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
    } as CanvasObject;

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
    } as CanvasObject;

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

    const visibleLayers = [...config.layers]
      .sort((a, b) => a.order - b.order)
      .filter(l => l.visible);

    // Compute bounding box across all visible objects
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const layer of visibleLayers) {
      for (const obj of config.objects.filter(
        o => o.layerId === layer.id && o.visible
      )) {
        if (obj.type === 'path') {
          // Paths store absolute canvas coordinates in points (x=0, y=0 for paths)
          const pts = obj.points;
          for (let i = 0; i < pts.length - 1; i += 2) {
            minX = Math.min(minX, obj.x + (pts[i] ?? 0));
            minY = Math.min(minY, obj.y + (pts[i + 1] ?? 0));
            maxX = Math.max(maxX, obj.x + (pts[i] ?? 0));
            maxY = Math.max(maxY, obj.y + (pts[i + 1] ?? 0));
          }
        } else if (
          obj.type === 'shape' &&
          (obj.shapeType === 'line' || obj.shapeType === 'arrow') &&
          obj.points?.length
        ) {
          // Line/arrow: x,y = start; points are local coords [0, 0, dx, dy]
          const pts = obj.points;
          for (let i = 0; i < pts.length - 1; i += 2) {
            const px = obj.x + (pts[i] ?? 0) * (obj.scaleX || 1);
            const py = obj.y + (pts[i + 1] ?? 0) * (obj.scaleY || 1);
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
        } else {
          const w = ('width' in obj ? obj.width : 30) * (obj.scaleX || 1);
          const h = ('height' in obj ? obj.height : 30) * (obj.scaleY || 1);
          minX = Math.min(minX, obj.x);
          minY = Math.min(minY, obj.y);
          maxX = Math.max(maxX, obj.x + w);
          maxY = Math.max(maxY, obj.y + h);
        }
      }
    }

    const PAD = 20;
    const vX = (isFinite(minX) ? minX : 0) - PAD;
    const vY = (isFinite(minY) ? minY : 0) - PAD;
    const vW = (isFinite(maxX) && maxX > minX ? maxX - minX : 800) + PAD * 2;
    const vH = (isFinite(maxY) && maxY > minY ? maxY - minY : 600) + PAD * 2;

    const lines: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `  width="${vW}" height="${vH}" viewBox="${vX} ${vY} ${vW} ${vH}">`,
    ];

    for (const layer of visibleLayers) {
      const objs = config.objects.filter(
        o => o.layerId === layer.id && o.visible
      );
      if (!objs.length) continue;
      lines.push(
        `  <g id="${this.svgEsc(layer.id)}" opacity="${layer.opacity}">`
      );
      for (const obj of objs) {
        lines.push('    ' + this.canvasObjectToSvgElement(obj));
      }
      lines.push('  </g>');
    }

    lines.push('</svg>');
    const blob = new Blob([lines.join('\n')], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.elementName()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private svgEsc(s: string): string {
    return s.replace(
      /[&<>"']/g,
      c =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c] ?? c
    );
  }

  private canvasObjectToSvgElement(obj: CanvasObject): string {
    const transforms: string[] = [`translate(${obj.x},${obj.y})`];
    if (obj.rotation) transforms.push(`rotate(${obj.rotation})`);
    if (obj.scaleX !== 1 || obj.scaleY !== 1)
      transforms.push(`scale(${obj.scaleX},${obj.scaleY})`);
    const tf = `transform="${transforms.join(' ')}"`;

    switch (obj.type) {
      case 'shape':
        return this.canvasShapeToSvg(obj, tf);
      case 'text':
        return this.canvasTextToSvg(obj, tf);
      case 'path':
        return this.canvasPathToSvg(obj, tf);
      case 'image':
        return this.canvasImageToSvg(obj, tf);
      case 'pin':
        return this.canvasPinToSvg(obj, tf);
      default:
        return '';
    }
  }

  private canvasShapeToSvg(obj: CanvasShape, tf: string): string {
    const fill = obj.fill ?? 'none';
    const base = `fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"`;
    const dash = obj.dash?.length
      ? ` stroke-dasharray="${obj.dash.join(',')}"`
      : '';

    switch (obj.shapeType) {
      case 'rect': {
        const cr = obj.cornerRadius ? ` rx="${obj.cornerRadius}"` : '';
        return `<rect ${tf} width="${obj.width}" height="${obj.height}" ${base}${dash}${cr}/>`;
      }
      case 'ellipse': {
        const rx = obj.width / 2;
        const ry = obj.height / 2;
        return `<ellipse ${tf} cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" ${base}${dash}/>`;
      }
      case 'line': {
        const pts: number[] = obj.points ?? [0, 0, obj.width, 0];
        return `<line ${tf} x1="${pts[0]}" y1="${pts[1]}" x2="${pts[2]}" y2="${pts[3]}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${dash}/>`;
      }
      case 'arrow': {
        const pts: number[] = obj.points ?? [0, 0, obj.width, 0];
        const mid = `arrow-${Math.random().toString(36).slice(2)}`;
        const marker = `<defs><marker id="${mid}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${obj.stroke}"/></marker></defs>`;
        const line = `<line ${tf} x1="${pts[0]}" y1="${pts[1]}" x2="${pts[2]}" y2="${pts[3]}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" marker-end="url(#${mid})"${dash}/>`;
        return marker + line;
      }
      case 'polygon': {
        const pts: number[] = obj.points ?? [];
        const ptStr: string[] = [];
        for (let i = 0; i < pts.length; i += 2)
          ptStr.push(`${pts[i]},${pts[i + 1]}`);
        return `<polygon ${tf} points="${ptStr.join(' ')}" ${base}${dash}/>`;
      }
      default:
        return '';
    }
  }

  private canvasTextToSvg(obj: CanvasText, tf: string): string {
    const bold = obj.fontStyle.includes('bold') ? 'bold' : 'normal';
    const italic = obj.fontStyle.includes('italic') ? 'italic' : 'normal';
    const anchor =
      obj.align === 'center'
        ? 'middle'
        : obj.align === 'right'
          ? 'end'
          : 'start';
    const style = `font-size:${obj.fontSize}px;font-family:${obj.fontFamily};font-weight:${bold};font-style:${italic}`;
    return `<text ${tf} fill="${obj.fill}" style="${style}" text-anchor="${anchor}" dominant-baseline="text-before-edge">${this.svgEsc(obj.text)}</text>`;
  }

  private canvasPathToSvg(obj: CanvasPath, tf: string): string {
    const pts = obj.points;
    if (pts.length < 4) return '';
    const d: string[] = [`M ${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2) d.push(`L ${pts[i]},${pts[i + 1]}`);
    if (obj.closed) d.push('Z');
    const fill = obj.closed && obj.fill ? obj.fill : 'none';
    return `<path ${tf} d="${d.join(' ')}" fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"/>`;
  }

  private canvasImageToSvg(obj: CanvasImage, tf: string): string {
    if (obj.src.startsWith('media:')) {
      // Media assets can't be embedded in SVG — render a placeholder
      return `<rect ${tf} width="${obj.width}" height="${obj.height}" fill="#ccc" stroke="#999" stroke-width="1"/>`;
    }
    return `<image ${tf} href="${obj.src}" width="${obj.width}" height="${obj.height}"/>`;
  }

  private canvasPinToSvg(obj: CanvasPin, tf: string): string {
    const label = obj.label
      ? `<text y="24" text-anchor="middle" font-size="12" fill="${obj.color}">${this.svgEsc(obj.label)}</text>`
      : '';
    return `<g ${tf}><circle r="12" fill="${obj.color}" stroke="#fff" stroke-width="2"/>${label}</g>`;
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
    // Disconnect ResizeObserver before tearing down the stage
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    // Clean up any in-progress drawing
    this.drawingLine?.destroy();
    this.drawingLine = null;
    this.drawingShape?.destroy();
    this.drawingShape = null;
    this.drawingStartPos = null;
    this.drawingPoints = [];

    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
    this.konvaLayers.clear();
    this.konvaNodes.clear();
    this.transformer = null;
    this.selectionLayer = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Media URL Resolution
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolve an image src to a loadable URL.
   * - `media:{mediaId}` → look up blob in IndexedDB → blob URL
   * - `data:` / `http(s):` / `blob:` → return as-is
   */
  private async resolveImageSrc(src: string): Promise<string> {
    if (!isMediaUrl(src)) return src;

    const mediaId = extractMediaId(src);
    if (!mediaId) return src;

    const project = this.projectState.project();
    if (!project) {
      this.logger.warn(
        '[Canvas]',
        'Cannot resolve media URL — no project loaded'
      );
      return '';
    }

    const projectKey = `${project.username}/${project.slug}`;
    const url = await this.localStorageService.getMediaUrl(projectKey, mediaId);
    if (!url) {
      this.logger.warn(
        '[Canvas]',
        `Media not found in IndexedDB: ${mediaId} (project: ${projectKey})`
      );
      return '';
    }
    return url;
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
