import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import Konva from 'konva';

import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import {
  CanvasColorDialogComponent,
  type CanvasColorDialogData,
} from '@dialogs/canvas-color-dialog/canvas-color-dialog.component';

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

    const data = this.buildDialogData(
      obj as unknown as { type: string } & Record<string, unknown>
    );
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

  private buildDialogData(
    obj: { type: string } & Record<string, unknown>
  ): CanvasColorDialogData | null {
    let showFill = false;
    let showStroke = false;
    let fill: string | undefined;
    let stroke: string | undefined;

    if (obj.type === 'text') {
      showFill = true;
      fill = obj['fill'] as string | undefined;
    } else if (obj.type === 'path') {
      showStroke = true;
      stroke = obj['stroke'] as string | undefined;
      if (obj['closed']) {
        showFill = true;
        fill = obj['fill'] as string | undefined;
      }
    } else if (obj.type === 'shape') {
      showFill = true;
      showStroke = true;
      fill = obj['fill'] as string | undefined;
      stroke = obj['stroke'] as string | undefined;
    } else if (obj.type === 'pin') {
      showFill = true;
      fill = obj['color'] as string | undefined;
    } else {
      return null; // images have no user-editable colour
    }

    return { title: 'Edit Colors', showFill, showStroke, fill, stroke };
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
      if (result.stroke) node.stroke(result.stroke);
      if (result.fill) node.fill(result.fill);
    } else if (type === 'shape') {
      this.applyShapeColors(node, result);
    }

    node.getLayer()?.batchDraw();
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
