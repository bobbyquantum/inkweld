/**
 * Draws a canvas to a PNG on the server, for agents with no browser. Konva, which
 * draws canvases in the app, needs a browser's 2D context, so this goes through
 * the shared SVG builder and rasterises the result with resvg, which runs as
 * WebAssembly on every runtime we support.
 *
 * It is a close preview rather than a pixel match: same fonts and layout, but
 * not the same kerning or antialiasing as a browser.
 */

import {
  buildSvgDocument,
  type CanvasContents,
  canvasLayoutWarnings,
  canvasTextFont,
  type CanvasRenderPlan,
  LIGHT_PAGE,
} from '@inkweld/canvas';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { canvasRenderAssets } from './assets';
import { CanvasFontSet, fontSubstitutionWarning, readFontPack } from './font-set';
import { type CanvasMediaSource, loadCanvasImages } from './images';

export class CanvasRenderUnavailableError extends Error {
  constructor() {
    super('Rendering is not available on this server.');
    this.name = 'CanvasRenderUnavailableError';
  }
}

let wasmReady: Promise<void> | null = null;

/** Load the rasteriser once per process; a failed load can be tried again. */
function ensureRasteriser(): Promise<void> {
  const assets = canvasRenderAssets();
  if (!assets) throw new CanvasRenderUnavailableError();
  wasmReady ??= assets
    .wasm()
    .then((wasm) => initWasm(wasm))
    .catch((error: unknown) => {
      wasmReady = null;
      throw error;
    });
  return wasmReady;
}

let fontPackReady: Promise<ReturnType<typeof readFontPack>> | null = null;

function loadFontPack(): Promise<ReturnType<typeof readFontPack>> {
  const assets = canvasRenderAssets();
  if (!assets) throw new CanvasRenderUnavailableError();
  fontPackReady ??= assets
    .fontPack()
    .then(readFontPack)
    .catch((error: unknown) => {
      fontPackReady = null;
      throw error;
    });
  return fontPackReady;
}

/** A font set for measuring, before anything is drawn. */
export async function loadCanvasFontSet(): Promise<CanvasFontSet> {
  const { entries, faces } = await loadFontPack();
  return new CanvasFontSet(entries, faces);
}

/** What in the canvas's text this font set cannot show as it is stored. */
function textWarnings(contents: CanvasContents, fonts: CanvasFontSet): string[] {
  const warnings = new Set<string>();
  for (const obj of contents.objects) {
    if (obj.type !== 'text' || !obj.visible) continue;
    const substituted = fontSubstitutionWarning(fonts, obj.fontFamily);
    if (substituted) warnings.add(substituted);
    const missing = fonts.missingCharacters(obj.text, canvasTextFont(obj));
    if (missing.length > 0) {
      warnings.add(
        `Text "${obj.name ?? obj.id}" has characters the server's fonts lack (${missing.slice(0, 8).join(' ')}), which show as boxes here. The app falls back to the viewer's fonts for them.`
      );
    }
  }
  return [...warnings];
}

export interface CanvasRenderResult {
  png: Uint8Array;
  warnings: string[];
}

export async function renderCanvasToPng(
  contents: CanvasContents,
  plan: CanvasRenderPlan,
  fonts: CanvasFontSet,
  media: CanvasMediaSource
): Promise<CanvasRenderResult> {
  await ensureRasteriser();
  const images = await loadCanvasImages(contents, media);

  const svg = buildSvgDocument(
    {
      layers: contents.layers,
      objects: contents.objects,
      background: contents.background ?? LIGHT_PAGE.background,
    },
    plan.region,
    {
      measureText: fonts.measure,
      mapFontFamily: (family) => fonts.rasteriserFamily(family),
      resolveImage: images.resolve,
      pinLabels: false,
    }
  );

  const warnings = [
    ...canvasLayoutWarnings(contents, plan, fonts.measure),
    ...textWarnings(contents, fonts),
    ...images.warnings,
  ];

  // Every family in the SVG is one of ours, so this is only a safety net. Read
  // before the list of faces: reading it is what loads its face.
  const defaultFontFamily = fonts.rasteriserFamily('');
  const resvg = new Resvg(svg, {
    fitTo:
      plan.width >= plan.height
        ? { mode: 'width', value: plan.width }
        : { mode: 'height', value: plan.height },
    font: { fontBuffers: fonts.usedFaces(), defaultFontFamily },
  });
  // WebAssembly memory is not garbage collected: both have to be freed by hand.
  try {
    const rendered = resvg.render();
    try {
      return { png: rendered.asPng(), warnings };
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}
