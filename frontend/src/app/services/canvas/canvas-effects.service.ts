import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  CanvasEffectsDialogComponent,
  type CanvasEffectsDialogData,
  type CanvasEffectsResult,
} from '@dialogs/canvas-effects-dialog/canvas-effects-dialog.component';
import { CanvasService } from '@services/canvas/canvas.service';

/**
 * Owns the "effects" flow for the selected canvas object. Saving is all it
 * takes: the renderer re-applies an object's style whenever the config changes.
 */
@Injectable()
export class CanvasEffectsService {
  private readonly dialog = inject(MatDialog);
  private readonly canvasService = inject(CanvasService);

  /** No-op when the object is gone, or is a pin, which has no effects to edit. */
  openEffectsDialog(objectId: string): void {
    const object = this.canvasService
      .activeConfig()
      ?.objects.find(o => o.id === objectId);
    if (!object || object.type === 'pin') return;

    const dialogRef = this.dialog.open<
      CanvasEffectsDialogComponent,
      CanvasEffectsDialogData,
      CanvasEffectsResult
    >(CanvasEffectsDialogComponent, { data: { object }, width: '480px' });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.canvasService.updateObject(objectId, result);
    });
  }
}
