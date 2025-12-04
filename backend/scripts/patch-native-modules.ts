#!/usr/bin/env bun
/**
 * Patch native module bindings for Bun binary compilation.
 *
 * When using `bun build --compile`, native .node files need to be directly required
 * (not resolved at runtime via node-gyp-build) for Bun to embed them in the binary.
 *
 * This script patches modules that use node-gyp-build to directly require their prebuilds.
 *
 * Supported modules:
 * - classic-level (used by y-leveldb for Yjs document persistence)
 * - leveldown (legacy, may be used transitively)
 * - bcrypt (password hashing)
 */

import * as fs from 'fs';
import * as path from 'path';

const NODE_MODULES = path.join(import.meta.dirname, '..', 'node_modules');

interface ModuleConfig {
  bindingFile: string; // Relative path from module root to binding file
  prebuilds: Record<string, string>; // Platform key -> relative path to .node file
}

const MODULES: Record<string, ModuleConfig> = {
  'classic-level': {
    bindingFile: 'binding.js',
    prebuilds: {
      'linux-x64-glibc': './prebuilds/linux-x64/node.napi.glibc.node',
      'linux-x64-musl': './prebuilds/linux-x64/node.napi.musl.node',
      'linux-arm64-glibc': './prebuilds/linux-arm64/node.napi.armv8.node',
      'darwin-x64': './prebuilds/darwin-x64+arm64/node.napi.node',
      'darwin-arm64': './prebuilds/darwin-x64+arm64/node.napi.node',
      'win32-x64': './prebuilds/win32-x64/node.napi.node',
    },
  },
  leveldown: {
    bindingFile: 'binding.js',
    prebuilds: {
      'linux-x64-glibc': './prebuilds/linux-x64/node.napi.glibc.node',
      'linux-x64-musl': './prebuilds/linux-x64/node.napi.musl.node',
      'linux-arm64-glibc': './prebuilds/linux-arm64/node.napi.armv8.node',
      'darwin-x64': './prebuilds/darwin-x64+arm64/node.napi.node',
      'darwin-arm64': './prebuilds/darwin-x64+arm64/node.napi.node',
      'win32-x64': './prebuilds/win32-x64/node.napi.node',
    },
  },
  bcrypt: {
    bindingFile: 'bcrypt.js',
    prebuilds: {
      'linux-x64-glibc': './prebuilds/linux-x64/bcrypt.glibc.node',
      'linux-x64-musl': './prebuilds/linux-x64/bcrypt.musl.node',
      'linux-arm64-glibc': './prebuilds/linux-arm64/bcrypt.glibc.node',
      'linux-arm64-musl': './prebuilds/linux-arm64/bcrypt.musl.node',
      'darwin-x64': './prebuilds/darwin-x64/bcrypt.node',
      'darwin-arm64': './prebuilds/darwin-arm64/bcrypt.node',
      'win32-x64': './prebuilds/win32-x64/bcrypt.node',
    },
  },
};

function detectLibc(): 'glibc' | 'musl' {
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
    if (osRelease.includes('alpine')) {
      return 'musl';
    }
  } catch {
    // Ignore - probably not Linux
  }
  return 'glibc';
}

function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;
  const libc = platform === 'linux' ? `-${detectLibc()}` : '';
  return `${platform}-${arch}${libc}`;
}

function getBindingPath(moduleName: string): string {
  const config = MODULES[moduleName];
  if (!config) {
    throw new Error(`Unknown module: ${moduleName}`);
  }
  return path.join(NODE_MODULES, moduleName, config.bindingFile);
}

function patchModule(
  moduleName: string,
  targetPlatform?: string
): { success: boolean; message: string } {
  const config = MODULES[moduleName];
  if (!config) {
    return { success: false, message: `Unknown module: ${moduleName}` };
  }

  const bindingPath = getBindingPath(moduleName);

  // Check if module exists
  if (!fs.existsSync(bindingPath)) {
    return {
      success: true,
      message: `Module ${moduleName} not installed, skipping`,
    };
  }

  const platformKey = targetPlatform ?? getPlatformKey();
  const prebuildPath = config.prebuilds[platformKey];

  if (!prebuildPath) {
    return {
      success: false,
      message: `No prebuild for ${moduleName} on platform: ${platformKey}`,
    };
  }

  // Verify the prebuild exists
  const fullPrebuildPath = path.join(
    path.dirname(bindingPath),
    prebuildPath.startsWith('./') ? prebuildPath.slice(2) : prebuildPath
  );
  if (!fs.existsSync(fullPrebuildPath)) {
    return {
      success: false,
      message: `Prebuild not found for ${moduleName}: ${fullPrebuildPath}`,
    };
  }

  // Backup original if not already backed up
  const backupPath = bindingPath + '.original';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(bindingPath, backupPath);
  }

  // Generate patched content
  let patchedContent: string;

  if (moduleName === 'bcrypt') {
    // bcrypt has additional code we need to preserve
    const original = fs.readFileSync(backupPath, 'utf-8');
    // Replace only the node-gyp-build line
    patchedContent = original.replace(
      /const bindings = require\('node-gyp-build'\)\([^)]+\);/,
      `const bindings = require('${prebuildPath}');`
    );
  } else {
    // Simple binding.js files
    patchedContent = `// Patched for Bun binary compilation
// Original: module.exports = require('node-gyp-build')(__dirname)
module.exports = require('${prebuildPath}');
`;
  }

  fs.writeFileSync(bindingPath, patchedContent);
  return {
    success: true,
    message: `Patched ${moduleName} for ${platformKey} → ${prebuildPath}`,
  };
}

function restoreModule(moduleName: string): { success: boolean; message: string } {
  const bindingPath = getBindingPath(moduleName);
  const backupPath = bindingPath + '.original';

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, bindingPath);
    fs.unlinkSync(backupPath);
    return { success: true, message: `Restored ${moduleName}` };
  }

  return { success: true, message: `No backup for ${moduleName}, nothing to restore` };
}

function patchAll(targetPlatform?: string): void {
  console.log(`\n🔧 Patching native modules for: ${targetPlatform ?? getPlatformKey()}\n`);

  for (const moduleName of Object.keys(MODULES)) {
    const result = patchModule(moduleName, targetPlatform);
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.message}`);
  }
  console.log();
}

function restoreAll(): void {
  console.log('\n🔧 Restoring original native module bindings\n');

  for (const moduleName of Object.keys(MODULES)) {
    const result = restoreModule(moduleName);
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.message}`);
  }
  console.log();
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'patch':
    patchAll(args[1]); // Optional: target platform like 'linux-x64-glibc'
    break;
  case 'restore':
    restoreAll();
    break;
  case 'list':
    console.log('\nSupported modules:');
    for (const [name, config] of Object.entries(MODULES)) {
      console.log(`\n  ${name}:`);
      console.log(`    Binding: ${config.bindingFile}`);
      console.log(`    Platforms: ${Object.keys(config.prebuilds).join(', ')}`);
    }
    console.log();
    break;
  default:
    console.log(`
Usage: bun scripts/patch-native-modules.ts <command> [options]

Commands:
  patch [platform]  Patch all native modules for Bun binary compilation
                    Platforms: linux-x64-glibc, linux-x64-musl, linux-arm64-glibc,
                               darwin-x64, darwin-arm64, win32-x64
  restore           Restore original bindings
  list              List supported modules and platforms

Examples:
  bun scripts/patch-native-modules.ts patch                    # Patch for current platform
  bun scripts/patch-native-modules.ts patch linux-x64-glibc    # Patch for Linux x64 (glibc)
  bun scripts/patch-native-modules.ts restore                  # Restore original
  bun scripts/patch-native-modules.ts list                     # Show supported modules
`);
    process.exit(1);
}
