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
  CanvasContextMenuService,
  type ContextMenuCallbacks,
} from '@services/canvas/canvas-context-menu.service';
import {
  CanvasDrawingService,
  type DrawingHandlers,
} from '@services/canvas/canvas-drawing.service';
import { CanvasExportService } from '@services/canvas/canvas-export.service';
import { CanvasKeyboardService } from '@services/canvas/canvas-keyboard.service';
import { CanvasLayerService } from '@services/canvas/canvas-layer.service';
import {
  CanvasLayerActionsService,
  type LayerActionsCallbacks,
} from '@services/canvas/canvas-layer-actions.service';
import {
  CanvasPlacementService,
  type PlacementHandlers,
} from '@services/canvas/canvas-placement.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { CanvasSelectionService } from '@services/canvas/canvas-selection.service';
import { CanvasStageEventsService } from '@services/canvas/canvas-stage-events.service';
import { CanvasZoomService } from '@services/canvas/canvas-zoom.service';
import { PresenceService } from '@services/presence/presence.service';
import { ProjectStateService } from '@services/project/project-state.service';
import type Konva from 'konva';

import { getObjectIcon, getObjectLabel } from './canvas-utils';

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
    CanvasLayerActionsService,
    CanvasZoomService,
    CanvasColorService,
    CanvasClipboardService,
    CanvasContextMenuService,
    CanvasKeyboardService,
    CanvasDrawingService,
    CanvasExportService,
    CanvasPlacementService,
    CanvasSelectionService,
    CanvasStageEventsService,
  ],
})
export class CanvasTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly canvasService = inject(CanvasService);
  private readonly canvasRenderer = inject(CanvasRendererService);
  private readonly canvasLayerActions = inject(CanvasLayerActionsService);
  private readonly canvasZoom = inject(CanvasZoomService);
  private readonly canvasColor = inject(CanvasColorService);
  private readonly canvasClipboard = inject(CanvasClipboardService);
  private readonly canvasContextMenu = inject(CanvasContextMenuService);
  private readonly canvasKeyboard = inject(CanvasKeyboardService);
  private readonly canvasDrawing = inject(CanvasDrawingService);
  private readonly canvasExport = inject(CanvasExportService);
  private readonly canvasPlacement = inject(CanvasPlacementService);
  private readonly canvasSelection = inject(CanvasSelectionService);
  private readonly canvasStageEvents = inject(CanvasStageEventsService);
  private readonly destroyRef = inject(DestroyRef);
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

  /** Clipboard for cut/copy/paste operations (proxied to context menu service) */
  protected readonly clipboard = this.canvasContextMenu.clipboard;

  /** Position (in page pixels) where the context menu should appear */
  protected get contextMenuPosition(): { x: number; y: number } {
    return this.canvasContextMenu.position();
  }

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
  private get konvaNodes(): Map<string, Konva.Node> {
    return this.canvasRenderer.konvaNodes;
  }

  /** Guard to ensure keyboard shortcuts are only registered once per component lifetime */
  private keyboardShortcutsInitialized = false;

  /** Handlers injected into CanvasRendererService for Konva node events */
  private readonly nodeHandlers = {
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
        this.canvasRenderer.destroyStage();

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
    this.canvasRenderer.destroyStage();
    // Stop broadcasting our presence on this canvas.
    this.presence.setActiveLocation(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Konva Initialization
  // ─────────────────────────────────────────────────────────────────────────

  private initStage(): void {
    const container = this.canvasContainer()?.nativeElement;
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

    const stage = this.stage;
    if (!stage) return;

    this.canvasStageEvents.attach(stage, {
      onZoomChange: scale => this.zoomLevel.set(scale),
      onStageClick: e => this.handleStageClick(e),
      onDrawStart: e => this.handleDrawStart(e),
      onDrawMove: () => this.handleDrawMove(),
      onDrawEnd: () => this.handleDrawEnd(),
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
    this.canvasSelection.clearSelection();
  }

  private get drawingHandlers(): DrawingHandlers {
    return {
      ensureLayer: () => this.ensureActiveLayer(),
      pointer: () => this.canvasRenderer.getCanvasPointerPosition(),
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
      pointer: () => this.canvasRenderer.getCanvasPointerPosition(),
      viewportCenter: () => this.canvasRenderer.getViewportCenter(),
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

  // ─────────────────────────────────────────────────────────────────────────
  // Selection
  // ─────────────────────────────────────────────────────────────────────────

  private selectKonvaNode(node: Konva.Node): void {
    this.canvasSelection.selectNode(node);
  }

  /** Select all Konva nodes whose bounding box intersects the given rect. */
  private selectNodesInRect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    this.canvasSelection.selectNodesInRect(rect, {
      onSingleSelected: id => this.selectedObjectId.set(id),
      onCleared: () => this.selectedObjectId.set(null),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard Shortcuts
  // ─────────────────────────────────────────────────────────────────────────

  private setupKeyboardShortcuts(): void {
    this.canvasKeyboard.attach({
      onCopy: () => this.onCopy(),
      onCut: () => this.onCut(),
      onPaste: () => {
        this.canvasContextMenu.clearCanvasPos();
        this.onPaste();
      },
      onDuplicate: () => this.onDuplicateObject(),
      onDelete: () => this.deleteSelectedObject(),
      onEscape: () => {
        this.selectedObjectId.set(null);
        this.canvasSelection.clearSelection();
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

  protected onZoomReset(): void {
    const z = this.canvasZoom.resetZoom();
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

  private get layerActionsCallbacks(): LayerActionsCallbacks {
    return {
      getActiveLayerId: () => this.activeLayerId(),
      setActiveLayerId: id => this.activeLayerId.set(id),
      getSortedLayers: () => this.sortedLayers(),
    };
  }

  protected onAddLayer(): void {
    this.canvasLayerActions.add(this.layerActionsCallbacks);
  }

  protected onSelectLayer(layerId: string): void {
    this.activeLayerId.set(layerId);
  }

  protected onToggleLayerVisibility(layerId: string, event: Event): void {
    this.canvasLayerActions.toggleVisibility(layerId, event);
  }

  protected onToggleLayerLock(layerId: string, event: Event): void {
    this.canvasLayerActions.toggleLock(layerId, event);
  }

  protected onRenameLayer(layerId: string): Promise<void> {
    return this.canvasLayerActions.rename(layerId);
  }

  protected onDuplicateLayer(layerId: string): void {
    this.canvasLayerActions.duplicate(layerId);
  }

  protected onDeleteLayer(layerId: string): Promise<void> {
    return this.canvasLayerActions.delete(layerId, this.layerActionsCallbacks);
  }

  protected onMoveLayerUp(layerId: string): void {
    this.canvasLayerActions.moveUp(layerId, this.layerActionsCallbacks);
  }

  protected onMoveLayerDown(layerId: string): void {
    this.canvasLayerActions.moveDown(layerId, this.layerActionsCallbacks);
  }

  protected onLayerOpacityChange(
    layerId: string,
    value: number | string
  ): void {
    const num = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(num)) return;
    this.canvasLayerActions.setOpacity(layerId, num);
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
    this.canvasSelection.deleteObject(objectId);
    if (this.selectedObjectId() === objectId) {
      this.selectedObjectId.set(null);
      this.canvasSelection.clearSelection();
    }
  }

  private deleteSelectedObject(): void {
    const id = this.selectedObjectId();
    if (!id) return;
    this.canvasSelection.deleteObject(id);
    this.selectedObjectId.set(null);
    this.canvasSelection.clearSelection();
  }

  /** Get icon for an object type */
  protected readonly getObjectIcon = getObjectIcon;

  /** Get a display label for an unnamed object */
  protected readonly getObjectLabel = getObjectLabel;

  // ─────────────────────────────────────────────────────────────────────────
  // Context Menu & Clipboard
  // ─────────────────────────────────────────────────────────────────────────

  /** Build the callback bag the context menu service needs. */
  private get menuCallbacks(): ContextMenuCallbacks {
    return {
      getSelectedObjectId: () => this.selectedObjectId(),
      setSelectedObjectId: id => this.selectedObjectId.set(id),
      ensureActiveLayer: () => this.ensureActiveLayer(),
      getViewportCenter: () => this.canvasRenderer.getViewportCenter(),
      getCanvasPointerPosition: () =>
        this.canvasRenderer.getCanvasPointerPosition(),
      getElementId: () => this.elementId(),
    };
  }

  /** Open the right-click context menu at the cursor position */
  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.canvasContextMenu.openAt(
      event.clientX,
      event.clientY,
      this.canvasRenderer.getCanvasPointerPosition()
    );
    this.canvasSelection.selectObjectAtPointer({
      onSelect: id => this.onSelectObject(id),
    });
    setTimeout(() => this.contextMenuTrigger()?.openMenu());
  }

  /** Copy the selected object to the clipboard */
  protected onCopy(): void {
    this.canvasContextMenu.copy(this.menuCallbacks);
  }

  /** Cut the selected object (copy + remove) */
  protected onCut(): void {
    this.canvasContextMenu.cut(this.menuCallbacks);
  }

  /** Paste from clipboard at the context menu position (or viewport center) */
  protected onPaste(): void {
    this.canvasContextMenu.paste(this.menuCallbacks);
  }

  /** Duplicate the selected object with a small offset */
  protected onDuplicateObject(): void {
    this.canvasContextMenu.duplicate(this.menuCallbacks);
  }

  /** Delete from context menu (no event arg needed) */
  protected onContextDelete(): void {
    this.deleteSelectedObject();
  }

  /** Get the layer ID of the currently selected object */
  protected getSelectedObjectLayerId(): string {
    return this.canvasContextMenu.getSelectedObjectLayerId(this.menuCallbacks);
  }

  /** Move the selected object to a different layer */
  protected onSendToLayer(targetLayerId: string): void {
    this.canvasContextMenu.sendToLayer(targetLayerId, this.menuCallbacks);
  }

  /** Reorder the selected object within its layer's z-order */
  protected onReorderObject(
    direction: 'front' | 'back' | 'forward' | 'backward'
  ): void {
    const id = this.selectedObjectId();
    if (!id) return;
    this.canvasService.reorderObject(id, direction);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────

  protected exportAsPng(): void {
    this.canvasExport.exportAsPng(this.elementName());
  }

  protected exportAsHighResPng(): void {
    this.canvasExport.exportAsHighResPng(this.elementName());
  }

  protected exportAsSvg(): void {
    this.canvasExport.exportAsSvg(this.elementName());
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
