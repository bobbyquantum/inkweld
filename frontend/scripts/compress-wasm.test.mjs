import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

const SCRIPT = join(import.meta.dir, 'compress-wasm.js');
const WASM_PATH = 'assets/wasm/compiler.wasm';
const WASM = Buffer.concat([
  Buffer.from([0x00, 0x61, 0x73, 0x6d]),
  Buffer.alloc(4096, 'compressible'),
]);
const MAIN_JS = 'console.log("main");'.repeat(100);

const sha1 = content => createHash('sha1').update(content).digest('hex');

describe('compress-wasm', () => {
  let dist;

  const read = file => readFileSync(join(dist, file));
  const readManifest = () => JSON.parse(read('ngsw.json').toString());

  function compress() {
    const result = spawnSync('node', [SCRIPT, dist], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  }

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'compress-wasm-'));
    mkdirSync(join(dist, 'assets/wasm'), { recursive: true });
    writeFileSync(join(dist, WASM_PATH), WASM);
    writeFileSync(join(dist, 'main.js'), MAIN_JS);
    writeFileSync(join(dist, 'index.html'), '<!doctype html>');
    writeFileSync(
      join(dist, 'ngsw.json'),
      JSON.stringify({
        hashTable: {
          '/index.html': sha1('<!doctype html>'),
          '/main.js': sha1(MAIN_JS),
          [`/${WASM_PATH}`]: sha1(WASM),
        },
      })
    );
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('replaces WASM with its Brotli-compressed bytes', () => {
    compress();

    expect(read(WASM_PATH).equals(WASM)).toBe(false);
    expect(brotliDecompressSync(read(WASM_PATH)).equals(WASM)).toBe(true);
    expect(existsSync(join(dist, `${WASM_PATH}.br`))).toBe(false);
  });

  it('keeps the WASM hash matching the decoded bytes the service worker sees', () => {
    compress();

    const decoded = brotliDecompressSync(read(WASM_PATH));
    expect(readManifest().hashTable[`/${WASM_PATH}`]).toBe(sha1(decoded));
  });

  it('removes the hash of index.html and leaves other hashes alone', () => {
    compress();

    const { hashTable } = readManifest();
    expect(hashTable['/index.html']).toBeUndefined();
    expect(hashTable['/main.js']).toBe(sha1(MAIN_JS));
  });

  it('writes .br sidecars, with the one for ngsw.json matching the final manifest', () => {
    compress();

    expect(brotliDecompressSync(read('main.js.br')).toString()).toBe(MAIN_JS);
    expect(read('main.js').toString()).toBe(MAIN_JS);
    expect(
      brotliDecompressSync(read('ngsw.json.br')).equals(read('ngsw.json'))
    ).toBe(true);
  });
});
