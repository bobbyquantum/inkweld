/**
 * Rasteriser assets for Cloudflare Workers, which forbid compiling WebAssembly
 * at run time: it has to arrive as a module. Wrangler's default rules bundle a
 * `.wasm` file as a compiled module and a `.bin` file as an ArrayBuffer.
 */

import wasmModule from '@resvg/resvg-wasm/index_bg.wasm';
import fontPack from '../../../assets/canvas-fonts.pack.bin';
import type { CanvasRenderAssets } from './assets';

export const workerCanvasRenderAssets: CanvasRenderAssets = {
  wasm: () => Promise.resolve(wasmModule as unknown as WebAssembly.Module),
  fontPack: () => Promise.resolve(new Uint8Array(fontPack as unknown as ArrayBuffer)),
};
