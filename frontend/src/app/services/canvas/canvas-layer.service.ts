import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import {
  RenameDialogComponent,
  type RenameDialogData,
} from '@dialogs/rename-dialog/rename-dialog.component';
import type { CanvasObject } from '@models/canvas.model';
import { RelationshipService } from '@services/relationship/relationship.service';
import { nanoid } from 'nanoid';
import { firstValueFrom, type Observable } from 'rxjs';

import { cleanupPinRelationships } from '../../pages/project/tabs/canvas/canvas-pin-helpers';
import { CanvasService } from './canvas.service';

@Injectable()
export class CanvasLayerService {
  private readonly canvasService = inject(CanvasService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly dialog = inject(MatDialog);

  addLayer(): string | null {
    const layerId = this.canvasService.addLayer();
    return layerId || null;
  }

  toggleVisibility(layerId: string): void {
    const config = this.canvasService.activeConfig();
    const layer = config?.layers.find(l => l.id === layerId);
    if (layer) {
      this.canvasService.updateLayer(layerId, { visible: !layer.visible });
    }
  }

  toggleLock(layerId: string): void {
    const config = this.canvasService.activeConfig();
    const layer = config?.layers.find(l => l.id === layerId);
    if (layer) {
      this.canvasService.updateLayer(layerId, { locked: !layer.locked });
    }
  }

  async renameLayer(layerId: string): Promise<string | undefined> {
    const config = this.canvasService.activeConfig();
    const layer = config?.layers.find(l => l.id === layerId);
    if (!layer) return;

    const data: RenameDialogData = {
      currentName: layer.name,
      title: 'Rename Layer',
    };
    const newName = await firstValueFrom(
      this.dialog
        .open(RenameDialogComponent, {
          data,
          width: '400px',
          disableClose: true,
        })
        .afterClosed() as Observable<string | undefined>
    );
    if (newName && typeof newName === 'string' && newName.trim()) {
      this.canvasService.updateLayer(layerId, { name: newName.trim() });
    }
    return newName ?? undefined;
  }

  duplicateLayer(layerId: string): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;

    const layer = config.layers.find(l => l.id === layerId);
    if (!layer) return;

    const newLayerId = this.canvasService.addLayer(`${layer.name} (copy)`);
    if (!newLayerId) return;

    const objectsToCopy = config.objects.filter(o => o.layerId === layerId);
    for (const obj of objectsToCopy) {
      const copy: CanvasObject = {
        ...obj,
        id: nanoid(),
        layerId: newLayerId,
        ...(obj.type === 'pin'
          ? { relationshipId: undefined, linkedElementId: undefined }
          : {}),
      };
      this.canvasService.addObject(copy);
    }
  }

  async deleteLayer(layerId: string): Promise<boolean> {
    const data: ConfirmationDialogData = {
      title: 'Delete Layer',
      message: 'Delete this layer and all its objects? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    };
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, { data, disableClose: true })
        .afterClosed() as Observable<boolean | undefined>
    );
    if (confirmed) {
      cleanupPinRelationships(
        this.relationshipService,
        this.canvasService.getObjectsForLayer(layerId)
      );
      this.canvasService.removeLayer(layerId);
      return true;
    }
    return false;
  }
}
