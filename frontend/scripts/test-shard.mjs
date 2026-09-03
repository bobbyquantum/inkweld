#!/usr/bin/env node
/**
 * Run one shard of the frontend unit tests.
 *
 * Usage: node scripts/test-shard.mjs <index>/<total> [extra ng test args]
 *
 * `ng test` has no --shard flag (unlike Playwright), so we split the spec
 * files ourselves: every spec under src/ is sorted, then dealt round-robin
 * across the shards and passed to `ng test --include`. Round-robin keeps
 * neighbouring (usually similarly-sized) specs on different shards, which
 * balances wall-clock better than contiguous chunks.
 *
 * Each shard writes coverage for the full source tree (untested files show
 * as 0%), so per-shard thresholds are meaningless - the `shard` configuration
 * in angular.json disables them. scripts/merge-lcov.mjs recombines the
 * shards' lcov.info files and enforces the real thresholds in CI.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [shardArg, ...extraArgs] = process.argv.slice(2);
const match = /^(\d+)\/(\d+)$/.exec(shardArg ?? '');
if (!match) {
  console.error(
    'Usage: node scripts/test-shard.mjs <index>/<total> [ng test args]'
  );
  process.exit(2);
}
const index = Number(match[1]);
const total = Number(match[2]);
if (index < 1 || index > total) {
  console.error(`Shard index ${index} must be between 1 and ${total}`);
  process.exit(2);
}

function listSpecs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSpecs(full, out);
    } else if (/\.(spec|test)\.ts$/.test(entry)) {
      out.push(relative(projectRoot, full));
    }
  }
  return out;
}

const allSpecs = listSpecs(join(projectRoot, 'src')).sort();
const shardSpecs = allSpecs.filter((_, i) => i % total === index - 1);

console.log(
  `Shard ${index}/${total}: running ${shardSpecs.length} of ${allSpecs.length} spec files`
);

const result = spawnSync(
  'npx',
  [
    'ng',
    'test',
    '--watch=false',
    '--configuration=shard',
    ...shardSpecs.flatMap(spec => ['--include', spec]),
    ...extraArgs,
  ],
  { cwd: projectRoot, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
