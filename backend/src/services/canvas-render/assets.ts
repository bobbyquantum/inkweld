/**
 * The rasteriser's WebAssembly and fonts. How they reach the program differs by
 * runtime, and a file that imports them for one runtime will not even bundle
 * for another, so each runtime's entry point registers its own loader:
 * `assets.file.ts` for Bun and Node, `assets.worker.ts` for Workers.
 */

import type { InitInput } from '@resvg/resvg-wasm';

export interface CanvasRenderAssets {
  wasm(): Promise<InitInput>;
  fontPack(): Promise<Uint8Array>;
}

let registered: CanvasRenderAssets | null = null;

export function registerCanvasRenderAssets(assets: CanvasRenderAssets): void {
  registered = assets;
}

export function canvasRenderAssets(): CanvasRenderAssets | null {
  return registered;
}
