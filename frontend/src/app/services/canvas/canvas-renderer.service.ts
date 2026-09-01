import { inject, Injectable } from '@angular/core';
import {
  extractMediaId,
  isMediaUrl,
} from '@components/image-paste/image-paste-plugin';
import {
  type CanvasFrame,
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasText,
  type CanvasViewport,
  isBackgroundImage,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import Konva from 'konva';

import {
  isGradientFill,
  linearGradientLine,
  parseCssGradient,
} from '../../pages/project/tabs/canvas/canvas-utils';
import { buildInkOutline } from '../../pages/project/tabs/canvas/ink-stroke';

export interface CanvasNodeHandlers {
  onSelect: (objId: string) => void;
  onSelectKonvaNode: (node: Konva.Node) => void;
  /** Fired once per node when a drag or transform gesture begins. */
  onGestureStart?: () => void;
  onDragEnd: (objId: string, x: number, y: number) => void;
  onTransformEnd: (
    objId: string,
    x: number,
    y: number,
    scaleX: number,
    scaleY: number,
    rotation: number
  ) => void;
  onDblClickText: (obj: CanvasText, textNode: Konva.Text) => void;
  /**
   * Fired when a linked object (pin or region shape) is double-clicked or
   * double-tapped — open the linked element.
   */
  onOpenLinkedObject?: (obj: CanvasPin | CanvasShape) => void;
  /** Resolve a project element's display name (for hover labels). */
  getElementName?: (elementId: string) => string | null;
}

/** Milliseconds a tapped link's name label stays up on touch devices. */
const LINK_TAP_LABEL_MS = 1500;

/** Transformer anchors sized for fingers rather than a mouse pointer. */
function transformerAnchorSize(): number {
  const coarse =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 18 : 10;
}

/** Grab width (screen px) of a frame border while the frame is being edited. */
const FRAME_GRAB_PX = 12;

@Injectable()
export class CanvasRendererService {
  private readonly projectState = inject(ProjectStateService);
  private readonly canvasService = inject(CanvasService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);

  private _stage: Konva.Stage | null = null;
  private readonly _konvaLayers = new Map<string, Konva.Layer>();
  private readonly _konvaNodes = new Map<string, Konva.Node>();
  private _transformer: Konva.Transformer | null = null;
  private _selectionLayer: Konva.Layer | null = null;
  private _previewLayer: Konva.Layer | null = null;
  private _framesLayer: Konva.Layer | null = null;
  private _annotationsLayer: Konva.Layer | null = null;
  private readonly _frameNodes = new Map<string, Konva.Group>();
  private _frameTransformer: Konva.Transformer | null = null;
  private _editingFrameId: string | null = null;
  private readonly _objectStructures = new Map<string, string>();
  private _resizeObserver: ResizeObserver | null = null;
  private _contentInteractive = true;
  private _interactionLocked = false;

  get stage(): Konva.Stage | null {
    return this._stage;
  }
  get konvaLayers(): Map<string, Konva.Layer> {
    return this._konvaLayers;
  }
  get konvaNodes(): Map<string, Konva.Node> {
    return this._konvaNodes;
  }
  get transformer(): Konva.Transformer | null {
    return this._transformer;
  }
  get selectionLayer(): Konva.Layer | null {
    return this._selectionLayer;
  }
  /**
   * Scratch layer for in-progress strokes. Drawing here keeps every pointer
   * frame off the content layers, so a stroke over a large map doesn't
   * re-rasterize the map on every sample.
   */
  get previewLayer(): Konva.Layer | null {
    return this._previewLayer;
  }
  /** Overlay layer drawing frame borders (canvas size + crop frames). */
  get framesLayer(): Konva.Layer | null {
    return this._framesLayer;
  }
  /**
   * Overlay for annotations (pins): always above the artwork layers and
   * independent of their visibility, lock and deletion. Pins are semantic
   * markers about the map, not part of any one rendition of it.
   */
  get annotationsLayer(): Konva.Layer | null {
    return this._annotationsLayer;
  }

  /**
   * Whether objects respond to the pointer. Turned off while a creation tool
   * is active so strokes land on the stage instead of selecting or dragging
   * whatever happens to be underneath them.
   */
  setContentInteractive(interactive: boolean): void {
    if (this._contentInteractive === interactive) return;
    this._contentInteractive = interactive;
    for (const kLayer of this._konvaLayers.values()) {
      kLayer.listening(interactive && kLayer.getAttr('inkLocked') !== true);
    }
    // Annotations follow the same rule but are never layer-locked.
    this._annotationsLayer?.listening(interactive);
    // A frame being edited must not swallow strokes from a creation tool.
    this._framesLayer?.listening(interactive && this._editingFrameId !== null);
  }

  /**
   * View mode: objects stay visible and clickable (so linked pins navigate)
   * but nothing can be dragged. Re-syncing from the config restores each
   * object's own draggable state after unlocking.
   */
  setInteractionLocked(locked: boolean): void {
    if (this._interactionLocked === locked) return;
    this._interactionLocked = locked;
    if (locked) {
      for (const node of this._konvaNodes.values()) node.draggable(false);
    }
  }

  initStage(
    container: HTMLDivElement,
    configLayers: CanvasLayer[],
    configObjects: CanvasObject[],
    savedViewport: CanvasViewport | null,
    handlers: CanvasNodeHandlers
  ): { zoomLevel: number } {
    const width = container.clientWidth;
    const height = container.clientHeight;

    this._stage = new Konva.Stage({
      container,
      width,
      height,
      draggable: true,
    });

    this._previewLayer = new Konva.Layer({ listening: false });
    this._selectionLayer = new Konva.Layer();
    this._transformer = new Konva.Transformer({
      anchorSize: transformerAnchorSize(),
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
    this._selectionLayer.add(this._transformer);

    this._framesLayer = new Konva.Layer({ listening: false });
    this._annotationsLayer = new Konva.Layer({
      listening: this._contentInteractive,
    });

    this.buildKonvaLayers(configLayers);
    this.buildKonvaObjects(configObjects, handlers);

    this._stage.add(this._annotationsLayer);
    this._stage.add(this._framesLayer);
    this._stage.add(this._previewLayer);
    this._stage.add(this._selectionLayer);

    let zoomLevel = 1;
    if (savedViewport) {
      this._stage.position({ x: savedViewport.x, y: savedViewport.y });
      this._stage.scale({
        x: savedViewport.zoom,
        y: savedViewport.zoom,
      });
      zoomLevel = savedViewport.zoom;
    }

    this._resizeObserver = new ResizeObserver(() => {
      if (!this._stage) return;
      this._stage.width(container.clientWidth);
      this._stage.height(container.clientHeight);
    });
    this._resizeObserver.observe(container);

    return { zoomLevel };
  }

  buildKonvaLayers(layers: CanvasLayer[]): void {
    if (!this._stage) return;

    const sorted = [...layers].sort((a, b) => a.order - b.order);
    for (const layerDef of sorted) {
      const kLayer = new Konva.Layer({
        id: layerDef.id,
        visible: layerDef.visible,
        opacity: layerDef.opacity,
        listening: this._contentInteractive && !layerDef.locked,
      });
      kLayer.setAttr('inkLocked', layerDef.locked);
      this._konvaLayers.set(layerDef.id, kLayer);
      this._stage.add(kLayer);
    }
  }

  /**
   * The Konva layer an object renders on: pins live on the annotations
   * overlay (their `layerId` is vestigial, kept for old clients); everything
   * else renders on its artwork layer.
   */
  private targetLayerFor(obj: CanvasObject): Konva.Layer | null {
    if (obj.type === 'pin') return this._annotationsLayer;
    return this._konvaLayers.get(obj.layerId) ?? null;
  }

  buildKonvaObjects(
    objects: CanvasObject[],
    handlers: CanvasNodeHandlers
  ): void {
    for (const obj of objects) {
      const kLayer = this.targetLayerFor(obj);
      if (!kLayer) continue;

      const node = this.createKonvaNode(obj, handlers);
      if (node) {
        this._konvaNodes.set(obj.id, node);
        this._objectStructures.set(
          obj.id,
          CanvasRendererService.getObjectStructure(obj)
        );
        kLayer.add(node);
      }
    }
    for (const kLayer of this._konvaLayers.values()) {
      kLayer.batchDraw();
    }
    this._annotationsLayer?.batchDraw();
  }

  /**
   * Reconcile the Konva scene with the config, touching only what changed.
   *
   * Rebuilding the whole stage on every edit is what made drawing feel heavy:
   * a single stroke destroyed every node, and images fell back to their grey
   * placeholder until they had re-decoded. Nodes now survive edits; only
   * objects whose *structure* changed (a different shape type, a new image
   * source, ink switching between outlined and stroked) get replaced.
   */
  syncKonvaFromConfig(
    layers: CanvasLayer[],
    objects: CanvasObject[],
    selectedObjectId: string | null,
    handlers: CanvasNodeHandlers
  ): void {
    if (!this._stage) return;

    this.syncLayers(layers);
    this.syncObjects(objects, handlers);
    this.applyObjectZOrder(objects);

    this._annotationsLayer?.moveToTop();
    this._framesLayer?.moveToTop();
    this._previewLayer?.moveToTop();
    this._selectionLayer?.moveToTop();

    this.reattachTransformer(selectedObjectId, handlers);

    for (const kLayer of this._konvaLayers.values()) {
      kLayer.batchDraw();
    }
    this._annotationsLayer?.batchDraw();
  }

  /** Create, update and destroy Konva layers so they mirror the config. */
  private syncLayers(layers: CanvasLayer[]): void {
    if (!this._stage) return;

    const sorted = [...layers].sort((a, b) => a.order - b.order);
    const wanted = new Set(sorted.map(l => l.id));

    for (const [id, kLayer] of this._konvaLayers) {
      if (wanted.has(id)) continue;
      for (const [objId, node] of this._konvaNodes) {
        if (node.getLayer() === kLayer) {
          this.detachFromTransformer(node);
          this._konvaNodes.delete(objId);
          this._objectStructures.delete(objId);
        }
      }
      kLayer.destroy();
      this._konvaLayers.delete(id);
    }

    for (const layerDef of sorted) {
      let kLayer = this._konvaLayers.get(layerDef.id);
      if (!kLayer) {
        kLayer = new Konva.Layer({ id: layerDef.id });
        this._konvaLayers.set(layerDef.id, kLayer);
        this._stage.add(kLayer);
      }
      kLayer.visible(layerDef.visible);
      kLayer.opacity(layerDef.opacity);
      kLayer.setAttr('inkLocked', layerDef.locked);
      kLayer.listening(this._contentInteractive && !layerDef.locked);
      // Bottom-to-top ordering; preview and selection are lifted afterwards.
      kLayer.moveToTop();
    }
  }

  /** Add, patch, move and drop object nodes to match the config. */
  private syncObjects(
    objects: CanvasObject[],
    handlers: CanvasNodeHandlers
  ): void {
    const wanted = new Set<string>();

    for (const obj of objects) {
      wanted.add(obj.id);
      const kLayer = this.targetLayerFor(obj);
      if (kLayer) this.syncObject(obj, kLayer, handlers);
    }

    for (const [id, node] of this._konvaNodes) {
      if (wanted.has(id)) continue;
      this.detachFromTransformer(node);
      node.destroy();
      this._konvaNodes.delete(id);
      this._objectStructures.delete(id);
    }
  }

  /**
   * Bring one object's node up to date: patched in place where possible, and
   * rebuilt only when its structure changed (a different shape variant, a new
   * image source, ink switching between outlined and stroked).
   */
  private syncObject(
    obj: CanvasObject,
    kLayer: Konva.Layer,
    handlers: CanvasNodeHandlers
  ): void {
    const structure = CanvasRendererService.getObjectStructure(obj);
    let node = this._konvaNodes.get(obj.id) ?? null;

    if (node && this._objectStructures.get(obj.id) !== structure) {
      this.detachFromTransformer(node);
      node.destroy();
      this._konvaNodes.delete(obj.id);
      node = null;
    }

    if (!node) {
      const created = this.createKonvaNode(obj, handlers);
      if (!created) return;
      this._konvaNodes.set(obj.id, created);
      this._objectStructures.set(obj.id, structure);
      kLayer.add(created);
      return;
    }

    if (node.getLayer() !== kLayer) node.moveTo(kLayer);
    CanvasRendererService.applyCommonAttrs(node, obj);
    if (this._interactionLocked) node.draggable(false);
    CanvasRendererService.applyStyle(node, obj);
  }

  /**
   * Drop a node from the transformer before destroying it. A transformer that
   * still points at a destroyed node throws the next time it measures itself —
   * which is exactly what happens when a multi-selected object is deleted, or
   * removed by another collaborator.
   */
  private detachFromTransformer(node: Konva.Node): void {
    const transformer = this._transformer;
    if (!transformer) return;

    const attached = transformer.nodes();
    if (!attached.includes(node)) return;
    transformer.nodes(attached.filter(n => n !== node));
  }

  /**
   * Objects render in array order within their layer — mirror that in Konva.
   *
   * Restacking is only done when the order actually differs: `moveToTop` is a
   * splice, so blindly restacking every node on every sync would be quadratic
   * on a busy canvas. Appends (the common case) are already in order.
   */
  private applyObjectZOrder(objects: CanvasObject[]): void {
    for (const [layer, desired] of this.desiredNodeOrderByLayer(objects)) {
      const current = layer.getChildren();
      const alreadyOrdered =
        current.length === desired.length &&
        desired.every((node, i) => current[i] === node);
      if (alreadyOrdered) continue;
      for (const node of desired) node.moveToTop();
    }
  }

  /**
   * Desired stacking per layer: background images always first, then the
   * remaining objects in array order.
   */
  private desiredNodeOrderByLayer(
    objects: CanvasObject[]
  ): Map<Konva.Layer, Konva.Node[]> {
    const backgrounds = new Map<Konva.Layer, Konva.Node[]>();
    const foregrounds = new Map<Konva.Layer, Konva.Node[]>();

    for (const obj of objects) {
      const node = this._konvaNodes.get(obj.id);
      const layer = node?.getLayer();
      if (!node || !layer) continue;
      const byLayer = isBackgroundImage(obj) ? backgrounds : foregrounds;
      const nodes = byLayer.get(layer);
      if (nodes) nodes.push(node);
      else byLayer.set(layer, [node]);
    }

    for (const [layer, nodes] of foregrounds) {
      const existing = backgrounds.get(layer);
      if (existing) existing.push(...nodes);
      else backgrounds.set(layer, nodes);
    }
    return backgrounds;
  }

  // ─── Frames overlay ────────────────────────────────────────────────────

  /**
   * Reconcile the frame borders with the config.
   *
   * Frames are chrome, not content: they live on their own overlay layer,
   * never enter `_konvaNodes`, and (for now) never listen to the pointer.
   * In view mode only the canvas-size border stays — readers care about the
   * page boundary, not export scaffolding.
   */
  syncFrames(
    frames: CanvasFrame[] | undefined,
    opts: { viewMode: boolean; framesVisible: boolean }
  ): void {
    const layer = this._framesLayer;
    if (!layer) return;

    const list = frames ?? [];
    const wanted = new Set(list.map(f => f.id));
    for (const [id, group] of this._frameNodes) {
      if (wanted.has(id)) continue;
      group.destroy();
      this._frameNodes.delete(id);
    }

    for (const frame of list) {
      let group = this._frameNodes.get(frame.id);
      if (!group) {
        group = CanvasRendererService.createFrameGroup();
        this._frameNodes.set(frame.id, group);
        layer.add(group);
      }
      CanvasRendererService.applyFrameAttrs(group, frame);

      const shown =
        frame.visible &&
        opts.framesVisible &&
        (!opts.viewMode || frame.kind === 'canvas');
      group.visible(shown);
      group.findOne('.frameLabel')?.visible(shown && !opts.viewMode);
    }

    this.updateFrameOverlayScale(this._stage?.scaleX() ?? 1);
    layer.batchDraw();
  }

  /**
   * Counter-scale frame labels so they stay readable at every zoom level.
   * (Borders are already screen-constant via `strokeScaleEnabled: false`.)
   */
  updateFrameOverlayScale(stageScale: number): void {
    const layer = this._framesLayer;
    if (!layer || stageScale <= 0) return;
    const inverse = 1 / stageScale;
    for (const group of this._frameNodes.values()) {
      group
        .findOne<Konva.Label>('.frameLabel')
        ?.scale({ x: inverse, y: inverse });
    }
    layer.batchDraw();
  }

  /**
   * Make one frame draggable/resizable with its own transformer, or end
   * frame editing with `null`. Commits go through `onChange` on
   * dragend/transformend with the node geometry normalized back into
   * x/y/width/height (scale reset to 1).
   */
  setFrameEditing(
    frameId: string | null,
    onChange?: (
      frameId: string,
      rect: { x: number; y: number; width: number; height: number }
    ) => void
  ): void {
    const layer = this._framesLayer;
    if (!layer) return;

    // Same frame, still mounted: nothing to rebuild. Rebuilding here would
    // destroy the transformer mid-gesture whenever the config changes.
    if (
      frameId !== null &&
      frameId === this._editingFrameId &&
      this._frameTransformer &&
      this._frameNodes.has(frameId)
    ) {
      return;
    }

    // Tear down the previous editing state.
    if (this._editingFrameId) {
      const prevGroup = this._frameNodes.get(this._editingFrameId);
      prevGroup?.listening(false);
      const prevRect = prevGroup?.findOne<Konva.Rect>('.frameRect');
      prevRect?.off('.frameedit');
      prevRect?.setAttrs({
        listening: false,
        draggable: false,
        hitStrokeWidth: 'auto',
      });
    }
    this._frameTransformer?.destroy();
    this._frameTransformer = null;
    this._editingFrameId = frameId;
    layer.listening(frameId !== null && this._contentInteractive);

    const group = frameId ? this._frameNodes.get(frameId) : undefined;
    const rect = group?.findOne<Konva.Rect>('.frameRect');
    if (!frameId || !group || !rect || !onChange) {
      this._editingFrameId = null;
      layer.listening(false);
      layer.batchDraw();
      return;
    }

    // The group is non-listening chrome by default; while editing it must
    // pass events through to the rect.
    group.listening(true);

    // Only the border is grabbable: a filled hit area would sit above every
    // object inside the frame and block selecting or drawing on them. The
    // transformer's anchors handle resizing.
    rect.setAttrs({
      listening: true,
      draggable: true,
      fillEnabled: false,
      hitStrokeWidth: FRAME_GRAB_PX,
    });

    rect.on('dragend.frameedit transformend.frameedit', () => {
      const next = {
        x: Math.round(group.x() + rect.x()),
        y: Math.round(group.y() + rect.y()),
        width: Math.max(16, Math.round(rect.width() * rect.scaleX())),
        height: Math.max(16, Math.round(rect.height() * rect.scaleY())),
      };
      rect.position({ x: 0, y: 0 });
      rect.scale({ x: 1, y: 1 });
      onChange(frameId, next);
    });

    this._frameTransformer = new Konva.Transformer({
      anchorSize: transformerAnchorSize(),
      rotateEnabled: false,
      flipEnabled: false,
      nodes: [rect],
    });
    layer.add(this._frameTransformer);
    layer.batchDraw();
  }

  private static createFrameGroup(): Konva.Group {
    const group = new Konva.Group({ listening: false });

    group.add(
      new Konva.Rect({
        name: 'frameRect',
        strokeScaleEnabled: false,
        fillEnabled: false,
        listening: false,
      })
    );

    const label = new Konva.Label({ name: 'frameLabel', listening: false });
    label.add(
      new Konva.Tag({
        cornerRadius: 3,
        opacity: 0.9,
      })
    );
    label.add(
      new Konva.Text({
        name: 'frameLabelText',
        fontSize: 11,
        padding: 4,
        fill: '#fff',
      })
    );
    // Sits just above the frame's top-left corner (in screen units, since
    // the label is counter-scaled against the stage zoom).
    label.offsetY(24);
    group.add(label);

    return group;
  }

  private static applyFrameAttrs(group: Konva.Group, frame: CanvasFrame): void {
    const isCanvas = frame.kind === 'canvas';
    const color = isCanvas ? '#1976d2' : '#9c27b0';

    group.position({ x: frame.x, y: frame.y });
    group.setAttr('inkFrameId', frame.id);

    const rect = group.findOne<Konva.Rect>('.frameRect');
    rect?.setAttrs({
      width: frame.width,
      height: frame.height,
      stroke: color,
      strokeWidth: isCanvas ? 2 : 1.5,
      // Dash is applied in screen space under strokeScaleEnabled:false,
      // so it stays crisp at every zoom.
      dash: isCanvas ? [] : [6, 4],
    });

    const label = group.findOne<Konva.Label>('.frameLabel');
    label?.getTag().fill(color);
    label?.getText().text(frame.name);
  }

  /** Keep the transformer bound to the selected object across replacements. */
  private reattachTransformer(
    selectedObjectId: string | null,
    handlers: CanvasNodeHandlers
  ): void {
    const transformer = this._transformer;
    if (!transformer) return;

    if (!selectedObjectId) return;

    const node = this._konvaNodes.get(selectedObjectId);
    if (!node) {
      if (transformer.nodes().length > 0) {
        transformer.nodes([]);
        this._selectionLayer?.batchDraw();
      }
      return;
    }

    if (!transformer.nodes().includes(node)) {
      handlers.onSelectKonvaNode(node);
    }
  }

  rebuildAllKonvaNodes(
    layers: CanvasLayer[],
    objects: CanvasObject[],
    selectedObjectId: string | null,
    handlers: CanvasNodeHandlers
  ): void {
    for (const kLayer of this._konvaLayers.values()) {
      kLayer.destroy();
    }
    // Pins live outside _konvaLayers, so clear their overlay explicitly.
    this._annotationsLayer?.destroyChildren();
    this._konvaLayers.clear();
    this._konvaNodes.clear();
    this._objectStructures.clear();

    this.buildKonvaLayers(layers);
    this.buildKonvaObjects(objects, handlers);

    this._annotationsLayer?.moveToTop();
    this._framesLayer?.moveToTop();
    this._previewLayer?.moveToTop();
    this._selectionLayer?.moveToTop();

    if (selectedObjectId) {
      const selectedNode = this._konvaNodes.get(selectedObjectId);
      if (selectedNode) {
        handlers.onSelectKonvaNode(selectedNode);
      } else {
        this._transformer?.nodes([]);
        this._selectionLayer?.batchDraw();
      }
    }
  }

  /**
   * Identifies the *kind* of Konva node an object needs. When this changes the
   * node has to be rebuilt; everything else is patched in place.
   */
  static getObjectStructure(obj: CanvasObject): string {
    switch (obj.type) {
      case 'image':
        // isBackground is structural: it decides whether the node listens
        // to the pointer and has handlers wired at all.
        return `image:${obj.isBackground ? 'bg:' : ''}${obj.src}`;
      case 'shape':
        // A link adds interactions (dblclick, hover label) bound to the
        // target, so gaining, losing or retargeting one rebuilds the node.
        return `shape:${obj.shapeType}${obj.linkedElementId ? `:linked:${obj.linkedElementId}` : ''}`;
      case 'path':
        return `path:${obj.pressures?.length ? 'ink' : 'line'}`;
      case 'pin':
        // Linked pins carry extra interactions bound to the target, so
        // gaining, losing or retargeting a link rebuilds the node.
        return `pin:${obj.linkedElementId ? `linked:${obj.linkedElementId}` : 'plain'}`;
      default:
        return obj.type;
    }
  }

  /** Position, transform and visibility — cheap to apply on every sync. */
  static applyCommonAttrs(node: Konva.Node, obj: CanvasObject): void {
    node.position({ x: obj.x, y: obj.y });
    node.rotation(obj.rotation);
    node.scale({ x: obj.scaleX, y: obj.scaleY });
    node.visible(obj.visible);
    node.opacity(obj.opacity ?? 1);
    node.draggable(!obj.locked && !isBackgroundImage(obj));
  }

  /** Patch the type-specific appearance of an existing node. */
  static applyStyle(node: Konva.Node, obj: CanvasObject): void {
    switch (obj.type) {
      case 'path':
        CanvasRendererService.applyPathStyle(node as Konva.Line, obj);
        break;
      case 'shape':
        CanvasRendererService.applyShapeStyle(node as Konva.Shape, obj);
        break;
      case 'text':
        CanvasRendererService.applyTextStyle(node as Konva.Text, obj);
        break;
      case 'image':
        CanvasRendererService.applyImageStyle(node as Konva.Group, obj);
        break;
      case 'pin':
        CanvasRendererService.applyPinStyle(node as Konva.Group, obj);
        break;
    }
  }

  private static applyPathStyle(node: Konva.Line, obj: CanvasPath): void {
    const attrs = CanvasRendererService.pathAttrs(obj);
    node.points(attrs.points);
    node.strokeWidth(attrs.strokeWidth);
    node.closed(attrs.closed);
    node.tension(attrs.tension);
    node.hitStrokeWidth(attrs.hitStrokeWidth);
    node.setAttr('stroke', attrs.stroke);
    node.setAttr('fill', attrs.fill);
  }

  /**
   * Apply a shape's fill, which may be a plain color or a CSS gradient
   * string (Konva needs gradients as explicit start/end points and stops).
   */
  static applyShapeFill(node: Konva.Shape, obj: CanvasShape): void {
    const gradient = isGradientFill(obj.fill)
      ? parseCssGradient(obj.fill)
      : null;

    if (!gradient) {
      node.setAttrs({
        fill: obj.fill,
        fillPriority: 'color',
        fillLinearGradientColorStops: undefined,
        fillRadialGradientColorStops: undefined,
      });
      return;
    }

    // Ellipses draw around their origin; everything else from the top-left.
    const center =
      obj.shapeType === 'ellipse'
        ? { x: 0, y: 0 }
        : { x: obj.width / 2, y: obj.height / 2 };
    const stops: (number | string)[] = [];
    for (const stop of gradient.stops) stops.push(stop.offset, stop.color);

    if (gradient.type === 'linear') {
      const { start, end } = linearGradientLine(
        gradient.angle,
        obj.width,
        obj.height,
        center
      );
      node.setAttrs({
        fill: undefined,
        fillPriority: 'linear-gradient',
        fillLinearGradientStartPoint: start,
        fillLinearGradientEndPoint: end,
        fillLinearGradientColorStops: stops,
        fillRadialGradientColorStops: undefined,
      });
      return;
    }

    node.setAttrs({
      fill: undefined,
      fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: center,
      fillRadialGradientEndPoint: center,
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.hypot(obj.width, obj.height) / 2,
      fillRadialGradientColorStops: stops,
      fillLinearGradientColorStops: undefined,
    });
  }

  private static applyShapeStyle(node: Konva.Shape, obj: CanvasShape): void {
    node.stroke(obj.stroke);
    node.strokeWidth(obj.strokeWidth);
    if (
      obj.shapeType === 'rect' ||
      obj.shapeType === 'ellipse' ||
      obj.shapeType === 'polygon'
    ) {
      CanvasRendererService.applyShapeFill(node, obj);
    } else {
      node.setAttr('fill', obj.fill);
    }
    node.dash(obj.dash ?? []);

    if (node instanceof Konva.Rect) {
      node.width(obj.width);
      node.height(obj.height);
      node.cornerRadius(obj.cornerRadius ?? 0);
    } else if (node instanceof Konva.Ellipse) {
      node.radiusX(obj.width / 2);
      node.radiusY(obj.height / 2);
    } else if (node instanceof Konva.Line) {
      node.points(obj.points ?? [0, 0, obj.width, 0]);
      if (node instanceof Konva.Arrow) node.fill(obj.stroke);
    }
  }

  private static applyTextStyle(node: Konva.Text, obj: CanvasText): void {
    node.text(obj.text);
    node.fontSize(obj.fontSize);
    node.fontFamily(obj.fontFamily);
    node.fontStyle(obj.fontStyle);
    node.fill(obj.fill);
    node.setAttr('width', obj.width || undefined);
    node.align(obj.align);
  }

  private static applyImageStyle(node: Konva.Group, obj: CanvasImage): void {
    for (const child of node.getChildren()) {
      if (child instanceof Konva.Image || child instanceof Konva.Rect) {
        child.width(obj.width);
        child.height(obj.height);
      }
    }
  }

  private static applyPinStyle(node: Konva.Group, obj: CanvasPin): void {
    node.findOne<Konva.Circle>('.pinMarker')?.fill(obj.color);
    CanvasRendererService.updatePinLinkIndicator(node, !!obj.linkedElementId);
  }

  createKonvaNode(
    obj: CanvasObject,
    handlers: CanvasNodeHandlers
  ): Konva.Group | Konva.Shape | null {
    const background = isBackgroundImage(obj);
    const commonAttrs: Konva.NodeConfig = {
      id: obj.id,
      x: obj.x,
      y: obj.y,
      rotation: obj.rotation,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      visible: obj.visible,
      opacity: obj.opacity ?? 1,
      draggable: !obj.locked && !background && !this._interactionLocked,
      listening: !background,
    };

    let node: Konva.Group | Konva.Shape | null = null;

    switch (obj.type) {
      case 'image':
        node = CanvasRendererService.createImageNode(obj, commonAttrs, src =>
          this.resolveImageSrc(src)
        );
        break;
      case 'text':
        node = CanvasRendererService.createTextNode(
          obj,
          commonAttrs,
          handlers.onDblClickText
        );
        break;
      case 'path':
        node = CanvasRendererService.createPathNode(obj, commonAttrs);
        break;
      case 'shape':
        node = CanvasRendererService.createShapeNode(obj, commonAttrs);
        this.wireLinkInteractions(node, obj, handlers);
        break;
      case 'pin':
        node = CanvasRendererService.createPinNode(obj, commonAttrs);
        this.wireLinkInteractions(node, obj, handlers);
        break;
    }

    if (node && background) {
      // Backdrops never take part in selection, dragging or transforms.
      (node as Konva.Node).setAttr('inkBackground', true);
      return node;
    }

    if (node) {
      const n: Konva.Node = node;
      n.on('click tap', () => {
        handlers.onSelect(obj.id);
        handlers.onSelectKonvaNode(n);
      });

      n.on('dragstart transformstart', () => {
        handlers.onGestureStart?.();
      });

      n.on('dragend', () => {
        const pos = n.position();
        handlers.onDragEnd(obj.id, pos.x, pos.y);
      });

      n.on('transformend', () => {
        handlers.onTransformEnd(
          obj.id,
          n.x(),
          n.y(),
          n.scaleX(),
          n.scaleY(),
          n.rotation()
        );
      });
    }

    return node;
  }

  /** Extra interactions for objects linked to a project element. */
  private wireLinkInteractions(
    node: Konva.Node,
    obj: CanvasPin | CanvasShape,
    handlers: CanvasNodeHandlers
  ): void {
    if (!obj.linkedElementId) return;
    node.on('dblclick dbltap', () => handlers.onOpenLinkedObject?.(obj));
    node.on('mouseenter', () => {
      this.setStageCursor('pointer');
      const name = obj.linkedElementId
        ? handlers.getElementName?.(obj.linkedElementId)
        : null;
      if (name) this.showHoverLabel(name);
    });
    node.on('mouseleave', () => {
      this.setStageCursor('');
      this.hideHoverLabel();
    });
    // Touch has no hover: a tap shows the target's name briefly instead.
    node.on('tap', () => {
      const name = obj.linkedElementId
        ? handlers.getElementName?.(obj.linkedElementId)
        : null;
      if (!name) return;
      this.showHoverLabel(name);
      setTimeout(() => this.hideHoverLabel(), LINK_TAP_LABEL_MS);
    });
  }

  /** Show the linked element's name near the pointer, on the preview layer. */
  private showHoverLabel(text: string): void {
    const layer = this._previewLayer;
    const stage = this._stage;
    if (!layer || !stage) return;

    this.hideHoverLabel();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const world = stage.getAbsoluteTransform().copy().invert().point(pointer);

    const label = new Konva.Label({
      name: 'linkHoverLabel',
      x: world.x,
      y: world.y,
      listening: false,
    });
    label.add(
      new Konva.Tag({ fill: '#424242', cornerRadius: 3, opacity: 0.9 })
    );
    label.add(new Konva.Text({ text, fontSize: 11, padding: 4, fill: '#fff' }));
    // Screen-constant size and a small offset up-right of the cursor.
    const inverse = 1 / (stage.scaleX() || 1);
    label.scale({ x: inverse, y: inverse });
    label.offset({ x: -12, y: 24 });
    layer.add(label);
    layer.batchDraw();
  }

  private hideHoverLabel(): void {
    const layer = this._previewLayer;
    if (!layer) return;
    layer.find('.linkHoverLabel').forEach(n => n.destroy());
    layer.batchDraw();
  }

  private setStageCursor(cursor: string): void {
    const container = this._stage?.container();
    if (container) container.style.cursor = cursor;
  }

  static createImageNode(
    obj: CanvasImage,
    attrs: Konva.NodeConfig,
    resolveSrc: (src: string) => Promise<string>,
    warnLogger?: (msg: string) => void
  ): Konva.Group {
    const log = warnLogger ?? (() => {});
    const group = new Konva.Group({ ...attrs });

    const placeholder = new Konva.Rect({
      width: obj.width,
      height: obj.height,
      fill: '#e0e0e0',
      stroke: '#bdbdbd',
      strokeWidth: 1,
    });
    group.add(placeholder);

    void resolveSrc(obj.src).then(
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
          log(
            `Failed to load image: ${obj.id} src=${obj.src} resolved=${resolvedSrc}`
          );
          placeholder.fill('#ffcdd2');
          group.getLayer()?.batchDraw();
        };
        imageObj.src = resolvedSrc;
      },
      err => {
        log(`Failed to resolve image src: ${obj.src} ${err}`);
        placeholder.fill('#ffcdd2');
        group.getLayer()?.batchDraw();
      }
    );

    return group;
  }

  static createTextNode(
    obj: CanvasText,
    attrs: Konva.NodeConfig,
    onDblClick?: (obj: CanvasText, textNode: Konva.Text) => void
  ): Konva.Text {
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

    if (onDblClick) {
      textNode.on('dblclick dbltap', () => {
        onDblClick(obj, textNode);
      });
    }

    return textNode;
  }

  /**
   * Resolve how a path should be drawn.
   *
   * Pressure-modulated ink is stored as a centreline plus per-point width
   * factors and rendered as a filled outline, because a Konva line can only
   * have one width. Everything else stays a plain stroked polyline.
   */
  static pathAttrs(obj: CanvasPath): {
    points: number[];
    stroke: string | undefined;
    strokeWidth: number;
    closed: boolean;
    fill: string | undefined;
    tension: number;
    hitStrokeWidth: number;
  } {
    if (obj.pressures?.length) {
      return {
        points: buildInkOutline(obj.points, obj.pressures, obj.strokeWidth),
        stroke: undefined,
        strokeWidth: 0,
        closed: true,
        fill: obj.stroke,
        tension: 0,
        hitStrokeWidth: 0,
      };
    }

    return {
      points: obj.points,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      closed: obj.closed,
      fill: obj.closed ? obj.fill : undefined,
      tension: obj.tension,
      // Thin strokes are otherwise almost impossible to click.
      hitStrokeWidth: Math.max(obj.strokeWidth, 12),
    };
  }

  static createPathNode(obj: CanvasPath, attrs: Konva.NodeConfig): Konva.Line {
    return new Konva.Line({
      ...attrs,
      ...CanvasRendererService.pathAttrs(obj),
      lineCap: 'round',
      lineJoin: 'round',
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
    });
  }

  static createShapeNode(
    obj: CanvasShape,
    attrs: Konva.NodeConfig
  ): Konva.Shape {
    const node = CanvasRendererService.buildShapeNode(obj, attrs);
    // Gradient fills need explicit Konva attrs, not the constructor string.
    if (
      obj.shapeType === 'rect' ||
      obj.shapeType === 'ellipse' ||
      obj.shapeType === 'polygon'
    ) {
      CanvasRendererService.applyShapeFill(node, obj);
    }
    return node;
  }

  private static buildShapeNode(
    obj: CanvasShape,
    attrs: Konva.NodeConfig
  ): Konva.Shape {
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

  static createPinNode(obj: CanvasPin, attrs: Konva.NodeConfig): Konva.Group {
    const group = new Konva.Group({ ...attrs });

    const pinSize = 24;
    const marker = new Konva.Circle({
      name: 'pinMarker',
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

    if (obj.linkedElementId) {
      const linkBadge = new Konva.Circle({
        name: 'linkBadge',
        x: pinSize / 2 + 2,
        y: -(pinSize / 2) + 2,
        radius: 6,
        fill: '#1976D2',
        stroke: '#fff',
        strokeWidth: 1.5,
      });
      group.add(linkBadge);

      const linkIcon = new Konva.Text({
        name: 'linkIcon',
        x: pinSize / 2 + 2 - 4,
        y: -(pinSize / 2) + 2 - 5,
        text: '🔗',
        fontSize: 8,
        fill: '#fff',
        listening: false,
      });
      group.add(linkIcon);
    }

    return group;
  }

  static updatePinLinkIndicator(group: Konva.Group, hasLink: boolean): void {
    const badge = group.findOne('.linkBadge');
    const icon = group.findOne('.linkIcon');

    if (hasLink) {
      if (!badge) {
        const pinSize = 24;
        const newBadge = new Konva.Circle({
          name: 'linkBadge',
          x: pinSize / 2 + 2,
          y: -(pinSize / 2) + 2,
          radius: 6,
          fill: '#1976D2',
          stroke: '#fff',
          strokeWidth: 1.5,
        });
        group.add(newBadge);
        const newIcon = new Konva.Text({
          name: 'linkIcon',
          x: pinSize / 2 + 2 - 4,
          y: -(pinSize / 2) + 2 - 5,
          text: '🔗',
          fontSize: 8,
          fill: '#fff',
          listening: false,
        });
        group.add(newIcon);
      }
    } else {
      badge?.destroy();
      icon?.destroy();
    }
  }

  destroyStage(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this._stage) {
      this._stage.destroy();
      this._stage = null;
    }
    this._konvaLayers.clear();
    this._konvaNodes.clear();
    this._objectStructures.clear();
    this._frameNodes.clear();
    this._frameTransformer = null;
    this._editingFrameId = null;
    this._transformer = null;
    this._selectionLayer = null;
    this._previewLayer = null;
    this._framesLayer = null;
    this._annotationsLayer = null;
    this._contentInteractive = true;
  }

  async resolveImageSrc(src: string): Promise<string> {
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

  /** Convert pointer position to canvas world coordinates. */
  getCanvasPointerPosition(): { x: number; y: number } | null {
    if (!this._stage) return null;
    const pointer = this._stage.getPointerPosition();
    if (!pointer) return null;
    const transform = this._stage.getAbsoluteTransform().copy().invert();
    return transform.point(pointer);
  }

  /** Get the center of the visible viewport in canvas world coordinates. */
  getViewportCenter(): { x: number; y: number } {
    if (!this._stage) return { x: 0, y: 0 };
    const transform = this._stage.getAbsoluteTransform().copy().invert();
    return transform.point({
      x: this._stage.width() / 2,
      y: this._stage.height() / 2,
    });
  }
}
