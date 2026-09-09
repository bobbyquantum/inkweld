#!/usr/bin/env node
/**
 * Copy the extracted third-party license file into the browser output.
 *
 * `extractLicenses` writes `3rdpartylicenses.txt` as a *root* build artifact
 * (`BuildOutputFileType.Root`), i.e. next to `browser/` rather than inside it.
 * Everything that serves the app — Cloudflare Pages, the Docker image, the
 * embedded backend, Electron — only ever sees `<outputPath>/browser`, so
 * `/3rdpartylicenses.txt` 404s there. On Cloudflare the SPA fallback in
 * `public/_redirects` turns that 404 into index.html, and the Angular
 * `:username` route then renders a user profile instead of the licenses.
 *
 * Runs after `ng build`. Pass the build output base as the first argument
 * (default `dist`); the file is copied into `<base>/browser/`. Fails if the
 * file is absent, so a build that stops extracting licenses is caught in CI
 * rather than shipped.
 */

import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENSE_FILE = '3rdpartylicenses.txt';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const base = path.resolve(frontendRoot, process.argv[2] ?? 'dist');
const source = path.join(base, LICENSE_FILE);
const targetDir = path.join(base, 'browser');

try {
  await access(source);
} catch {
  // Every build wired to this script uses a configuration with
  // `extractLicenses: true`, so a missing file means the build silently
  // stopped shipping licenses. Fail rather than deploy a broken link.
  console.error(
    `[copy-licenses] expected ${LICENSE_FILE} in ${base} but it is missing — ` +
      'is `extractLicenses` still enabled for this build configuration?'
  );
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });
await copyFile(source, path.join(targetDir, LICENSE_FILE));
console.log(
  `[copy-licenses] copied ${LICENSE_FILE} into ${path.relative(frontendRoot, targetDir)}/`
);
