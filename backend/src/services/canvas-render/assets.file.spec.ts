import { describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPath, fileCanvasRenderAssets } from './assets.file';

describe('assetPath', () => {
  it.each([
    ['a Windows checkout', 'C:\\inkweld\\node_modules\\@resvg\\resvg-wasm\\index_bg.wasm'],
    ['a Windows path with forward slashes', 'C:/inkweld/backend/assets/canvas-fonts.pack.bin'],
    ['a Windows binary', 'B:/~BUN/root/index_bg-1a2b3c4d.wasm'],
    ['a Linux or macOS binary', '/$bunfs/root/index_bg-1a2b3c4d.wasm'],
    ['a folder name with # and %', '/home/ann/my#novel/100%/index_bg.wasm'],
  ])('uses the absolute path from %s as it is', (_where, file) => {
    expect(assetPath(file)).toBe(file);
  });

  it('resolves a bundle path against the bundle', () => {
    const dist = join(tmpdir(), 'inkweld-dist');
    const bundle = pathToFileURL(join(dist, 'server.js'));
    expect(assetPath('./index_bg-1a2b3c4d.wasm', bundle)).toBe(
      join(dist, 'index_bg-1a2b3c4d.wasm')
    );
  });
});

describe('fileCanvasRenderAssets', () => {
  it('reads the rasteriser and the font pack', async () => {
    const wasm = (await fileCanvasRenderAssets.wasm()) as Uint8Array;
    // Every WebAssembly module starts with "\0asm".
    expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    expect((await fileCanvasRenderAssets.fontPack()).byteLength).toBeGreaterThan(0);
  });
});
