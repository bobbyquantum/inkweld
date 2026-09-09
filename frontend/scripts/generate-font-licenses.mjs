#!/usr/bin/env node
/**
 * Generate the OFL attribution notice for the bundled fonts.
 *
 * The seven `@fontsource/*` families we ship are all SIL Open Font License
 * 1.1, which requires the copyright notice and the license text to
 * accompany every redistributed copy of the font software. We redistribute
 * those fonts twice over:
 *
 *  - `.woff2` faces, for on-screen rendering (`_bundled-fonts.scss`, and
 *    Roboto via the `@fontsource/roboto` CSS in `angular.json`'s `styles`)
 *  - `.ttf` faces, which the Typst WASM compiler reads and embeds into
 *    generated PDFs (`BUNDLED_TYPST_FONT_URLS` in pdf-generator.service.ts)
 *
 * Only Roboto reaches `3rdpartylicenses.txt`: license extraction works off
 * the esbuild metafile, so a package is attributed only when it is an input
 * to a JS or CSS output. Roboto's CSS is in `styles` and so is bundled; the
 * other six families are copied by asset globs (woff2) or downloaded by
 * fetch-publish-fonts.mjs (ttf), never becoming bundle inputs. That left
 * the six publish families served with no notice at all.
 *
 * Each family's upstream LICENSE is reproduced verbatim under a heading,
 * rather than parsed into a normalised notice. The `@fontsource` headers
 * are wildly inconsistent — some list a copyright line per face, some are
 * a bare company name — and reformatting them risks garbling the very
 * notice the license requires us to carry. Verbatim costs one copy of the
 * OFL body per family in a static text file; that is a fine trade.
 *
 * Runs on `bun install` alongside fetch-publish-fonts.mjs and writes
 * `public/assets/fonts/LICENSE.txt`, next to the font files themselves.
 * `public/assets/fonts/` is gitignored, so the notice is generated rather
 * than checked in.
 *
 * Pass an output directory as the first argument to write somewhere else.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Families whose faces we redistribute. The six publish families mirror
 * `FAMILIES` in fetch-publish-fonts.mjs; Roboto is the app's UI font and is
 * included so this file is a complete account of the fonts we serve, even
 * though Roboto is also covered by `3rdpartylicenses.txt`.
 */
const FAMILIES = [
  { slug: 'roboto', name: 'Roboto' },
  { slug: 'eb-garamond', name: 'EB Garamond' },
  { slug: 'source-serif-4', name: 'Source Serif 4' },
  { slug: 'source-sans-3', name: 'Source Sans 3' },
  { slug: 'lato', name: 'Lato' },
  { slug: 'source-code-pro', name: 'Source Code Pro' },
  { slug: 'courier-prime', name: 'Courier Prime' },
];

/**
 * Sanity check that what we copied is actually the license we claim it is.
 * A family that silently relicensed would otherwise be attributed wrongly.
 */
const OFL_MARKER =
  'This Font Software is licensed under the SIL Open Font License, Version 1.1.';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const outputDir = path.resolve(
  frontendRoot,
  process.argv[2] ?? path.join('public', 'assets', 'fonts')
);

async function readFamily({ slug, name }) {
  const licensePath = path.join(
    frontendRoot,
    'node_modules',
    '@fontsource',
    slug,
    'LICENSE'
  );
  let text;
  try {
    text = await readFile(licensePath, 'utf8');
  } catch {
    throw new Error(
      `no LICENSE in @fontsource/${slug} — cannot attribute ${name}`
    );
  }
  if (!text.includes(OFL_MARKER)) {
    throw new Error(
      `@fontsource/${slug}'s LICENSE is not the expected SIL Open Font ` +
        'License 1.1; check what it relicensed to before shipping it'
    );
  }
  return `${name}\n${'='.repeat(name.length)}\n\n${text.trim()}\n`;
}

/**
 * Guard against the failure this script exists to fix: a publish font added
 * to `BUNDLED_TYPST_FONT_URLS` but not to `FAMILIES` would be served, and
 * embedded into readers' PDFs, with no notice anywhere. Derive the families
 * the PDF generator actually asks for and insist we attribute all of them.
 */
async function assertPublishFontsAttributed() {
  const servicePath = path.join(
    frontendRoot,
    'src',
    'app',
    'services',
    'publish',
    'pdf-generator.service.ts'
  );
  const source = await readFile(servicePath, 'utf8');
  const slugs = new Set(
    [
      ...source.matchAll(
        /\/assets\/fonts\/([a-z0-9-]+)-latin-\d+-(?:normal|italic)\.ttf/g
      ),
    ].map(m => m[1])
  );
  if (slugs.size === 0) {
    throw new Error(
      `found no bundled font URLs in ${path.relative(frontendRoot, servicePath)}; ` +
        'the naming convention changed and this guard needs updating'
    );
  }
  const attributed = new Set(FAMILIES.map(f => f.slug));
  const unattributed = [...slugs].filter(s => !attributed.has(s));
  if (unattributed.length > 0) {
    throw new Error(
      `these publish fonts are served but not attributed: ${unattributed.join(', ')} — ` +
        'add them to FAMILIES in this script'
    );
  }
}

async function main() {
  await assertPublishFontsAttributed();

  const sections = await Promise.all(FAMILIES.map(readFamily));

  const content = `Inkweld — bundled font licenses
${'='.repeat(78)}

Inkweld bundles the font families listed below, each licensed under the SIL
Open Font License, Version 1.1. Every family's license is reproduced in full
and verbatim, exactly as it ships in the corresponding @fontsource package.

The .woff2 faces used for on-screen text come from those npm packages. The
.ttf faces that the PDF generator embeds into published documents are the
same families obtained from Google Fonts.

Licenses for the rest of Inkweld's third-party code are at
/3rdpartylicenses.txt.

${sections.join(`\n${'-'.repeat(78)}\n\n`)}`;

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'LICENSE.txt'), content);
  console.log(
    `[generate-font-licenses] wrote LICENSE.txt for ${FAMILIES.length} families to ` +
      `${path.relative(frontendRoot, outputDir)}/`
  );
}

// Unlike fetch-publish-fonts.mjs, which degrades gracefully when the network
// is down, a missing notice is a licensing problem rather than a cosmetic
// one — fail the install instead of shipping fonts we haven't attributed.
main().catch(err => {
  console.error(`[generate-font-licenses] ${err.message}`);
  process.exit(1);
});
