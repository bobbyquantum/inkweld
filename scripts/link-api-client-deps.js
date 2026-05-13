#!/usr/bin/env node
/**
 * Creates symlinks so that packages outside frontend/ can resolve their
 * dependencies from frontend/node_modules without needing a separate install.
 *
 * Run automatically via the root postinstall script.
 */

const { existsSync, mkdirSync, symlinkSync, rmSync } = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const frontendModules = resolve(root, 'frontend/node_modules');

/**
 * Map of package directory → list of deps to symlink from frontend/node_modules.
 * Add entries here when a new packages/* package imports external modules.
 */
const packageDeps = {
  'packages/inkweld-api-client': ['@angular', 'rxjs', 'tslib'],
  'packages/inkweld-presence': ['lib0'],
};

function linkDep(packageDir, dep) {
  const src = resolve(frontendModules, dep);
  const dest = resolve(root, packageDir, 'node_modules', dep);

  if (!existsSync(src)) {
    console.warn(`[link-package-deps] Source not found, skipping: ${src}`);
    return;
  }

  mkdirSync(resolve(root, packageDir, 'node_modules'), { recursive: true });

  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }

  symlinkSync(src, dest);
  console.log(`[link-package-deps] ${packageDir}: linked ${dep}`);
}

for (const [packageDir, deps] of Object.entries(packageDeps)) {
  for (const dep of deps) {
    linkDep(packageDir, dep);
  }
}
