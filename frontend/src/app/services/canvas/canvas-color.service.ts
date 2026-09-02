import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  CanvasColorDialogComponent,
  type CanvasColorDialogData,
} from '@dialogs/canvas-color-dialog/canvas-color-dialog.component';
import { type CanvasObject, supportsGradientFill } from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import Konva from 'konva';

import { isGradientFill } from '../../pages/project/tabs/canvas/canvas-utils';

type ColorResult = { fill?: string; stroke?: string };

/**
 * Owns the "edit colours" flow for the currently-selected canvas object:
 * builds the dialog data, persists colour updates via {@link CanvasService}
 * and then mirrors those colours onto the live Konva node so the change is
 * visible immediately without a full re-render.
 */
@Injectable()
export class CanvasColorService {
  private readonly dialog = inject(MatDialog);
  private readonly canvasService = inject(CanvasService);
  private readonly canvasRenderer = inject(CanvasRendererService);

  /** Open the colour dialog for `objectId` and apply the result. No-op when
   *  the object cannot be found or has no editable colours (e.g. images). */
  openEditColorsDialog(objectId: string): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;

    const obj = config.objects.find(o => o.id === objectId);
    if (!obj) return;

    const data = this.buildDialogData(obj);
    if (!data) return;

    const dialogRef = this.dialog.open(CanvasColorDialogComponent, {
      data,
      width: '420px',
    });

    dialogRef.afterClosed().subscribe((result: ColorResult | undefined) => {
      if (!result) return;
      this.applyColorUpdate(objectId, obj.type, result);
    });
  }

  private buildDialogData(obj: CanvasObject): CanvasColorDialogData | null {
    let showFill = false;
    let showStroke = false;
    let fill: string | undefined;
    let stroke: string | undefined;

    if (obj.type === 'text') {
      showFill = true;
      fill = obj.fill;
    } else if (obj.type === 'path') {
      showStroke = true;
      stroke = obj.stroke;
      if (obj.closed) {
        showFill = true;
        fill = obj.fill;
      }
    } else if (obj.type === 'shape') {
      showFill = true;
      showStroke = true;
      fill = obj.fill;
      stroke = obj.stroke;
    } else if (obj.type === 'pin') {
      showFill = true;
      fill = obj.color;
    } else {
      return null; // images have no user-editable colour
    }

    return {
      title: 'Edit Colors',
      showFill,
      showStroke,
      fill,
      stroke,
      allowGradientFill: supportsGradientFill(obj),
    };
  }

  /**
   * Apply colours to an object without going through the dialog — used by the
   * toolbar swatches, which recolour the current selection as you pick.
   * Colours that don't apply to the object's type are ignored.
   */
  applyColor(objectId: string, result: ColorResult): void {
    const obj = this.canvasService
      .activeConfig()
      ?.objects.find(o => o.id === objectId);
    if (!obj) return;

    if (obj.type === 'image') return;
    // Only closed shapes can render a gradient; anything else would hand
    // Konva an invalid fillStyle and persist the bad value.
    if (
      result.fill !== undefined &&
      isGradientFill(result.fill) &&
      !supportsGradientFill(obj)
    ) {
      result = { ...result, fill: undefined };
      if (result.stroke === undefined) return;
    }

    if (obj.type === 'pin' || obj.type === 'text') {
      const fill = result.fill;
      if (fill === undefined) return;
      this.applyColorUpdate(objectId, obj.type, { fill });
      return;
    }

    this.applyColorUpdate(objectId, obj.type, result);
  }

  private applyColorUpdate(
    objectId: string,
    type: string,
    result: ColorResult
  ): void {
    const updates: Record<string, unknown> = {};

    if (type === 'pin') {
      if (result.fill) updates['color'] = result.fill;
    } else {
      if (result.fill !== undefined) updates['fill'] = result.fill;
      if (result.stroke !== undefined) updates['stroke'] = result.stroke;
    }

    this.canvasService.updateObject(objectId, updates);
    this.applyToKonvaNode(objectId, type, result);
  }

  private applyToKonvaNode(
    objectId: string,
    type: string,
    result: ColorResult
  ): void {
    const node = this.findKonvaNodeById(objectId);
    if (!node) return;

    if (type === 'pin' && node instanceof Konva.Group) {
      this.applyPinColor(node, result.fill);
    } else if (type === 'text' && node instanceof Konva.Text) {
      if (result.fill) node.fill(result.fill);
    } else if (type === 'path' && node instanceof Konva.Line) {
      this.applyPathColors(node, this.isInkPath(objectId), result);
    } else if (type === 'shape') {
      this.applyShapeColors(node, result);
    }

    node.getLayer()?.batchDraw();
  }

  /**
   * Colour a path. Pressure ink is drawn as a filled outline rather than a
   * stroked line, so the stroke colour has to land on its fill.
   */
  private applyPathColors(
    node: Konva.Shape,
    isInk: boolean,
    result: ColorResult
  ): void {
    if (isInk) {
      if (result.stroke) node.fill(result.stroke);
      return;
    }
    if (result.stroke) node.stroke(result.stroke);
    if (result.fill) node.fill(result.fill);
  }

  /** Pressure ink stores its colour as the fill of an outline, not a stroke. */
  private isInkPath(objectId: string): boolean {
    const obj = this.canvasService
      .activeConfig()
      ?.objects.find(o => o.id === objectId);
    return obj?.type === 'path' && !!obj.pressures?.length;
  }

  private findKonvaNodeById(objectId: string): Konva.Node | undefined {
    for (const [, kLayer] of this.canvasRenderer.konvaLayers) {
      const found = kLayer.findOne(`#${objectId}`);
      if (found) return found;
    }
    return undefined;
  }

  private applyPinColor(node: Konva.Group, fill: string | undefined): void {
    if (!fill) return;
    const marker = node.findOne('Circle');
    if (marker) (marker as Konva.Circle).fill(fill);
  }

  private applyShapeColors(node: Konva.Node, result: ColorResult): void {
    if (result.fill && 'fill' in node) {
      (node as Konva.Shape).fill(result.fill);
    }
    if (result.stroke && 'stroke' in node) {
      (node as Konva.Shape).stroke(result.stroke);
    }
  }
}
