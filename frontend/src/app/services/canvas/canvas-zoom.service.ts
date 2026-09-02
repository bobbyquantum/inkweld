import { inject, Injectable } from '@angular/core';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';

import { layersContentBounds } from './canvas-bounds';

/** Min/max zoom levels */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;

/** Zoom step multiplier for wheel events */
const ZOOM_STEP = 1.1;

/**
 * Stage zoom and pan operations: in/out, fit-all and zoom-to-point.
 *
 * All methods return the new zoom level so the host component can update
 * its `zoomLevel` signal. Returns `null` when no work was performed (no
 * stage, empty content, etc.).
 */
@Injectable()
export class CanvasZoomService {
  static readonly MIN_ZOOM = MIN_ZOOM;
  static readonly MAX_ZOOM = MAX_ZOOM;
  static readonly ZOOM_STEP = ZOOM_STEP;

  private readonly canvasService = inject(CanvasService);
  private readonly canvasRenderer = inject(CanvasRendererService);

  zoomIn(): number | null {
    const stage = this.canvasRenderer.stage;
    if (!stage) return null;
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    return this.zoomToPoint(center, ZOOM_STEP);
  }

  zoomOut(): number | null {
    const stage = this.canvasRenderer.stage;
    if (!stage) return null;
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    return this.zoomToPoint(center, 1 / ZOOM_STEP);
  }

  /** Reset the stage to 100% zoom centred at the origin. */
  resetZoom(): number | null {
    const stage = this.canvasRenderer.stage;
    if (!stage) return null;
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    return 1;
  }

  fitAll(): number | null {
    const stage = this.canvasRenderer.stage;
    if (!stage) return null;

    const config = this.canvasService.activeConfig();
    const hasFrames = (config?.frames?.length ?? 0) > 0;
    if (!config || (config.objects.length === 0 && !hasFrames)) {
      stage.position({ x: 0, y: 0 });
      stage.scale({ x: 1, y: 1 });
      return 1;
    }

    // Pins render on the annotations overlay, outside the artwork layers.
    const bounds = layersContentBounds([
      ...this.canvasRenderer.konvaLayers.values(),
      this.canvasRenderer.annotationsLayer,
    ]);
    let minX = bounds ? bounds.x : Infinity,
      minY = bounds ? bounds.y : Infinity,
      maxX = bounds ? bounds.x + bounds.width : -Infinity,
      maxY = bounds ? bounds.y + bounds.height : -Infinity;

    // A frame far from the drawn content (or on an empty canvas) still
    // deserves to be brought into view — frames define the page/exports.
    for (const frame of config.frames ?? []) {
      if (!frame.visible) continue;
      minX = Math.min(minX, frame.x);
      minY = Math.min(minY, frame.y);
      maxX = Math.max(maxX, frame.x + frame.width);
      maxY = Math.max(maxY, frame.y + frame.height);
    }

    if (!Number.isFinite(minX)) return null;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 40;

    const scaleX = (stage.width() - padding * 2) / Math.max(contentWidth, 1);
    const scaleY = (stage.height() - padding * 2) / Math.max(contentHeight, 1);
    const scale = Math.min(scaleX, scaleY, MAX_ZOOM);

    stage.scale({ x: scale, y: scale });
    stage.position({
      x:
        -minX * scale +
        padding +
        (stage.width() - padding * 2 - contentWidth * scale) / 2,
      y:
        -minY * scale +
        padding +
        (stage.height() - padding * 2 - contentHeight * scale) / 2,
    });
    return scale;
  }

  zoomToPoint(point: { x: number; y: number }, factor: number): number | null {
    const stage = this.canvasRenderer.stage;
    if (!stage) return null;

    const oldScale = stage.scaleX();
    const newScale = Math.min(Math.max(oldScale * factor, MIN_ZOOM), MAX_ZOOM);

    const mousePointTo = {
      x: (point.x - stage.x()) / oldScale,
      y: (point.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: point.x - mousePointTo.x * newScale,
      y: point.y - mousePointTo.y * newScale,
    });
    return newScale;
  }
}
