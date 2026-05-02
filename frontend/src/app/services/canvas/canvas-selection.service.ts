import { inject, Injectable } from '@angular/core';
import type { CanvasObject } from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import Konva from 'konva';

import { removePinRelationship } from '../../pages/project/tabs/canvas/canvas-pin-helpers';
import { rectsIntersect } from '../../pages/project/tabs/canvas/canvas-utils';

/**
 * Callbacks the selection service uses to notify the host component about
 * single-selection state changes.
 */
export interface SelectionCallbacks {
  /** Called when a single Konva node has been selected (e.g. via rect-select of one). */
  onSingleSelected: (objectId: string) => void;
  /** Called when the current single selection has been cleared. */
  onCleared: () => void;
}

/**
 * Component-scoped service that manages selection state on the Konva stage:
 * picking nodes by id, by rectangle, by pointer hit-test, and clearing
 * selection. Also handles deletion of the currently selected object,
 * including cleaning up pin relationships.
 */
@Injectable()
export class CanvasSelectionService {
  private readonly renderer = inject(CanvasRendererService);
  private readonly canvasService = inject(CanvasService);
  private readonly relationshipService = inject(RelationshipService);

  /** Attach the transformer to the given Konva node and redraw. */
  selectNode(node: Konva.Node): void {
    const transformer = this.renderer.transformer;
    if (!transformer) return;
    transformer.nodes([node]);
    this.renderer.selectionLayer?.batchDraw();
  }

  /**
   * Select all Konva nodes whose bounding box intersects the given rect.
   * Notifies callbacks about single vs multi selection so the host can
   * keep its `selectedObjectId` signal in sync.
   */
  selectNodesInRect(
    rect: { x: number; y: number; width: number; height: number },
    callbacks: SelectionCallbacks
  ): void {
    const transformer = this.renderer.transformer;
    if (!transformer) return;

    const selected: Konva.Node[] = [];
    for (const [, kLayer] of this.renderer.konvaLayers) {
      kLayer.getChildren().forEach(child => {
        const box = child.getClientRect({ relativeTo: kLayer });
        if (rectsIntersect(rect, box)) {
          selected.push(child);
        }
      });
    }

    transformer.nodes(selected);

    if (selected.length === 1) {
      const id = selected[0].id();
      if (id) callbacks.onSingleSelected(id);
    } else {
      callbacks.onCleared();
    }
  }

  /**
   * Hit-test the current pointer position. If a known object lies under it,
   * invoke the callback with its id.
   */
  selectObjectAtPointer(callbacks: { onSelect: (id: string) => void }): void {
    const stage = this.renderer.stage;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const shape = stage.getIntersection(pos);
    if (!shape) return;

    const target = this.getTopLayerNode(shape);
    const objId = target.id();
    if (objId && this.renderer.konvaNodes.has(objId)) {
      callbacks.onSelect(objId);
    }
  }

  /** Clear transformer selection and redraw the selection layer. */
  clearSelection(): void {
    this.renderer.transformer?.nodes([]);
    this.renderer.selectionLayer?.batchDraw();
  }

  /**
   * Remove the object with the given id, cleaning up any pin relationship,
   * and clearing the transformer if it was selected.
   */
  deleteObject(objectId: string): void {
    const obj = this.canvasService
      .activeConfig()
      ?.objects.find((o: CanvasObject) => o.id === objectId);
    if (obj?.type === 'pin')
      removePinRelationship(this.relationshipService, obj);
    this.canvasService.removeObject(objectId);
  }

  /** Walk up the parent chain until the immediate child of the layer. */
  private getTopLayerNode(shape: Konva.Node): Konva.Node {
    let target: Konva.Node = shape;
    while (target.parent && !(target.parent instanceof Konva.Layer)) {
      target = target.parent;
    }
    return target;
  }
}
