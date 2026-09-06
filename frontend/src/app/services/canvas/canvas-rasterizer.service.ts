import { inject, Injectable, Injector } from '@angular/core';
import type { CanvasContents } from '@models/canvas-edit';
import { LoggerService } from '@services/core/logger.service';

import {
  dataUrlToBlob,
  type RasterOptions,
  type RasterRect,
  renderStageRegion,
} from './canvas-raster';
import {
  type CanvasNodeHandlers,
  CanvasRendererService,
} from './canvas-renderer.service';

/** Upper bound on waiting for images and fonts before rendering anyway. */
const ASSET_SETTLE_TIMEOUT_MS = 15_000;

/** Interaction handlers for a stage nobody can interact with. */
const NOOP_HANDLERS: CanvasNodeHandlers = {
  onSelect: () => {},
  onSelectKonvaNode: () => {},
  onDragEnd: () => {},
  onTransformEnd: () => {},
  onDblClickText: () => {},
};

/**
 * Renders a region of any canvas to an image without the canvas tab being
 * open: builds a throwaway Konva stage in an offscreen container from the
 * synced contents, waits for images and fonts, rasterises, and tears it down.
 *
 * Used by the live project cover, which must regenerate when the canvas
 * changes even if the change arrived from a collaborator or the tab is
 * closed. Renders are serialised: two concurrent stages would double the
 * memory of a large map for no benefit.
 */
@Injectable({ providedIn: 'root' })
export class CanvasRasterizerService {
  private readonly injector = inject(Injector);
  private readonly logger = inject(LoggerService);

  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Render `rect` of `contents` to a Blob, or null when the browser refuses
   * (oversized or CORS-tainted canvas).
   */
  renderRegion(
    contents: CanvasContents,
    rect: RasterRect,
    options: RasterOptions = {}
  ): Promise<Blob | null> {
    const run = this.queue.then(() => this.renderNow(contents, rect, options));
    // Keep the chain alive even when a render fails.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async renderNow(
    contents: CanvasContents,
    rect: RasterRect,
    options: RasterOptions
  ): Promise<Blob | null> {
    if (typeof document === 'undefined') return null;

    const container = document.createElement('div');
    // Off-screen but still in the document: fonts only resolve for nodes
    // that belong to a document, and a stage attached to nothing has no
    // layout to fall back on.
    container.style.position = 'fixed';
    container.style.left = '-100000px';
    container.style.top = '0';
    container.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    container.style.height = `${Math.max(1, Math.round(rect.height))}px`;
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    const renderer = Injector.create({
      providers: [CanvasRendererService],
      parent: this.injector,
    }).get(CanvasRendererService);

    try {
      renderer.initStage(
        container,
        contents.layers,
        contents.objects,
        null,
        NOOP_HANDLERS,
        {
          size: { width: rect.width, height: rect.height },
          observeResize: false,
        }
      );
      // Position the stage over the region so image nodes decode against the
      // right viewport; renderStageRegion re-positions anyway.
      renderer.stage?.position({ x: -rect.x, y: -rect.y });

      await withTimeout(
        Promise.all([renderer.whenImagesSettled(), loadFonts(contents)]).then(
          () => undefined
        ),
        ASSET_SETTLE_TIMEOUT_MS
      );

      const stage = renderer.stage;
      if (!stage) return null;
      const dataUrl = renderStageRegion(stage, rect, options, [
        renderer.selectionLayer,
        renderer.previewLayer,
        renderer.framesLayer,
      ]);
      if (!dataUrl) {
        this.logger.warn(
          'CanvasRasterizer',
          'Browser refused to render the region (too large or tainted)'
        );
        return null;
      }
      return await dataUrlToBlob(dataUrl);
    } finally {
      renderer.destroyStage();
      container.remove();
    }
  }
}

/** Ask the browser to load every font family the canvas text uses. */
async function loadFonts(contents: CanvasContents): Promise<void> {
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return;
  const specs = new Set<string>();
  for (const obj of contents.objects) {
    if (obj.type !== 'text' || !obj.visible) continue;
    const style = obj.fontStyle.includes('italic') ? 'italic' : 'normal';
    const weight = obj.fontStyle.includes('bold') ? 'bold' : 'normal';
    specs.add(`${style} ${weight} ${obj.fontSize}px "${obj.fontFamily}"`);
  }
  await Promise.all([...specs].map(spec => fonts.load(spec).catch(() => [])));
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    void promise.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
