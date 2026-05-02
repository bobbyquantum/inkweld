import { inject, Injectable } from '@angular/core';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';

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
    if (!config || config.objects.length === 0) {
      stage.position({ x: 0, y: 0 });
      stage.scale({ x: 1, y: 1 });
      return 1;
    }

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const kLayer of this.canvasRenderer.konvaLayers.values()) {
      if (!kLayer.visible()) continue;
      const rect = kLayer.getClientRect({ skipTransform: true });
      if (rect.width === 0 && rect.height === 0) continue;
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
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
