import {
  type AfterViewInit,
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
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, type MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';
import { DocumentBreadcrumbsComponent } from '@components/document-breadcrumbs/document-breadcrumbs.component';
import { TabPresenceIndicatorComponent } from '@components/tab-presence-indicator/tab-presence-indicator.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  type CanvasFrame,
  type CanvasFrameKind,
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasPin,
  type CanvasShapeType,
  type CanvasText,
  type CanvasTool,
  type CanvasToolSettings,
  capturesStageInput,
  createFrame,
  FRAME_PRESETS,
  type FramePresetKey,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  STROKE_WIDTH_PRESETS,
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
  type DrawInput,
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
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { PresenceService } from '@services/presence/presence.service';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ProjectService } from '@services/project/project.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  computeOverflowGroups,
  horizontalPadding,
  measuredWidth,
  sameOverflow,
} from '@utils/toolbar-overflow';
import type Konva from 'konva';
import { firstValueFrom } from 'rxjs';

import type {
  CanvasFrameDialogData,
  CanvasFrameDialogResult,
} from '../../../../dialogs/canvas-frame-dialog/canvas-frame-dialog.component';
import { getObjectIcon, getObjectLabel } from './canvas-utils';

/** Delay (ms) after sidebar toggle before telling Konva to resize */
const SIDEBAR_RESIZE_DELAY_MS = 250;

/**
 * Toolbar groups, highest priority first: the last entry is the first to move
 * into the overflow menu. Zoom and history go first because both have keyboard
 * equivalents; the tools themselves are what the toolbar is for, so they stay
 * on the row longest.
 */
const TOOLBAR_GROUP_PRIORITY = [
  'navigation',
  'drawing',
  'style',
  'creation',
  'history',
  'zoom',
] as const;

export type CanvasToolbarGroup = (typeof TOOLBAR_GROUP_PRIORITY)[number];

/** Matches the `gap` on `.canvas-toolbar`. */
const TOOLBAR_GAP_PX = 4;

/** Space kept for the mode toggle, overflow chevron and presence indicator. */
const TOOLBAR_RESERVED_PX = 132;

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
    TranslocoModule,
    TabPresenceIndicatorComponent,
    DocumentBreadcrumbsComponent,
    ColorSwatchesComponent,
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
export class CanvasTabComponent implements AfterViewInit, OnInit, OnDestroy {
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
  private readonly elementNavigation = inject(ElementNavigationService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly projectService = inject(ProjectService);

  /** Stable presence location for this canvas tab. */
  protected readonly presenceLocation = computed(() => {
    const id = this.elementId();
    return id ? { kind: 'canvas' as const, elementId: id } : null;
  });

  /** Mirror our presence into the project's presence channel whenever the route changes. */
  private readonly presenceLocationEffect = effect(() => {
    this.presence.setActiveLocation(this.presenceLocation());
  });

  /** Reference to the canvas container <div> */
  private readonly canvasContainer =
    viewChild<ElementRef<HTMLDivElement>>('canvasContainer');

  /** Ring that previews the brush/eraser size under the cursor */
  private readonly brushCursor =
    viewChild<ElementRef<HTMLDivElement>>('brushCursor');

  /** The toolbar row, measured to decide what has to overflow */
  private readonly toolbarEl =
    viewChild<ElementRef<HTMLElement>>('canvasToolbar');

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

  /** Tool settings (stroke, fill, font, etc.), restored from localStorage */
  protected readonly toolSettings = signal<CanvasToolSettings>(
    this.canvasService.loadToolSettings()
  );

  /** Whether space is held for temporary panning */
  private readonly spacePanning = signal(false);

  /** Stroke width presets offered in the width menu */
  protected readonly strokeWidthPresets = STROKE_WIDTH_PRESETS;

  /** Groups that don't fit on the toolbar row and live under the chevron */
  private readonly overflowGroups = signal<ReadonlySet<CanvasToolbarGroup>>(
    new Set()
  );

  /** Whether anything has been pushed into the overflow menu */
  protected readonly hasOverflow = computed(
    () => this.overflowGroups().size > 0
  );

  /** Natural width of each group, remeasured whenever it is on the row */
  private readonly groupWidths = new Map<string, number>();

  private toolbarResizeObserver: ResizeObserver | null = null;

  /** Whether the last edit can be undone/redone */
  protected readonly canUndo = this.canvasService.canUndo;
  protected readonly canRedo = this.canvasService.canRedo;

  /** Identifies the current drag/transform gesture for undo coalescing */
  private gestureKey: string | null = null;
  private gestureCounter = 0;

  /**
   * Set when a drag committed an object. The browser fires a `click` straight
   * after such a drag, and a click places a default-sized shape — without this
   * one drag produced two shapes: the one drawn, plus a default one dropped
   * where the pointer was released.
   */
  private dragCommittedObject = false;

  /** Currently active layer ID */
  protected readonly activeLayerId = signal<string>('');

  /** Currently selected object ID */
  protected readonly selectedObjectId = signal<string | null>(null);

  /** Whether the sidebar panel is open */
  protected readonly sidebarOpen = signal(
    this.readLocalStorage('canvasSidebarOpen') !== 'false'
  );

  /**
   * View mode: pan/zoom only, no editing, and a single click on a linked pin
   * opens its element. Per-user UI state, remembered across sessions.
   */
  protected readonly viewMode = signal(
    this.readLocalStorage('canvasViewMode') === 'true'
  );

  /** Whether frame borders are drawn at all (local preference). */
  protected readonly framesVisible = signal(
    this.readLocalStorage('canvasFramesVisible') !== 'false'
  );

  /** Frames on the active canvas (canvas size + crop frames). */
  protected readonly frames = computed<CanvasFrame[]>(
    () => this.canvasService.activeConfig()?.frames ?? []
  );

  /** Whether a canvas-size frame already exists. */
  protected readonly hasCanvasSize = computed(() =>
    this.frames().some(f => f.kind === 'canvas')
  );

  /** Frame size presets for the add menu. */
  protected readonly framePresets = FRAME_PRESETS;

  /** Frame currently selected for on-canvas drag/resize editing. */
  protected readonly selectedFrameId = signal<string | null>(null);

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

  /** The currently selected image object, if the selection is an image. */
  protected readonly selectedImage = computed<CanvasImage | null>(() => {
    const id = this.selectedObjectId();
    const config = this.canvasService.activeConfig();
    if (!id || !config) return null;
    const obj = config.objects.find(o => o.id === id);
    return obj?.type === 'image' ? obj : null;
  });

  /** The currently selected pin object, if the selection is a pin. */
  protected readonly selectedPin = computed<CanvasPin | null>(() => {
    const id = this.selectedObjectId();
    const config = this.canvasService.activeConfig();
    if (!id || !config) return null;
    const obj = config.objects.find(o => o.id === id);
    return obj?.type === 'pin' ? obj : null;
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
    return this.spacePanning() ? 'tool-pan' : `tool-${this.activeTool()}`;
  }

  /** Whether the current tool draws with the brush ring cursor */
  protected readonly showBrushCursor = computed(
    () =>
      !this.spacePanning() &&
      (this.activeTool() === 'draw' || this.activeTool() === 'eraser')
  );

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
    onSelectKonvaNode: (node: Konva.Node) => {
      if (this.viewMode()) return;
      this.selectKonvaNode(node);
    },
    onGestureStart: () => this.beginGesture(),
    onDragEnd: (objId: string, x: number, y: number) =>
      this.canvasService.updateObject(
        objId,
        { x, y },
        { coalesceKey: this.gestureKey ?? undefined }
      ),
    onTransformEnd: (
      objId: string,
      x: number,
      y: number,
      scaleX: number,
      scaleY: number,
      rotation: number
    ) =>
      this.canvasService.updateObject(
        objId,
        {
          x,
          y,
          scaleX,
          scaleY,
          rotation,
        },
        { coalesceKey: this.gestureKey ?? undefined }
      ),
    onDblClickText: (obj: CanvasText, textNode: Konva.Text) => {
      if (this.viewMode()) return;
      this.openTextEditDialog(obj, textNode);
    },
    onDblClickPin: (obj: CanvasPin) => this.openPinLink(obj),
  };

  /**
   * Start a new drag/transform gesture. Every node touched by the same
   * gesture shares a key so a multi-object transform is one undo step, while
   * two separate drags stay separately undoable.
   */
  private beginGesture(): void {
    this.gestureKey = `gesture-${++this.gestureCounter}`;
  }

  constructor() {
    // Keep the tab title in sync with the underlying element's name.
    effect(() => {
      const elements = this.projectState.elements();
      const id = this.elementId();
      if (!id) return;
      const element = elements.find(e => e.id === id);
      if (element) this.elementName.set(element.name);
    });

    // The active layer can go stale: the canvas may load after the tab opened,
    // or a collaborator may delete the layer we were working on.
    effect(() => {
      const config = this.canvasService.activeConfig();
      if (!config || config.layers.length === 0) return;
      const current = this.activeLayerId();
      if (current && config.layers.some(l => l.id === current)) return;
      untracked(() => this.activeLayerId.set(this.sortedLayers()[0]?.id ?? ''));
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

    // Mirror frames into the overlay whenever they, the mode, the visibility
    // toggle, or the editing selection change.
    effect(() => {
      const config = this.canvasService.activeConfig();
      const viewMode = this.viewMode();
      const framesVisible = this.framesVisible();
      const selected = this.selectedFrameId();
      if (!config || !this.stage) return;

      this.canvasRenderer.syncFrames(config.frames, {
        viewMode,
        framesVisible,
      });

      // A frame can vanish under the selection (deleted here or remotely),
      // and view mode never edits frames.
      const valid =
        selected && !viewMode && config.frames?.some(f => f.id === selected)
          ? selected
          : null;
      if (valid !== selected) untracked(() => this.selectedFrameId.set(valid));
      this.canvasRenderer.setFrameEditing(valid, (frameId, rect) =>
        this.canvasService.updateFrame(frameId, rect)
      );
    });

    // Keep frame labels readable at every zoom level.
    effect(() => this.canvasRenderer.updateFrameOverlayScale(this.zoomLevel()));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    const toolbar = this.toolbarEl()?.nativeElement;
    if (!toolbar) return;

    this.toolbarResizeObserver = new ResizeObserver(() =>
      this.scheduleToolbarMeasure()
    );
    this.toolbarResizeObserver.observe(toolbar);
    this.scheduleToolbarMeasure();
  }

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
    this.toolbarResizeObserver?.disconnect();
    this.toolbarResizeObserver = null;
    this.saveViewport();
    // Push out any edit still sitting in the write throttle.
    this.canvasService.flush();
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

    // Apply the remembered mode before nodes are created, so their
    // draggability is right from the start.
    if (this.viewMode()) this.activeTool.set('pan');
    this.canvasRenderer.setInteractionLocked(this.viewMode());

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
      onDrawStart: input => this.handleDrawStart(input),
      onDrawMove: input => this.handleDrawMove(input),
      onDrawEnd: () => this.handleDrawEnd(),
      onDrawCancel: () => this.handleDrawCancel(),
      onPointerFrame: position => this.moveBrushCursor(position),
    });

    this.applyToolToStage(this.activeTool());

    // Initial frame borders (the frames effect only re-runs on changes).
    this.canvasRenderer.syncFrames(config.frames, {
      viewMode: this.viewMode(),
      framesVisible: this.framesVisible(),
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

    // This click is the tail of a drag that already drew something.
    if (this.dragCommittedObject) {
      this.dragCommittedObject = false;
      return;
    }

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
    this.selectedFrameId.set(null);
    this.canvasSelection.clearSelection();
    this.presence.setSelection(null);
  }

  private get drawingHandlers(): DrawingHandlers {
    return {
      ensureLayer: () => this.ensureActiveLayer(),
      pointer: () => this.canvasRenderer.getCanvasPointerPosition(),
      onRectSelect: rect => this.selectNodesInRect(rect),
      onClearSelection: () => this.clearCanvasSelection(),
    };
  }

  private handleDrawStart(input: DrawInput): void {
    if (this.spacePanning()) return;
    const tool = this.activeTool();
    const consumed = this.canvasDrawing.start(
      tool,
      this.toolSettings(),
      this.drawingHandlers,
      input
    );
    if (consumed) this.stage?.draggable(false);
  }

  private handleDrawMove(input: DrawInput): void {
    if (this.spacePanning()) return;
    this.canvasDrawing.move(
      this.activeTool(),
      this.toolSettings(),
      this.drawingHandlers,
      input
    );
  }

  private handleDrawEnd(): void {
    const tool = this.activeTool();
    this.dragCommittedObject = this.canvasDrawing.end(
      tool,
      this.toolSettings(),
      this.drawingHandlers
    );
    this.applyToolToStage(tool);
  }

  private handleDrawCancel(): void {
    this.dragCommittedObject = false;
    this.canvasDrawing.cancel();
    this.applyToolToStage(this.activeTool());
  }

  /** Position the brush ring, in container pixels, or hide it. */
  private moveBrushCursor(position: { x: number; y: number } | null): void {
    const el = this.brushCursor()?.nativeElement;
    if (!el) return;

    if (!position || !this.showBrushCursor()) {
      el.style.opacity = '0';
      return;
    }

    const settings = this.toolSettings();
    const size =
      (this.activeTool() === 'eraser'
        ? settings.eraserSize * 2
        : settings.strokeWidth) * this.zoomLevel();

    el.style.opacity = '1';
    el.style.width = `${Math.max(size, 4)}px`;
    el.style.height = `${Math.max(size, 4)}px`;
    el.style.transform = `translate(${position.x}px, ${position.y}px) translate(-50%, -50%)`;
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
    const id = node.id();
    const elementId = this.elementId();
    if (id && elementId) {
      this.presence.setSelection({
        kind: 'canvas',
        elementId,
        selectedIds: [id],
      });
    }
  }

  /** Select all Konva nodes whose bounding box intersects the given rect. */
  private selectNodesInRect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    this.canvasSelection.selectNodesInRect(rect, {
      onSingleSelected: id => {
        this.selectedObjectId.set(id);
        const elementId = this.elementId();
        if (elementId) {
          this.presence.setSelection({
            kind: 'canvas',
            elementId,
            selectedIds: [id],
          });
        }
      },
      onCleared: () => {
        this.selectedObjectId.set(null);
        this.presence.setSelection(null);
      },
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
        this.canvasDrawing.cancel();
        this.clearCanvasSelection();
        this.onToolChange('select');
      },
      onToolChange: tool => this.onToolChange(tool),
      onZoomIn: () => this.onZoomIn(),
      onZoomOut: () => this.onZoomOut(),
      onFitAll: () => this.onFitAll(),
      onUndo: () => this.onUndo(),
      onRedo: () => this.onRedo(),
      onAdjustStrokeWidth: direction => this.onAdjustStrokeWidth(direction),
      onSpacePanChange: active => this.setSpacePanning(active),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Toolbar Actions (called from template)
  // ─────────────────────────────────────────────────────────────────────────

  /** Whether `group` is currently in the overflow menu rather than the row. */
  protected isOverflowed(group: CanvasToolbarGroup): boolean {
    return this.overflowGroups().has(group);
  }

  /**
   * Re-measure the toolbar and decide what fits.
   *
   * Runs on a double animation frame so the browser has committed the layout
   * that results from the previous decision — measuring mid-change is what
   * makes this kind of toolbar oscillate.
   */
  private scheduleToolbarMeasure(): void {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.measureToolbar())
    );
  }

  private measureToolbar(): void {
    const container = this.toolbarEl()?.nativeElement;
    if (!container || container.offsetWidth === 0) return;

    // Refresh the cache for whatever is currently on the row; hidden groups
    // keep the width they had when they were last visible.
    for (const name of TOOLBAR_GROUP_PRIORITY) {
      const group = container.querySelector<HTMLElement>(
        `[data-toolbar-group="${name}"]`
      );
      if (!group) continue;
      const divider = container.querySelector<HTMLElement>(
        `[data-toolbar-divider="${name}"]`
      );
      const width = measuredWidth(group) + measuredWidth(divider);
      if (width > 0) this.groupWidths.set(name, width);
    }

    const available =
      container.offsetWidth -
      horizontalPadding(container) -
      TOOLBAR_RESERVED_PX;

    const next = computeOverflowGroups({
      availableWidth: available,
      gapPx: TOOLBAR_GAP_PX,
      priority: TOOLBAR_GROUP_PRIORITY,
      widths: this.groupWidths,
    }) as ReadonlySet<CanvasToolbarGroup>;

    // Only the decision is stored — no follow-up measurement. Re-measuring
    // after every change lets the row chase itself between two answers, which
    // shows up as a toolbar whose buttons never stop moving. If hiding a group
    // genuinely changes the toolbar's size, the ResizeObserver says so.
    if (!sameOverflow(this.overflowGroups(), next)) {
      this.overflowGroups.set(next);
    }
  }

  protected onToolChange(tool: CanvasTool): void {
    if (this.viewMode() && tool !== 'pan') return;
    if (this.canvasDrawing.isDrawing()) this.canvasDrawing.cancel();
    this.activeTool.set(tool);
    this.applyToolToStage(tool);
  }

  /** Switch between edit mode and pan/zoom-only view mode. */
  protected onToggleViewMode(): void {
    const entering = !this.viewMode();
    this.viewMode.set(entering);
    this.writeLocalStorage('canvasViewMode', String(entering));

    this.canvasDrawing.cancel();
    this.clearCanvasSelection();
    this.canvasRenderer.setInteractionLocked(entering);

    this.activeTool.set(entering ? 'pan' : 'select');
    this.applyToolToStage(this.activeTool());

    // Leaving view mode: restore each object's own draggable state.
    if (!entering) {
      const config = this.canvasService.activeConfig();
      if (config && this.stage) {
        this.canvasRenderer.syncKonvaFromConfig(
          config.layers,
          config.objects,
          null,
          this.nodeHandlers
        );
      }
    }
  }

  /** Open the element a pin is linked to, if it still exists. */
  private openPinLink(pin: CanvasPin): void {
    if (!pin.linkedElementId) return;
    const element = this.projectState
      .elements()
      .find(e => e.id === pin.linkedElementId);
    if (element) {
      this.elementNavigation.openElement(element);
      return;
    }
    this.snackBar.open(
      this.transloco.translate('canvas.pin.linkedElementMissing'),
      undefined,
      { duration: 3000 }
    );
  }

  /** Context menu: open the selected pin's linked element. */
  protected onOpenLinkedElement(): void {
    const pin = this.selectedPin();
    if (pin) this.openPinLink(pin);
  }

  /** Context menu: edit the selected pin's label, color and link. */
  protected onEditPin(): void {
    const pin = this.selectedPin();
    if (pin) this.canvasPlacement.openPinEditDialog(pin, this.elementId());
  }

  /**
   * Match the stage to the active tool: only the navigation tools drag the
   * stage, and creation tools take pointer events away from the objects so a
   * stroke can start on top of an image instead of selecting it.
   */
  private applyToolToStage(tool: CanvasTool): void {
    const panning = this.spacePanning();
    this.stage?.draggable(panning || tool === 'select' || tool === 'pan');
    // While space is held the canvas is in pure navigation mode: dragging must
    // pan, never pick up whatever object happens to be under the cursor.
    this.canvasRenderer.setContentInteractive(
      !panning && !capturesStageInput(tool)
    );
    if (!this.showBrushCursor()) this.moveBrushCursor(null);
  }

  /** Space held down: pan from any tool without losing the current one. */
  private setSpacePanning(active: boolean): void {
    if (this.spacePanning() === active) return;
    if (active && this.canvasDrawing.isDrawing()) return;
    this.spacePanning.set(active);
    this.applyToolToStage(this.activeTool());
  }

  /** Merge a change into the tool settings and remember it for next session. */
  protected updateToolSettings(patch: Partial<CanvasToolSettings>): void {
    const next = { ...this.toolSettings(), ...patch };
    this.toolSettings.set(next);
    this.canvasService.saveToolSettings(next);
  }

  /** Toolbar stroke swatch — also recolours the current selection. */
  protected onStrokeColorChange(stroke: string): void {
    this.updateToolSettings({ stroke });
    const selected = this.selectedObjectId();
    if (selected) this.canvasColor.applyColor(selected, { stroke });
  }

  /** Toolbar fill swatch — also recolours the current selection. */
  protected onFillColorChange(fill: string): void {
    this.updateToolSettings({ fill, fillEnabled: true });
    const selected = this.selectedObjectId();
    if (selected) this.canvasColor.applyColor(selected, { fill });
  }

  protected onStrokeWidthChange(value: number | string): void {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(parsed)) return;
    this.updateToolSettings({
      strokeWidth: Math.min(
        Math.max(parsed, MIN_STROKE_WIDTH),
        MAX_STROKE_WIDTH
      ),
    });
  }

  /** Step through the width presets with `[` and `]`. */
  protected onAdjustStrokeWidth(direction: 1 | -1): void {
    const current = this.toolSettings().strokeWidth;
    const presets = STROKE_WIDTH_PRESETS;
    const index = presets.findIndex(w => w >= current);
    const base = index === -1 ? presets.length - 1 : index;
    const next =
      presets[Math.min(Math.max(base + direction, 0), presets.length - 1)];
    this.onStrokeWidthChange(next);
  }

  protected onOpacityChange(value: number | string): void {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(parsed)) return;
    this.updateToolSettings({ opacity: Math.min(Math.max(parsed, 0.05), 1) });
  }

  protected onEraserSizeChange(value: number | string): void {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(parsed)) return;
    this.updateToolSettings({ eraserSize: parsed });
  }

  protected onToggleFill(): void {
    this.updateToolSettings({ fillEnabled: !this.toolSettings().fillEnabled });
  }

  protected onTogglePressure(): void {
    this.updateToolSettings({ pressure: !this.toolSettings().pressure });
  }

  protected onSmoothingChange(value: number | string): void {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(parsed)) return;
    this.updateToolSettings({ tension: Math.min(Math.max(parsed, 0), 1) });
  }

  protected onUndo(): void {
    if (this.viewMode()) return;
    if (this.canvasService.undo()) this.afterHistoryStep();
  }

  protected onRedo(): void {
    if (this.viewMode()) return;
    if (this.canvasService.redo()) this.afterHistoryStep();
  }

  /** An undone edit may have removed the selected object. */
  private afterHistoryStep(): void {
    const id = this.selectedObjectId();
    if (!id) return;
    const stillExists = this.canvasService
      .activeConfig()
      ?.objects.some(o => o.id === id);
    if (!stillExists) this.clearCanvasSelection();
  }

  /** Open a color dialog for the currently-selected object. */
  protected onEditObjectColors(): void {
    const objId = this.selectedObjectId();
    if (!objId) return;
    this.canvasColor.openEditColorsDialog(objId);
  }

  protected async onAddImage(): Promise<void> {
    await this.canvasPlacement.addImage(this.placementHandlers);
  }

  /** Add a non-interactive background image (map backdrop) to a layer. */
  protected async onAddBackgroundImage(layerId: string): Promise<void> {
    const added = await this.canvasPlacement.addImage(this.placementHandlers, {
      background: true,
      layerId,
    });
    // Bring the freshly-placed map into view once its node exists.
    if (added) requestAnimationFrame(() => this.onFitAll());
  }

  /** Toggle an image between backdrop and regular object. */
  protected onToggleObjectBackground(objectId: string, event?: Event): void {
    event?.stopPropagation();
    const obj = this.canvasService
      .activeConfig()
      ?.objects.find(o => o.id === objectId);
    if (obj?.type !== 'image') return;

    const makeBackground = !obj.isBackground;
    this.canvasService.updateObject(objectId, {
      isBackground: makeBackground || undefined,
    });
    // A backdrop cannot stay selected — it no longer takes part in selection.
    if (makeBackground && this.selectedObjectId() === objectId) {
      this.clearCanvasSelection();
    }
  }

  protected onShapeTypeChange(shapeType: CanvasShapeType): void {
    this.updateToolSettings({ shapeType });
    this.onToolChange('shape');
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
      this.scheduleToolbarMeasure();
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

  // ── Frame actions ──────────────────────────────────────────────────────

  /** Display names for preset frames (the frame's own name, not the menu label). */
  private static readonly PRESET_FRAME_NAMES: Record<FramePresetKey, string> = {
    cover: 'Cover',
    hd: 'HD',
    square: 'Square',
    a4: 'A4',
  };

  /** Toggle drawing of all frame borders (local preference). */
  protected onToggleFramesVisible(): void {
    this.framesVisible.update(v => {
      const next = !v;
      this.writeLocalStorage('canvasFramesVisible', String(next));
      return next;
    });
  }

  /** Rect of the given size centered on the current viewport. */
  private centeredFrameRect(
    width: number,
    height: number
  ): { x: number; y: number } {
    const center = this.canvasRenderer.getViewportCenter();
    return {
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
    };
  }

  /** Add THE canvas size (the page). No-op when one already exists. */
  protected onAddCanvasSize(): void {
    if (this.hasCanvasSize()) return;
    const width = 1920;
    const height = 1080;
    const pos = this.centeredFrameRect(width, height);
    this.canvasService.addFrame(
      createFrame('canvas', 'Canvas', pos.x, pos.y, width, height)
    );
  }

  /** Add a crop frame from a size preset. */
  protected onAddFramePreset(key: FramePresetKey): void {
    const preset = FRAME_PRESETS.find(p => p.key === key);
    if (!preset) return;
    const pos = this.centeredFrameRect(preset.width, preset.height);
    this.canvasService.addFrame(
      createFrame(
        'crop',
        CanvasTabComponent.PRESET_FRAME_NAMES[key],
        pos.x,
        pos.y,
        preset.width,
        preset.height
      )
    );
  }

  /** Add a crop frame with user-chosen name and size. */
  protected async onAddCustomFrame(): Promise<void> {
    const result = await this.openFrameDialog({
      title: this.transloco.translate('canvas.frames.customTitle'),
      name: this.transloco.translate('canvas.frames.defaultName'),
      width: 1000,
      height: 1000,
    });
    if (!result) return;
    const pos = this.centeredFrameRect(result.width, result.height);
    this.canvasService.addFrame(
      createFrame(
        'crop',
        result.name,
        pos.x,
        pos.y,
        result.width,
        result.height
      )
    );
  }

  /** Edit a frame's name, size and position. */
  protected async onEditFrame(frameId: string): Promise<void> {
    const frame = this.frames().find(f => f.id === frameId);
    if (!frame) return;
    const result = await this.openFrameDialog({
      title: this.transloco.translate('canvas.frames.editTitle'),
      name: frame.name,
      width: frame.width,
      height: frame.height,
      x: frame.x,
      y: frame.y,
      confirmLabel: this.transloco.translate('save'),
    });
    if (!result) return;
    this.canvasService.updateFrame(frameId, {
      name: result.name,
      width: result.width,
      height: result.height,
      x: result.x ?? frame.x,
      y: result.y ?? frame.y,
    });
  }

  private async openFrameDialog(
    data: CanvasFrameDialogData
  ): Promise<CanvasFrameDialogResult | undefined> {
    const { CanvasFrameDialogComponent } =
      await import('../../../../dialogs/canvas-frame-dialog/canvas-frame-dialog.component');
    const dialogRef = this.dialog.open<
      InstanceType<typeof CanvasFrameDialogComponent>,
      CanvasFrameDialogData,
      CanvasFrameDialogResult
    >(CanvasFrameDialogComponent, {
      data,
      width: '420px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  /** Select a frame for on-canvas drag/resize editing (toggle). */
  protected onSelectFrame(frameId: string): void {
    if (this.viewMode()) return;
    const next = this.selectedFrameId() === frameId ? null : frameId;
    this.selectedObjectId.set(null);
    this.canvasSelection.clearSelection();
    this.presence.setSelection(null);
    this.selectedFrameId.set(next);
  }

  protected onToggleFrameVisibility(frameId: string, event: Event): void {
    event.stopPropagation();
    const frame = this.frames().find(f => f.id === frameId);
    if (!frame) return;
    this.canvasService.updateFrame(frameId, { visible: !frame.visible });
  }

  protected onSetFrameKind(frameId: string, kind: CanvasFrameKind): void {
    this.canvasService.setFrameKind(frameId, kind);
  }

  protected onDeleteFrame(frameId: string): void {
    this.canvasService.removeFrame(frameId);
  }

  protected onExportFramePng(frame: CanvasFrame, pixelRatio = 1): void {
    this.canvasExport.exportFrameAsPng(frame, pixelRatio);
  }

  protected onExportFrameSvg(frame: CanvasFrame): void {
    this.canvasExport.exportFrameAsSvg(frame);
  }

  /** Render a frame's region and set it as the project cover. */
  protected async onSetFrameAsCover(frame: CanvasFrame): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    if (this.projectState.coverMediaId()) {
      const confirmed = await this.dialogGateway.openConfirmationDialog({
        title: this.transloco.translate('canvas.frames.coverConfirmTitle'),
        message: this.transloco.translate('canvas.frames.coverConfirmMessage'),
        confirmText: this.transloco.translate('canvas.frames.coverConfirm'),
      });
      if (!confirmed) return;
    }

    try {
      // Aim for ~1600px wide output — the cover pipeline fits into
      // 1600×2560 anyway. Clamp so tiny frames upscale and huge maps don't
      // blow the export canvas.
      const pixelRatio = Math.max(1, Math.min(3, 1600 / frame.width));
      const blob = await this.canvasExport.exportRegionBlob(frame, pixelRatio);

      const coverFilename = await this.projectService.uploadProjectCover(
        project.username,
        project.slug,
        blob
      );
      // The filename stem is the coverMediaId — same convention as the
      // edit-project dialog and the home tab's AI cover flow.
      const coverMediaId = coverFilename.replace(/\.[^.]+$/, '');
      this.projectState.updateProject(project, coverMediaId);

      this.snackBar.open(
        this.transloco.translate('canvas.frames.coverSaved'),
        undefined,
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Error setting frame as project cover:', error);
      this.snackBar.open(
        this.transloco.translate('canvas.frames.coverSaveFailed'),
        undefined,
        { duration: 5000 }
      );
    }
  }

  // ── Object actions ─────────────────────────────────────────────────────

  protected onSelectObject(objectId: string): void {
    // In view mode nothing gets selected; a click on a linked pin opens
    // its element instead.
    if (this.viewMode()) {
      const obj = this.canvasService
        .activeConfig()
        ?.objects.find(o => o.id === objectId);
      if (obj?.type === 'pin') this.openPinLink(obj);
      return;
    }

    this.selectedFrameId.set(null);
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
    if (this.viewMode()) return;
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
    if (this.viewMode()) return;
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
    if (this.viewMode()) return;
    this.canvasContextMenu.copy(this.menuCallbacks);
  }

  /** Cut the selected object (copy + remove) */
  protected onCut(): void {
    if (this.viewMode()) return;
    this.canvasContextMenu.cut(this.menuCallbacks);
  }

  /** Paste from clipboard at the context menu position (or viewport center) */
  protected onPaste(): void {
    if (this.viewMode()) return;
    this.canvasContextMenu.paste(this.menuCallbacks);
  }

  /** Duplicate the selected object with a small offset */
  protected onDuplicateObject(): void {
    if (this.viewMode()) return;
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
