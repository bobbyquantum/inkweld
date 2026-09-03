#!/usr/bin/env node
/**
 * Merge lcov.info files from sharded test runs and enforce coverage thresholds.
 *
 * Usage: node scripts/merge-lcov.mjs --out <merged.info> <input.info>...
 *
 * Every shard reports the whole source tree (files with no executed tests
 * appear with zero hits), so merging is a per-file sum of hit counts keyed
 * by line, function name and branch id. Thresholds mirror
 * `coverageThresholds` in angular.json and are checked on the merged totals,
 * which is what the unsharded `ng test` run would have enforced.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const THRESHOLDS = { lines: 80, functions: 80, statements: 80, branches: 60 };

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
if (outIdx === -1 || args.length < outIdx + 2) {
  console.error(
    'Usage: node scripts/merge-lcov.mjs --out <merged.info> <input.info>...'
  );
  process.exit(2);
}
const outPath = args[outIdx + 1];
const inputs = args.filter((_, i) => i !== outIdx && i !== outIdx + 1);
if (inputs.length === 0) {
  console.error('No input lcov files given');
  process.exit(2);
}

/** @type {Map<string, {fnLines: Map<string, number>, fnHits: Map<string, number>, lines: Map<number, number>, branches: Map<string, {line: number, block: string, branch: string, hits: number}>}>} */
const files = new Map();

function fileRecord(name) {
  let rec = files.get(name);
  if (!rec) {
    rec = {
      fnLines: new Map(),
      fnHits: new Map(),
      lines: new Map(),
      branches: new Map(),
    };
    files.set(name, rec);
  }
  return rec;
}

const num = value => (value === '-' ? 0 : Number(value));

for (const input of inputs) {
  let current = null;
  for (const raw of readFileSync(input, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'end_of_record') {
      current = null;
      continue;
    }
    const sep = line.indexOf(':');
    const key = sep === -1 ? line : line.slice(0, sep);
    const value = sep === -1 ? '' : line.slice(sep + 1);
    switch (key) {
      case 'SF':
        current = fileRecord(value);
        break;
      case 'FN': {
        const comma = value.indexOf(',');
        current.fnLines.set(
          value.slice(comma + 1),
          Number(value.slice(0, comma))
        );
        break;
      }
      case 'FNDA': {
        const comma = value.indexOf(',');
        const name = value.slice(comma + 1);
        current.fnHits.set(
          name,
          (current.fnHits.get(name) ?? 0) + num(value.slice(0, comma))
        );
        break;
      }
      case 'DA': {
        const [lineNo, hits] = value.split(',');
        const n = Number(lineNo);
        current.lines.set(n, (current.lines.get(n) ?? 0) + num(hits));
        break;
      }
      case 'BRDA': {
        const [lineNo, block, branch, hits] = value.split(',');
        const id = `${lineNo},${block},${branch}`;
        const existing = current.branches.get(id);
        if (existing) {
          existing.hits += num(hits);
        } else {
          current.branches.set(id, {
            line: Number(lineNo),
            block,
            branch,
            hits: num(hits),
          });
        }
        break;
      }
      default:
        // TN, FNF, FNH, LF, LH, BRF, BRH are recomputed on output.
        break;
    }
  }
}

const totals = { lines: [0, 0], functions: [0, 0], branches: [0, 0] };
const out = [];

for (const [name, rec] of [...files.entries()].sort(([a], [b]) =>
  a.localeCompare(b)
)) {
  out.push('TN:', `SF:${name}`);
  for (const [fn, line] of rec.fnLines) out.push(`FN:${line},${fn}`);
  let fnHit = 0;
  for (const [fn] of rec.fnLines) {
    const hits = rec.fnHits.get(fn) ?? 0;
    if (hits > 0) fnHit++;
    out.push(`FNDA:${hits},${fn}`);
  }
  out.push(`FNF:${rec.fnLines.size}`, `FNH:${fnHit}`);
  totals.functions[0] += rec.fnLines.size;
  totals.functions[1] += fnHit;

  let lineHit = 0;
  for (const [lineNo, hits] of [...rec.lines.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    if (hits > 0) lineHit++;
    out.push(`DA:${lineNo},${hits}`);
  }
  out.push(`LF:${rec.lines.size}`, `LH:${lineHit}`);
  totals.lines[0] += rec.lines.size;
  totals.lines[1] += lineHit;

  let brHit = 0;
  for (const br of rec.branches.values()) {
    if (br.hits > 0) brHit++;
    out.push(`BRDA:${br.line},${br.block},${br.branch},${br.hits}`);
  }
  out.push(`BRF:${rec.branches.size}`, `BRH:${brHit}`);
  totals.branches[0] += rec.branches.size;
  totals.branches[1] += brHit;

  out.push('end_of_record');
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out.join('\n') + '\n');

const pct = ([found, hit]) => (found === 0 ? 100 : (hit / found) * 100);
// lcov has no statement records; v8 coverage reports statements as lines.
const results = {
  lines: pct(totals.lines),
  statements: pct(totals.lines),
  functions: pct(totals.functions),
  branches: pct(totals.branches),
};

console.log(
  `Merged ${inputs.length} lcov files (${files.size} source files) -> ${outPath}`
);
let failed = false;
for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
  const actual = results[metric];
  const ok = actual >= threshold;
  if (!ok) failed = true;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'} ${metric.padEnd(10)} ${actual.toFixed(2)}% (threshold ${threshold}%)`
  );
}
if (failed) {
  console.error('Coverage thresholds not met');
  process.exit(1);
}
