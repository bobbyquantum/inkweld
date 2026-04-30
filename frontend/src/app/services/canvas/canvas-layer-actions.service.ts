import { inject, Injectable } from '@angular/core';
import type { CanvasLayer } from '@models/canvas.model';
import { CanvasLayerService } from '@services/canvas/canvas-layer.service';

/** Callbacks the host component supplies for active-layer state. */
export interface LayerActionsCallbacks {
  /** Currently active layer id (signal-style getter). */
  getActiveLayerId: () => string;
  /** Update the active layer id. */
  setActiveLayerId: (id: string) => void;
  /** Get the current sorted layers (used for next-active selection on delete). */
  getSortedLayers: () => CanvasLayer[];
}

/**
 * Component-scoped service that wraps {@link CanvasLayerService} mutations
 * with the active-layer signal management the host component otherwise
 * has to repeat at every call site.
 */
@Injectable()
export class CanvasLayerActionsService {
  private readonly canvasLayer = inject(CanvasLayerService);

  /** Add a new layer and make it the active layer. */
  add(callbacks: LayerActionsCallbacks): void {
    const layerId = this.canvasLayer.addLayer();
    if (layerId) callbacks.setActiveLayerId(layerId);
  }

  /** Toggle the visibility of a layer. */
  toggleVisibility(layerId: string, event: Event): void {
    event.stopPropagation();
    this.canvasLayer.toggleVisibility(layerId);
  }

  /** Toggle the lock state of a layer. */
  toggleLock(layerId: string, event: Event): void {
    event.stopPropagation();
    this.canvasLayer.toggleLock(layerId);
  }

  /** Rename a layer (opens dialog). */
  async rename(layerId: string): Promise<void> {
    await this.canvasLayer.renameLayer(layerId);
  }

  /** Duplicate a layer. */
  duplicate(layerId: string): void {
    this.canvasLayer.duplicateLayer(layerId);
  }

  /**
   * Delete a layer. If the deleted layer was active, switch to the first
   * remaining layer (or the next sibling if the first one is the deleted layer).
   */
  async delete(
    layerId: string,
    callbacks: LayerActionsCallbacks
  ): Promise<void> {
    const deleted = await this.canvasLayer.deleteLayer(layerId);
    if (!deleted) return;
    const remaining = callbacks.getSortedLayers();
    if (remaining.length > 0 && remaining[0].id !== layerId) {
      callbacks.setActiveLayerId(remaining[0].id);
    } else if (remaining.length > 1) {
      callbacks.setActiveLayerId(remaining[1].id);
    }
  }
}
