#!/usr/bin/env bun
/**
 * Write the app version and recent release highlights into the built
 * `ngsw.json` as its `appData`.
 *
 * Angular's service worker passes the new build's `appData` to the running
 * app in its `VERSION_READY` event, so the update dialog (`UpdateService`)
 * can name the waiting version, say whether it's a beta, a stable release or
 * a major/minor/patch bump, and list what changed — before the user reloads.
 * A build that skips this script still updates; the dialog just falls back to
 * the generic "a new version is available".
 *
 * Runs after `ng build` (with `copy-licenses.mjs`). Pass the build output base
 * as the first argument (default `dist`); `<base>/browser/ngsw.json` is
 * rewritten in place. The version comes from the root package.json, like
 * `write-hosted-environment.mjs`; the highlights from the repo-root
 * CHANGELOG.md (or the copy in `public/assets/`).
 *
 * Usage: bun scripts/write-sw-app-data.ts [dist]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  summarizeChangelog,
  type UpdateAppData,
} from '../src/app/utils/release-notes';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const base = path.resolve(frontendRoot, process.argv[2] ?? 'dist');
const ngswPath = path.join(base, 'browser', 'ngsw.json');

if (!existsSync(ngswPath)) {
  // Only builds with the service worker enabled produce ngsw.json.
  console.log(`[write-sw-app-data] no ${ngswPath}; nothing to do`);
  process.exit(0);
}

const { version } = JSON.parse(
  readFileSync(path.join(frontendRoot, '..', 'package.json'), 'utf8')
) as { version: string };

const changelogPath = [
  path.join(frontendRoot, '..', 'CHANGELOG.md'),
  path.join(frontendRoot, 'public', 'assets', 'CHANGELOG.md'),
].find(candidate => existsSync(candidate));

const appData: UpdateAppData = {
  version,
  releases: changelogPath
    ? summarizeChangelog(readFileSync(changelogPath, 'utf8'))
    : [],
};

const manifest = JSON.parse(readFileSync(ngswPath, 'utf8')) as Record<
  string,
  unknown
>;
manifest['appData'] = appData;
writeFileSync(ngswPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `[write-sw-app-data] ${version}: ${appData.releases.length} release(s) in ngsw.json appData`
);
