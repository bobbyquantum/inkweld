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
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, type MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { TabPresenceIndicatorComponent } from '@components/tab-presence-indicator/tab-presence-indicator.component';
import {
  type CanvasLayer,
  type CanvasObject,
  type CanvasShapeType,
  type CanvasText,
  type CanvasTool,
  type CanvasToolSettings,
  createDefaultToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasClipboardService } from '@services/canvas/canvas-clipboard.service';
import { CanvasColorService } from '@services/canvas/canvas-color.service';
import {
  CanvasDrawingService,
  type DrawingHandlers,
} from '@services/canvas/canvas-drawing.service';
import { CanvasKeyboardService } from '@services/canvas/canvas-keyboard.service';
import { CanvasLayerService } from '@services/canvas/canvas-layer.service';
import {
  CanvasPlacementService,
  type PlacementHandlers,
} from '@services/canvas/canvas-placement.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { CanvasZoomService } from '@services/canvas/canvas-zoom.service';
import { LoggerService } from '@services/core/logger.service';
import { PresenceService } from '@services/presence/presence.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import Konva from 'konva';

import { removePinRelationship } from './canvas-pin-helpers';
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
    CanvasClipboardService,
    CanvasKeyboardService,
    CanvasDrawingService,
    CanvasPlacementService,
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
  private readonly canvasClipboard = inject(CanvasClipboardService);
  private readonly canvasKeyboard = inject(CanvasKeyboardService);
  private readonly canvasDrawing = inject(CanvasDrawingService);
  private readonly canvasPlacement = inject(CanvasPlacementService);
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

  /** Clipboard for cut/copy/paste operations (proxied to CanvasClipboardService) */
  protected readonly clipboard = this.canvasClipboard.clipboard;

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
    _e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): void {
    const tool = this.activeTool();

    if (tool === 'select' || tool === 'pan' || tool === 'rectSelect') {
      this.clearCanvasSelection();
      return;
    }
    if (tool === 'pin') return this.placePin();
    if (tool === 'text') return this.placeText();
    if (tool === 'shape') this.placeDefaultShape();
  }

  private clearCanvasSelection(): void {
    this.selectedObjectId.set(null);
    this.transformer?.nodes([]);
    this.selectionLayer?.batchDraw();
  }

  private get drawingHandlers(): DrawingHandlers {
    return {
      ensureLayer: () => this.ensureActiveLayer(),
      pointer: () => this.getCanvasPointerPosition(),
      onRectSelect: rect => this.selectNodesInRect(rect),
      onClearSelection: () => this.clearCanvasSelection(),
    };
  }

  private handleDrawStart(
    _e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): void {
    const tool = this.activeTool();
    const consumed = this.canvasDrawing.start(
      tool,
      this.toolSettings(),
      this.drawingHandlers
    );
    if (consumed) this.stage?.draggable(false);
  }

  private handleDrawMove(): void {
    this.canvasDrawing.move(
      this.activeTool(),
      this.toolSettings(),
      this.drawingHandlers
    );
  }

  private handleDrawEnd(): void {
    const tool = this.activeTool();
    this.canvasDrawing.end(tool, this.toolSettings(), this.drawingHandlers);
    this.stage?.draggable(tool === 'select' || tool === 'pan');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Object Placement
  // ─────────────────────────────────────────────────────────────────────────

  private get placementHandlers(): PlacementHandlers {
    return {
      ensureLayer: () => this.ensureActiveLayer(),
      pointer: () => this.getCanvasPointerPosition(),
      viewportCenter: () => this.getViewportCenter(),
      elementId: () => this.elementId(),
    };
  }

  private placePin(): void {
    this.canvasPlacement.placePin(this.placementHandlers);
  }

  private placeText(): void {
    this.canvasPlacement.placeText(this.placementHandlers, this.toolSettings());
  }

  private placeDefaultShape(): void {
    this.canvasPlacement.placeDefaultShape(
      this.placementHandlers,
      this.toolSettings()
    );
  }

  /** Open a dialog to edit an existing text node's content and color. */
  private openTextEditDialog(obj: CanvasText, textNode: Konva.Text): void {
    this.canvasPlacement.openTextEditDialog(obj, textNode);
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

  private setupKeyboardShortcuts(): void {
    this.canvasKeyboard.attach({
      onCopy: () => this.onCopy(),
      onCut: () => this.onCut(),
      onPaste: () => {
        this.contextMenuCanvasPos = null;
        this.onPaste();
      },
      onDuplicate: () => this.onDuplicateObject(),
      onDelete: () => this.deleteSelectedObject(),
      onEscape: () => {
        this.selectedObjectId.set(null);
        this.transformer?.nodes([]);
        this.selectionLayer?.batchDraw();
        this.activeTool.set('select');
      },
      onToolChange: tool => this.onToolChange(tool),
      onZoomIn: () => this.onZoomIn(),
      onZoomOut: () => this.onZoomOut(),
      onFitAll: () => this.onFitAll(),
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

  protected onAddImage(): Promise<void> {
    return this.canvasPlacement.addImage(this.placementHandlers);
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
    const id = this.selectedObjectId();
    if (id) this.canvasClipboard.copy(id);
  }

  /** Cut the selected object (copy + remove) */
  protected onCut(): void {
    const id = this.selectedObjectId();
    if (!id) return;
    if (this.canvasClipboard.cutObject(id)) {
      this.selectedObjectId.set(null);
      this.transformer?.nodes([]);
      this.selectionLayer?.batchDraw();
    }
  }

  /** Paste from clipboard at the context menu position (or viewport center) */
  protected onPaste(): void {
    if (!this.clipboard()) return;
    const layerId = this.ensureActiveLayer();
    if (!layerId) return;
    const pos = this.contextMenuCanvasPos ?? this.getViewportCenter();
    const newId = this.canvasClipboard.paste(layerId, pos, this.elementId());
    if (newId) this.selectedObjectId.set(newId);
    this.contextMenuCanvasPos = null;
  }

  /** Duplicate the selected object with a small offset */
  protected onDuplicateObject(): void {
    const id = this.selectedObjectId();
    if (!id) return;
    const newId = this.canvasClipboard.duplicate(id);
    if (newId) this.selectedObjectId.set(newId);
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
