import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { createMediaUrl } from '@components/image-paste/image-paste-plugin';
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
import type {
  CanvasImage,
  CanvasPin,
  CanvasShape,
  CanvasText,
  CanvasToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import type Konva from 'konva';
import { nanoid } from 'nanoid';

import {
  createPinRelationship,
  removePinRelationship,
} from '../../pages/project/tabs/canvas/canvas-pin-helpers';

/**
 * Callback bag the placement service uses to read transient component state
 * (active layer, pointer position, owning element id) without taking a
 * dependency on the component itself.
 */
export interface PlacementHandlers {
  /** Return the active layer ID (selecting a default if needed), or '' if none. */
  ensureLayer: () => string;
  /** Current canvas-space pointer position, or null. */
  pointer: () => { x: number; y: number } | null;
  /** Center of the visible viewport in canvas coordinates. */
  viewportCenter: () => { x: number; y: number };
  /** ID of the element that owns this canvas (for relationship creation). */
  elementId: () => string;
}

/**
 * Component-scoped service responsible for creating new canvas objects
 * (pins, text, default shapes, images) and editing existing ones.
 *
 * Provided per-component so each `CanvasTabComponent` instance gets its own
 * service bound to the tab's project state.
 */
@Injectable()
export class CanvasPlacementService {
  private readonly canvasService = inject(CanvasService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly projectState = inject(ProjectStateService);
  private readonly relationshipService = inject(RelationshipService);

  /** Open the pin dialog and create a new pin at the current pointer position. */
  placePin(handlers: PlacementHandlers): void {
    const pos = handlers.pointer();
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
        const layerId = handlers.ensureLayer();
        if (!layerId) return;

        let relationshipId: string | undefined;
        if (result.linkedElementId) {
          relationshipId = createPinRelationship(
            this.relationshipService,
            handlers.elementId(),
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

  /** Open the text dialog and create a new text object at the pointer position. */
  placeText(handlers: PlacementHandlers, settings: CanvasToolSettings): void {
    const pos = handlers.pointer();
    if (!pos) return;

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
        const layerId = handlers.ensureLayer();
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

  /** Click with shape tool → place a default-sized shape at the pointer position. */
  placeDefaultShape(
    handlers: PlacementHandlers,
    settings: CanvasToolSettings
  ): void {
    const pos = handlers.pointer();
    if (!pos) return;

    const defaultSize = 100;
    const isLinear =
      settings.shapeType === 'line' || settings.shapeType === 'arrow';
    const layerId = handlers.ensureLayer();
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
  openTextEditDialog(obj: CanvasText, textNode: Konva.Text): void {
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

  /** Open a dialog to edit an existing pin's label, color, and link target. */
  openPinEditDialog(
    obj: CanvasPin,
    label: Konva.Text,
    marker: Konva.Circle,
    group: Konva.Group,
    elementId: string
  ): void {
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

        CanvasRendererService.updatePinLinkIndicator(
          group,
          !!result.linkedElementId
        );

        const oldLink = obj.linkedElementId;
        const newLink = result.linkedElementId;
        let relationshipId = obj.relationshipId;

        if (oldLink !== newLink) {
          if (oldLink && relationshipId) {
            removePinRelationship(this.relationshipService, obj);
            relationshipId = undefined;
          }
          if (newLink) {
            relationshipId = createPinRelationship(
              this.relationshipService,
              elementId,
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

  /** Open the insert-image dialog, store the blob, and place the image on the active layer. */
  async addImage(handlers: PlacementHandlers): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    const result = await this.dialogGateway.openInsertImageDialog({
      username: project.username,
      slug: project.slug,
    });
    if (!result?.mediaId || !result?.imageBlob) return;

    const projectKey = `${project.username}/${project.slug}`;

    await this.localStorageService.saveMedia(
      projectKey,
      result.mediaId,
      result.imageBlob
    );

    this.localStorageService.preCacheMediaUrl(
      projectKey,
      result.mediaId,
      result.imageBlob
    );

    const blobUrl = URL.createObjectURL(result.imageBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const center = handlers.viewportCenter();
      const layerId = handlers.ensureLayer();
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
}
