import { inject, Injectable } from '@angular/core';
import { type CanvasFrame } from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import type Konva from 'konva';

import {
  downloadSvg,
  type SvgExportRegion,
} from '../../pages/project/tabs/canvas/canvas-svg-export';
import { layersContentBounds } from './canvas-bounds';
import {
  clampPixelRatio,
  dataUrlToBlob,
  type RasterOptions,
  renderStageRegion,
} from './canvas-raster';

/** A rectangular export region in canvas world coordinates. */
export type ExportRect = SvgExportRegion;

/** Padding around fitted whole-area exports, in canvas units. */
const EXPORT_PAD = 20;

/**
 * Component-scoped service that exports the active canvas as PNG (1x/2x/3x)
 * or SVG. Operates on the renderer's current Konva stage.
 *
 * "Whole area" exports fit around all visible content; individual frames
 * (canvas size or crops) export exactly their rect.
 */
@Injectable()
export class CanvasExportService {
  private readonly renderer = inject(CanvasRendererService);
  private readonly canvasService = inject(CanvasService);

  /** Bounds of all visible content, or null for an empty canvas. */
  private wholeAreaRect(): ExportRect | null {
    const config = this.canvasService.activeConfig();
    if (!config || config.objects.length === 0) return null;

    // Measured from the rendered nodes (rotation, auto-sized text and hidden
    // layers included); pins live on the annotations overlay.
    const bounds = layersContentBounds([
      ...this.renderer.konvaLayers.values(),
      this.renderer.annotationsLayer,
    ]);
    if (!bounds) return null;
    return {
      x: bounds.x - EXPORT_PAD,
      y: bounds.y - EXPORT_PAD,
      width: bounds.width + EXPORT_PAD * 2,
      height: bounds.height + EXPORT_PAD * 2,
    };
  }

  /** Largest pixel ratio (≤ requested) that keeps the output renderable. */
  static clampPixelRatio(rect: ExportRect, requested: number): number {
    return clampPixelRatio(rect, requested);
  }

  /**
   * Export the whole canvas as a PNG: fitted around all visible content, or
   * the current viewport when the canvas is empty.
   */
  exportAsPng(filename: string, pixelRatio = 2): boolean {
    const rect = this.wholeAreaRect() ?? this.viewportRect();
    if (!rect) return false;
    const dataUrl = this.regionDataUrl(rect, { pixelRatio });
    if (!dataUrl) return false;
    CanvasExportService.download(dataUrl, `${filename}.png`);
    return true;
  }

  /** Export the whole canvas as a high-resolution PNG (pixelRatio 3). */
  exportAsHighResPng(filename: string): boolean {
    return this.exportAsPng(`${filename}-highres`, 3);
  }

  /** Export the whole canvas as an SVG fitted around the visible content. */
  exportAsSvg(filename: string): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;
    downloadSvg(config, filename);
  }

  /** Export one frame's region as a PNG download. */
  exportFrameAsPng(frame: CanvasFrame, pixelRatio = 1): boolean {
    const dataUrl = this.regionDataUrl(frame, { pixelRatio });
    if (!dataUrl) return false;
    const suffix = pixelRatio > 1 ? `@${pixelRatio}x` : '';
    CanvasExportService.download(dataUrl, `${frame.name}${suffix}.png`);
    return true;
  }

  /** Export one frame's region as an SVG download. */
  exportFrameAsSvg(frame: CanvasFrame): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;
    downloadSvg(config, frame.name, frame);
  }

  /** Render a region to a Blob (used by the set-as-cover flow). */
  async exportRegionBlob(
    rect: ExportRect,
    pixelRatio = 1,
    options: Omit<RasterOptions, 'pixelRatio'> = {}
  ): Promise<Blob> {
    const dataUrl = this.regionDataUrl(rect, { ...options, pixelRatio });
    if (!dataUrl) throw new Error('Canvas stage is not ready');
    return dataUrlToBlob(dataUrl);
  }

  /** The visible viewport in world coordinates (an empty canvas export). */
  private viewportRect(): ExportRect | null {
    const stage = this.renderer.stage;
    if (!stage) return null;
    const scale = stage.scaleX() || 1;
    return {
      x: -stage.x() / scale,
      y: -stage.y() / scale,
      width: stage.width() / scale,
      height: stage.height() / scale,
    };
  }

  /**
   * A world-space region as a data URL, without selection chrome and on the
   * canvas's page colour. The page is content, not theme: the export must
   * match what the author saw, whichever theme a viewer's image tool uses.
   */
  private regionDataUrl(
    rect: ExportRect,
    options: RasterOptions
  ): string | null {
    const stage = this.renderer.stage;
    if (!stage) return null;
    const background =
      options.background ?? this.canvasService.activeConfig()?.background;
    return renderStageRegion(
      stage,
      rect,
      { ...options, background },
      this.chromeLayers()
    );
  }

  /** Layers that must never leak into an export. */
  private chromeLayers(): (Konva.Layer | null)[] {
    return [
      this.renderer.selectionLayer,
      this.renderer.previewLayer,
      this.renderer.framesLayer,
      // The on-screen page is repainted by renderStageRegion so the whole
      // export region is covered, not just the frame.
      this.renderer.pageLayer,
    ];
  }

  private static download(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}
