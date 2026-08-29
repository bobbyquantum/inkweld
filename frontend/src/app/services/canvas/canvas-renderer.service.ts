import { inject, Injectable } from '@angular/core';
import {
  extractMediaId,
  isMediaUrl,
} from '@components/image-paste/image-paste-plugin';
import {
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasText,
  type CanvasViewport,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import Konva from 'konva';

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
}

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
  private readonly _objectStructures = new Map<string, string>();
  private _resizeObserver: ResizeObserver | null = null;
  private _contentInteractive = true;

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

    this.buildKonvaLayers(configLayers);
    this.buildKonvaObjects(configObjects, handlers);

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

  buildKonvaObjects(
    objects: CanvasObject[],
    handlers: CanvasNodeHandlers
  ): void {
    for (const obj of objects) {
      const kLayer = this._konvaLayers.get(obj.layerId);
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

    this._previewLayer?.moveToTop();
    this._selectionLayer?.moveToTop();

    this.reattachTransformer(selectedObjectId, handlers);

    for (const kLayer of this._konvaLayers.values()) {
      kLayer.batchDraw();
    }
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
      const kLayer = this._konvaLayers.get(obj.layerId);
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
    const desiredByLayer = new Map<Konva.Layer, Konva.Node[]>();

    for (const obj of objects) {
      const node = this._konvaNodes.get(obj.id);
      const layer = node?.getLayer();
      if (!node || !layer) continue;
      const nodes = desiredByLayer.get(layer);
      if (nodes) nodes.push(node);
      else desiredByLayer.set(layer, [node]);
    }

    for (const [layer, desired] of desiredByLayer) {
      const current = layer.getChildren();
      const alreadyOrdered =
        current.length === desired.length &&
        desired.every((node, i) => current[i] === node);
      if (alreadyOrdered) continue;
      for (const node of desired) node.moveToTop();
    }
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
    this._konvaLayers.clear();
    this._konvaNodes.clear();
    this._objectStructures.clear();

    this.buildKonvaLayers(layers);
    this.buildKonvaObjects(objects, handlers);

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
        return `image:${obj.src}`;
      case 'shape':
        return `shape:${obj.shapeType}`;
      case 'path':
        return `path:${obj.pressures?.length ? 'ink' : 'line'}`;
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
    node.draggable(!obj.locked);
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

  private static applyShapeStyle(node: Konva.Shape, obj: CanvasShape): void {
    node.stroke(obj.stroke);
    node.strokeWidth(obj.strokeWidth);
    node.setAttr('fill', obj.fill);
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
    const commonAttrs: Konva.NodeConfig = {
      id: obj.id,
      x: obj.x,
      y: obj.y,
      rotation: obj.rotation,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      visible: obj.visible,
      opacity: obj.opacity ?? 1,
      draggable: !obj.locked,
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
        break;
      case 'pin':
        node = CanvasRendererService.createPinNode(obj, commonAttrs);
        break;
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
    this._transformer = null;
    this._selectionLayer = null;
    this._previewLayer = null;
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
