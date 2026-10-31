/**
 * Rasteriser assets for Bun and Node. Imported `with { type: 'file' }` so that
 * `bun build` carries them along: into the output folder, or into the binary
 * with `--compile`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import wasmFile from '@resvg/resvg-wasm/index_bg.wasm' with { type: 'file' };
import fontPackFile from '../../../assets/canvas-fonts.pack.bin' with { type: 'file' };
import type { CanvasRenderAssets } from './assets';

/** A bundle gives a path relative to itself; a compiled binary an absolute one. */
function assetPath(file: string): string {
  return fileURLToPath(new URL(file, import.meta.url));
}

export const fileCanvasRenderAssets: CanvasRenderAssets = {
  wasm: () => readFile(assetPath(wasmFile)),
  fontPack: async () => new Uint8Array(await readFile(assetPath(fontPackFile))),
};
