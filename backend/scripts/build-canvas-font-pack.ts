#!/usr/bin/env bun
/**
 * Builds `assets/canvas-fonts.pack.bin`, the fonts the server draws canvas text
 * in. They are the app's own publish fonts, so text in them looks the same in
 * the app and in a server render. Each runtime then has one file to bundle
 * rather than twenty-four.
 *
 * The result is committed, because the Worker and the binary have to be able to
 * build without the frontend. Run this only when the fonts change: it needs
 * `frontend/public/assets/fonts`, which `bun install` fetches, and it checks each
 * face against `frontend/scripts/font-digests.json`.
 *
 * Usage: bun run scripts/build-canvas-font-pack.ts
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CANVAS_BUNDLED_FONTS } from '@inkweld/canvas';
import type { FontPackEntry } from '../src/services/canvas-render/font-set';

const FONT_DIR = join(import.meta.dir, '../../frontend/public/assets/fonts');
const DIGESTS = join(import.meta.dir, '../../frontend/scripts/font-digests.json');
const OUTPUT = join(import.meta.dir, '../assets/canvas-fonts.pack.bin');

const slug = (family: string): string => family.toLowerCase().replaceAll(' ', '-');

const digests = JSON.parse(await readFile(DIGESTS, 'utf8')) as Record<string, string>;

const faces = CANVAS_BUNDLED_FONTS.flatMap((family) =>
  [
    { weight: 400, style: 'normal' },
    { weight: 400, style: 'italic' },
    { weight: 700, style: 'normal' },
    { weight: 700, style: 'italic' },
  ].map((face) => ({ family, ...face }))
);

const files = await Promise.all(
  faces.map(async ({ family, weight, style }) => {
    const name = `${slug(family)}-latin-${weight}-${style}.ttf`;
    const bytes = new Uint8Array(await readFile(join(FONT_DIR, name)));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== digests[name]) throw new Error(`${name} does not match its pinned digest`);
    return bytes;
  })
);

let offset = 0;
const entries: FontPackEntry[] = faces.map(({ family, weight, style }, index) => {
  const entry = {
    family,
    bold: weight === 700,
    italic: style === 'italic',
    offset,
    length: files[index].byteLength,
  };
  offset += entry.length;
  return entry;
});

const header = new TextEncoder().encode(JSON.stringify(entries));
const headerLength = new Uint8Array(4);
new DataView(headerLength.buffer).setUint32(0, header.byteLength, true);
await writeFile(OUTPUT, Buffer.concat([headerLength, header, ...files]));
console.log(`Wrote ${OUTPUT}: ${entries.length} faces, ${offset} bytes`);
