import { inject, Injectable } from '@angular/core';
import { type CanvasFrame, canvasSizeFrame } from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import type Konva from 'konva';

import { downloadSvg } from '../../pages/project/tabs/canvas/canvas-svg-export';

/** A rectangular export region in canvas world coordinates. */
export interface ExportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Component-scoped service that exports the active canvas as PNG (1x/2x/3x)
 * or SVG. Operates on the renderer's current Konva stage.
 *
 * When a canvas-size frame exists it defines the default export bounds;
 * otherwise the visible viewport is exported as before. Named crop frames can
 * be exported individually.
 */
@Injectable()
export class CanvasExportService {
  private readonly renderer = inject(CanvasRendererService);
  private readonly canvasService = inject(CanvasService);

  /** The canvas-size frame's rect, when one exists. */
  private canvasSizeRect(): ExportRect | null {
    const frame = canvasSizeFrame(this.canvasService.activeConfig()?.frames);
    return frame
      ? {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
        }
      : null;
  }

  /** Export the canvas as a PNG at the given pixel ratio and trigger download. */
  exportAsPng(filename: string, pixelRatio = 2): void {
    const rect = this.canvasSizeRect();
    const dataUrl = rect
      ? this.regionDataUrl(rect, pixelRatio)
      : this.viewportDataUrl(pixelRatio);
    if (dataUrl) CanvasExportService.download(dataUrl, `${filename}.png`);
  }

  /** Export the canvas as a high-resolution PNG (pixelRatio 3). */
  exportAsHighResPng(filename: string): void {
    this.exportAsPng(`${filename}-highres`, 3);
  }

  /** Export the active canvas config as an SVG file. */
  exportAsSvg(filename: string): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;
    downloadSvg(config, filename, this.canvasSizeRect() ?? undefined);
  }

  /** Export one frame's region as a PNG download. */
  exportFrameAsPng(frame: CanvasFrame, pixelRatio = 1): void {
    const dataUrl = this.regionDataUrl(frame, pixelRatio);
    if (!dataUrl) return;
    const suffix = pixelRatio > 1 ? `@${pixelRatio}x` : '';
    CanvasExportService.download(dataUrl, `${frame.name}${suffix}.png`);
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
    return this.withCleanStage(stage, () => stage.toDataURL({ pixelRatio }));
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
      return this.withCleanStage(stage, () => stage.toDataURL({ pixelRatio }));
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
