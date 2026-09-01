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

/** A rectangular export region in canvas world coordinates. */
export type ExportRect = SvgExportRegion;

/** Padding around fitted whole-area exports, in canvas units. */
const EXPORT_PAD = 20;

/**
 * Browser canvases fail (throw, or hand back an empty data URL) beyond a
 * per-side and a total-pixel limit. The export pixel ratio is scaled down to
 * stay under both rather than silently producing a blank file.
 */
const MAX_EXPORT_SIDE_PX = 16_384;
const MAX_EXPORT_PIXELS = 100_000_000;

/** What `toDataURL` returns for a canvas the browser refused to render. */
const EMPTY_DATA_URL = 'data:,';

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
    const bySide = MAX_EXPORT_SIDE_PX / Math.max(rect.width, rect.height, 1);
    const byArea = Math.sqrt(
      MAX_EXPORT_PIXELS / Math.max(rect.width * rect.height, 1)
    );
    return Math.min(requested, bySide, byArea);
  }

  /**
   * Export the whole canvas as a PNG: fitted around all visible content, or
   * the current viewport when the canvas is empty.
   */
  exportAsPng(filename: string, pixelRatio = 2): boolean {
    const rect = this.wholeAreaRect();
    const dataUrl = rect
      ? this.regionDataUrl(rect, pixelRatio)
      : this.viewportDataUrl(pixelRatio);
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
    const dataUrl = this.regionDataUrl(frame, pixelRatio);
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
  async exportRegionBlob(rect: ExportRect, pixelRatio = 1): Promise<Blob> {
    const dataUrl = this.regionDataUrl(rect, pixelRatio);
    if (!dataUrl) throw new Error('Canvas stage is not ready');
    const response = await fetch(dataUrl);
    return response.blob();
  }

  /** The visible viewport as a data URL, without selection chrome. */
  private viewportDataUrl(pixelRatio: number): string | null {
    const stage = this.renderer.stage;
    if (!stage) return null;
    return CanvasExportService.rendered(
      this.withCleanStage(stage, () => stage.toDataURL({ pixelRatio }))
    );
  }

  /** Treat the browser's "refused to render" result as no image at all. */
  private static rendered(dataUrl: string): string | null {
    return dataUrl && dataUrl !== EMPTY_DATA_URL ? dataUrl : null;
  }

  /**
   * A world-space region as a data URL.
   *
   * The stage is temporarily resized and re-positioned so the region fills
   * it exactly at scale 1: Konva composites layer canvases sized to the
   * viewport, so cropping the current view could never capture content
   * outside it (or at a different zoom). Everything is restored afterwards.
   */
  private regionDataUrl(rect: ExportRect, pixelRatio: number): string | null {
    const stage = this.renderer.stage;
    if (!stage) return null;
    const ratio = CanvasExportService.clampPixelRatio(rect, pixelRatio);

    const saved = {
      width: stage.width(),
      height: stage.height(),
      x: stage.x(),
      y: stage.y(),
      scaleX: stage.scaleX(),
      scaleY: stage.scaleY(),
    };

    try {
      stage.size({ width: rect.width, height: rect.height });
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: -rect.x, y: -rect.y });
      return CanvasExportService.rendered(
        this.withCleanStage(stage, () => stage.toDataURL({ pixelRatio: ratio }))
      );
    } catch {
      // Oversized or tainted canvases throw; the caller reports failure.
      return null;
    } finally {
      stage.size({ width: saved.width, height: saved.height });
      stage.scale({ x: saved.scaleX, y: saved.scaleY });
      stage.position({ x: saved.x, y: saved.y });
      stage.batchDraw();
    }
  }

  /**
   * Run `fn` with the selection, preview and frame-border layers hidden so
   * transformer handles and frame chrome never leak into an export.
   */
  private withCleanStage<T>(stage: Konva.Stage, fn: () => T): T {
    const chrome = [
      this.renderer.selectionLayer,
      this.renderer.previewLayer,
      this.renderer.framesLayer,
    ].filter((layer): layer is Konva.Layer => !!layer && layer.visible());

    for (const layer of chrome) layer.visible(false);
    try {
      stage.batchDraw();
      return fn();
    } finally {
      for (const layer of chrome) layer.visible(true);
      stage.batchDraw();
    }
  }

  private static download(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}
