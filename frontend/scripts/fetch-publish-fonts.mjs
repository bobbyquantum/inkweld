#!/usr/bin/env node
/**
 * Fetch TTF copies of the bundled publish fonts.
 *
 * The Typst WASM compiler used by the PDF generator parses fonts via
 * `ttf-parser`, which only understands raw TTF/OTF (not woff/woff2). The
 * `@fontsource/*` npm packages we use for browser CSS only ship woff/woff2,
 * so the compiler silently rejects them and falls back to its bundled
 * default font (Libertinus Serif).
 *
 * This script downloads TTF variants of the same six families from Google
 * Fonts (via the gwfh.mranftl.com mirror) on `bun install` and writes them
 * to `frontend/public/assets/fonts/` (gitignored). Angular's `public/`
 * folder is served as static assets, so the files are available at
 * `/assets/fonts/<family>-latin-<weight>-<style>.ttf` at runtime.
 *
 * The naming convention matches the woff2 files copied by the Angular
 * asset glob, so `BUNDLED_TYPST_FONT_URLS` and `_bundled-fonts.scss` can
 * stay aligned.
 *
 * If the TTFs already exist (and the env var INKWELD_REFETCH_FONTS isn't
 * set) the script exits silently — `bun install` runs this every time so
 * keeping it fast on warm caches matters.
 *
 * Failures (network down, etc.) print a warning but do NOT fail install
 * — the rest of the app still works, only PDF font rendering degrades.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const FAMILIES = [
  { slug: 'eb-garamond', token: 'eb-garamond' },
  { slug: 'source-serif-4', token: 'source-serif-4' },
  { slug: 'source-sans-3', token: 'source-sans-3' },
  { slug: 'lato', token: 'lato' },
  { slug: 'source-code-pro', token: 'source-code-pro' },
  { slug: 'courier-prime', token: 'courier-prime' },
];

/**
 * Map gwfh variant tokens to our naming convention.
 *  regular     -> 400-normal
 *  italic      -> 400-italic
 *  700         -> 700-normal
 *  700italic   -> 700-italic
 */
const VARIANT_MAP = {
  regular: '400-normal',
  italic: '400-italic',
  700: '700-normal',
  '700italic': '700-italic',
};

const VARIANTS = Object.keys(VARIANT_MAP).join(',');

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = resolve(__dirname, '..', 'public', 'assets', 'fonts');
const REFETCH = process.env.INKWELD_REFETCH_FONTS === '1';

/**
 * Optional integrity manifest. If `frontend/scripts/font-digests.json`
 * exists, every downloaded TTF must match the pinned SHA-256 digest
 * recorded there or the install is aborted (supply-chain protection).
 *
 * Shape: `{ "<slug>-latin-<weight>-<style>.ttf": "<hex sha256>" }`.
 *
 * When the file is absent we still compute and log digests so an operator
 * can pin them after a clean fetch (`INKWELD_LOG_FONT_DIGESTS=1`).
 */
const DIGESTS_PATH = resolve(__dirname, 'font-digests.json');
const LOG_DIGESTS = process.env.INKWELD_LOG_FONT_DIGESTS === '1';

async function loadDigests() {
  if (!existsSync(DIGESTS_PATH)) return null;
  try {
    const raw = await readFile(DIGESTS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`failed to read ${DIGESTS_PATH}: ${err.message}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Returns the set of expected TTF filenames for a family.
 */
function expectedFiles(slug) {
  return Object.values(VARIANT_MAP).map(v => `${slug}-latin-${v}.ttf`);
}

async function alreadyHave(slug) {
  if (REFETCH) return false;
  if (!existsSync(TARGET_DIR)) return false;
  const present = new Set(await readdir(TARGET_DIR));
  return expectedFiles(slug).every(f => present.has(f));
}

/**
 * Minimal central-directory ZIP parser. Avoids adding a runtime
 * dependency just to extract 4 small files per family.
 *
 * Returns an array of { name, data: Uint8Array }.
 */
function parseZip(buf) {
  const view = new DataView(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength
  );
  // Locate End of Central Directory Record (signature 0x06054b50).
  let eocdOff = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOff = i;
      break;
    }
  }
  if (eocdOff < 0) throw new Error('ZIP: EOCD not found');
  const cdSize = view.getUint32(eocdOff + 12, true);
  const cdOff = view.getUint32(eocdOff + 16, true);
  const entries = [];
  let p = cdOff;
  while (p < cdOff + cdSize) {
    if (view.getUint32(p, true) !== 0x02014b50) {
      throw new Error('ZIP: bad central dir signature');
    }
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const uncompSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(
      buf.subarray(p + 46, p + 46 + nameLen)
    );
    // Read local file header to get its variable-size fields, then data.
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    const compData = buf.subarray(dataOff, dataOff + compSize);
    let data;
    if (method === 0) {
      data = compData;
    } else if (method === 8) {
      // Inflate via Web Streams (Node 18+ / Bun).
      data = inflateRaw(compData, uncompSize);
    } else {
      throw new Error(`ZIP: unsupported compression method ${method}`);
    }
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Synchronous-style inflate using zlib (always available in Node/Bun).
 */
function inflateRaw(compData, uncompSize) {
  // Use Node's zlib for simplicity. Both Node and Bun support it.
  // Lazy require to avoid ESM/CJS issues at module top.
  const zlib = require('node:zlib');
  const out = zlib.inflateRawSync(compData, { maxOutputLength: uncompSize });
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

// `require` isn't normally available in ESM; create a CommonJS bridge.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

async function fetchFamily({ slug }, digests) {
  if (await alreadyHave(slug)) {
    return { slug, status: 'cached', count: 0 };
  }
  const url = `https://gwfh.mranftl.com/api/fonts/${slug}?download=zip&subsets=latin&variants=${VARIANTS}&formats=ttf`;
  // Bind the install-path network call so a stalled mirror cannot hang
  // local installs or CI indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const zip = new Uint8Array(await res.arrayBuffer());
  const entries = parseZip(zip);
  await mkdir(TARGET_DIR, { recursive: true });
  let written = 0;
  for (const entry of entries) {
    if (!entry.name.endsWith('.ttf')) continue;
    // gwfh files look like `lato-v25-latin-regular.ttf`; map the trailing
    // `-<variant>.ttf` to our `-<weight>-<style>.ttf` shape.
    const m = entry.name.match(/-latin-(regular|italic|700|700italic)\.ttf$/);
    if (!m) continue;
    const ourVariant = VARIANT_MAP[m[1]];
    const outName = `${slug}-latin-${ourVariant}.ttf`;
    // Supply-chain integrity: verify SHA-256 against the optional pinned
    // manifest BEFORE writing to disk. Mismatches abort the entire
    // install rather than risk shipping a tampered binary.
    const digest = sha256(entry.data);
    if (digests) {
      const expected = digests[outName];
      if (!expected) {
        throw new Error(
          `font-digests.json is missing an entry for ${outName} (got ${digest}); refusing to install an unverified font from ${url}`
        );
      }
      if (expected.toLowerCase() !== digest) {
        throw new Error(
          `font integrity check failed for ${outName}: expected ${expected}, got ${digest} (source: ${url})`
        );
      }
    } else if (LOG_DIGESTS) {
      console.log(`[fetch-publish-fonts] sha256 ${outName} = ${digest}`);
    }
    await writeFile(join(TARGET_DIR, outName), entry.data);
    written++;
  }
  // We expect one TTF per requested variant. If the upstream archive is
  // missing files (gwfh occasionally drops a variant for less-common
  // families), surface this as a failure rather than silently shipping a
  // partial family that would render with the wrong style at runtime.
  const expected = expectedFiles(slug).length;
  if (written < expected) {
    throw new Error(
      `incomplete download: got ${written}/${expected} variants for ${slug}`
    );
  }
  return { slug, status: 'downloaded', count: written };
}

async function main() {
  console.log(`[fetch-publish-fonts] target: ${TARGET_DIR}`);
  const digests = await loadDigests();
  if (digests) {
    console.log(
      `[fetch-publish-fonts] integrity manifest loaded: ${DIGESTS_PATH}`
    );
  }
  const results = await Promise.allSettled(
    FAMILIES.map(f => fetchFamily(f, digests))
  );
  let cached = 0;
  let downloaded = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const fam = FAMILIES[i].slug;
    if (r.status === 'fulfilled') {
      if (r.value.status === 'cached') cached++;
      else {
        downloaded++;
        console.log(
          `[fetch-publish-fonts] ${fam}: downloaded ${r.value.count} files`
        );
      }
    } else {
      failed++;
      console.warn(
        `[fetch-publish-fonts] ${fam}: failed (${r.reason?.message ?? r.reason}); PDF output for this family will fall back to Typst defaults.`
      );
    }
  }
  console.log(
    `[fetch-publish-fonts] done: ${cached} cached, ${downloaded} downloaded, ${failed} failed`
  );
  // Never fail install on font fetch errors — degrade gracefully.
}

main().catch(err => {
  console.warn(`[fetch-publish-fonts] unexpected error:`, err);
});
