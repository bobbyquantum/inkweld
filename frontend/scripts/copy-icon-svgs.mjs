#!/usr/bin/env node
/**
 * Stage Material Symbols SVG files for the HTML/website export.
 *
 * Exported pages inline worldbuilding schema and tab icons as SVG so the
 * output has no dependency on the icon font (3.8 MB) or on being online.
 * The `@material-symbols/svg-400` package ships one file per icon, but the
 * full outlined set is ~3,900 files / 15 MB — far too much to ship in the
 * app bundle. This script copies only the icons in the curated picker list
 * (`src/app/models/worldbuilding-icons.json`, aliases resolved) into
 * `public/assets/icons/outlined/` (gitignored), where the export resolves
 * them from `/assets/icons/outlined/<name>.svg`. Icons outside the list
 * fall back to a CDN fetch at export time.
 *
 * Runs on `bun install`; exits quickly when every file is already present.
 * Missing source icons print a warning but never fail the install.
 */

import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const manifestPath = join(root, 'src/app/models/worldbuilding-icons.json');
const sourceDir = join(root, 'node_modules/@material-symbols/svg-400/outlined');
const targetDir = join(root, 'public/assets/icons/outlined');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const names = new Set(
  manifest.icons.map(name => manifest.aliases[name] ?? name)
);
for (const target of Object.values(manifest.aliases)) names.add(target);

if (!existsSync(sourceDir)) {
  console.warn(
    `[copy-icon-svgs] ${sourceDir} not found; skipping icon staging.`
  );
  process.exit(0);
}

await mkdir(targetDir, { recursive: true });
let copied = 0;
const missing = [];
for (const name of names) {
  const target = join(targetDir, `${name}.svg`);
  if (existsSync(target)) continue;
  const source = join(sourceDir, `${name}.svg`);
  if (!existsSync(source)) {
    missing.push(name);
    continue;
  }
  await copyFile(source, target);
  copied++;
}

if (missing.length) {
  console.warn(
    `[copy-icon-svgs] no SVG for: ${missing.join(', ')} (check aliases in worldbuilding-icons.json)`
  );
}
if (copied) {
  console.log(`[copy-icon-svgs] staged ${copied} icon(s) into ${targetDir}`);
}
