#!/usr/bin/env node
/**
 * Copy the repo-root CHANGELOG.md into `frontend/public/assets/` (gitignored)
 * so it ships as a static asset at `/assets/CHANGELOG.md`.
 *
 * Angular 22's application builder rejects asset `input` paths outside the
 * workspace root (frontend/), so the previous angular.json asset entry with
 * `"input": "../"` no longer works. This runs on `bun install` alongside
 * fetch-publish-fonts.mjs; the changelog only changes on release commits,
 * which always go through a fresh install in CI.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(frontendRoot, '..', 'CHANGELOG.md');
const targetDir = path.join(frontendRoot, 'public', 'assets');

await mkdir(targetDir, { recursive: true });
await copyFile(source, path.join(targetDir, 'CHANGELOG.md'));
console.log('[copy-changelog] copied CHANGELOG.md to public/assets/');
