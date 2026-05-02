import { inject, Injectable } from '@angular/core';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';

import { downloadSvg } from '../../pages/project/tabs/canvas/canvas-svg-export';

/**
 * Component-scoped service that exports the active canvas as PNG (1x/2x/3x)
 * or SVG. Operates on the renderer's current Konva stage.
 */
@Injectable()
export class CanvasExportService {
  private readonly renderer = inject(CanvasRendererService);
  private readonly canvasService = inject(CanvasService);

  /** Export the stage as a PNG at the given pixel ratio and trigger download. */
  exportAsPng(filename: string, pixelRatio = 2): void {
    const stage = this.renderer.stage;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ pixelRatio });
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  }

  /** Export the stage as a high-resolution PNG (pixelRatio 3). */
  exportAsHighResPng(filename: string): void {
    this.exportAsPng(`${filename}-highres`, 3);
  }

  /** Export the active canvas config as an SVG file. */
  exportAsSvg(filename: string): void {
    const config = this.canvasService.activeConfig();
    if (!config) return;
    downloadSvg(config, filename);
  }
}
