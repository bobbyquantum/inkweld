/**
 * Rasteriser assets for Bun and Node. Imported `with { type: 'file' }` so that
 * `bun build` carries them along: into the output folder, or into the binary
 * with `--compile`.
 */

import { readFile } from 'node:fs/promises';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import wasmFile from '@resvg/resvg-wasm/index_bg.wasm' with { type: 'file' };
import fontPackFile from '../../../assets/canvas-fonts.pack.bin' with { type: 'file' };
import type { CanvasRenderAssets } from './assets';

/**
 * A bundle gives a path relative to itself; running from source (`bun run`,
 * `bun test`) or a compiled binary gives an absolute one, which is used as it
 * is. `new URL` would read a Windows drive (`C:\…`, or `B:/~BUN/…` in a
 * binary) as a URL scheme, and a `#` or `%` in a folder name as URL syntax.
 * `win32.isAbsolute` accepts POSIX absolute paths too.
 */
export function assetPath(file: string, base: string | URL = import.meta.url): string {
  return win32.isAbsolute(file) ? file : fileURLToPath(new URL(file, base));
}

export const fileCanvasRenderAssets: CanvasRenderAssets = {
  wasm: () => readFile(assetPath(wasmFile)),
  fontPack: async () => new Uint8Array(await readFile(assetPath(fontPackFile))),
};
