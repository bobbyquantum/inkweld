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

export interface CanvasNodeHandlers {
  onSelect: (objId: string) => void;
  onSelectKonvaNode: (node: Konva.Node) => void;
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
  private readonly _objectRenderSignatures = new Map<string, string>();
  private _resizeObserver: ResizeObserver | null = null;

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
        listening: !layerDef.locked,
      });
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
        kLayer.add(node);
      }
    }
    for (const kLayer of this._konvaLayers.values()) {
      kLayer.batchDraw();
    }
  }

  syncKonvaFromConfig(
    layers: CanvasLayer[],
    objects: CanvasObject[],
    selectedObjectId: string | null,
    handlers: CanvasNodeHandlers
  ): void {
    if (!this._stage) return;

    for (const layerDef of layers) {
      const kLayer = this._konvaLayers.get(layerDef.id);
      if (kLayer) {
        kLayer.visible(layerDef.visible);
        kLayer.opacity(layerDef.opacity);
        kLayer.listening(!layerDef.locked);
      }
    }

    const configLayerIds = new Set(layers.map(l => l.id));
    const existingLayerIds = new Set(this._konvaLayers.keys());
    const configObjectIds = new Set(objects.map(o => o.id));
    const existingObjectIds = new Set(this._konvaNodes.keys());

    const layersChanged =
      configLayerIds.size !== existingLayerIds.size ||
      [...configLayerIds].some(id => !existingLayerIds.has(id));
    const objectsChanged =
      configObjectIds.size !== existingObjectIds.size ||
      [...configObjectIds].some(id => !existingObjectIds.has(id));

    const renderChanged = objects.some(obj => {
      const prev = this._objectRenderSignatures.get(obj.id);
      return prev !== CanvasRendererService.getObjectRenderSignature(obj);
    });

    if (layersChanged || objectsChanged || renderChanged) {
      this.rebuildAllKonvaNodes(layers, objects, selectedObjectId, handlers);
    } else {
      for (const obj of objects) {
        const node = this._konvaNodes.get(obj.id);
        if (node) {
          node.position({ x: obj.x, y: obj.y });
          node.rotation(obj.rotation);
          node.scale({ x: obj.scaleX, y: obj.scaleY });
          node.visible(obj.visible);
          node.draggable(!obj.locked);
        }
      }

      for (const kLayer of this._konvaLayers.values()) {
        kLayer.batchDraw();
      }
    }

    this._objectRenderSignatures.clear();
    for (const obj of objects) {
      this._objectRenderSignatures.set(
        obj.id,
        CanvasRendererService.getObjectRenderSignature(obj)
      );
    }

    this._selectionLayer?.moveToTop();
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
    this._objectRenderSignatures.clear();

    this.buildKonvaLayers(layers);
    this.buildKonvaObjects(objects, handlers);

    for (const obj of objects) {
      this._objectRenderSignatures.set(
        obj.id,
        CanvasRendererService.getObjectRenderSignature(obj)
      );
    }

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

  static getObjectRenderSignature(obj: CanvasObject): string {
    switch (obj.type) {
      case 'image':
        return JSON.stringify({
          type: obj.type,
          layerId: obj.layerId,
          src: obj.src,
          width: obj.width,
          height: obj.height,
        });
      case 'text':
        return JSON.stringify({
          type: obj.type,
          layerId: obj.layerId,
          text: obj.text,
          fontSize: obj.fontSize,
          fontFamily: obj.fontFamily,
          fontStyle: obj.fontStyle,
          fill: obj.fill,
          width: obj.width,
          align: obj.align,
        });
      case 'path':
        return JSON.stringify({
          type: obj.type,
          layerId: obj.layerId,
          points: obj.points,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          closed: obj.closed,
          fill: obj.fill,
          tension: obj.tension,
        });
      case 'shape':
        return JSON.stringify({
          type: obj.type,
          layerId: obj.layerId,
          shapeType: obj.shapeType,
          width: obj.width,
          height: obj.height,
          points: obj.points,
          fill: obj.fill,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          cornerRadius: obj.cornerRadius,
          dash: obj.dash,
        });
      case 'pin':
        return JSON.stringify({
          type: obj.type,
          layerId: obj.layerId,
          label: obj.label,
          icon: obj.icon,
          color: obj.color,
          linkedElementId: obj.linkedElementId,
          relationshipId: obj.relationshipId,
          note: obj.note,
        });
      default:
        return JSON.stringify(obj);
    }
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

  static createPathNode(obj: CanvasPath, attrs: Konva.NodeConfig): Konva.Line {
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
    this._transformer = null;
    this._selectionLayer = null;
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
