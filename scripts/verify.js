#!/usr/bin/env node

/**
 * Cross-platform verify script with tiered modes and parallelization.
 *
 * Modes (set via VERIFY_MODE env var or --mode flag):
 *   fast  (default) - typecheck + lint + unit tests (no e2e, no docs screenshots)
 *   e2e             - fast + e2e tests (prebuilt prod serve)
 *   full            - everything including docs build with screenshots
 *
 * Examples:
 *   bun run verify                     # fast mode
 *   bun run verify:e2e                 # e2e mode
 *   bun run verify:full                # full mode
 *   VERIFY_MODE=e2e bun run verify     # e2e mode via env
 */

import { spawn } from "child_process";

const startTime = Date.now();

// ---------------------------------------------------------------------------
// Parse mode from --mode flag or VERIFY_MODE env
// ---------------------------------------------------------------------------
function getMode() {
  const flagIndex = process.argv.indexOf("--mode");
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1];
  }
  return process.env.VERIFY_MODE || "fast";
}

const mode = getMode();
const validModes = ["fast", "e2e", "full"];
if (!validModes.includes(mode)) {
  console.error(
    `Unknown verify mode: "${mode}". Valid modes: ${validModes.join(", ")}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step runner with per-step timing
// ---------------------------------------------------------------------------
async function runCommand(name, command, args) {
  const stepStart = Date.now();
  return new Promise((resolve, reject) => {
    console.log(`\n\x1b[36m>\x1b[0m Running ${name}...\n`);

    const isWindows = process.platform === "win32";

    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: isWindows,
      cwd: process.cwd(),
    });

    proc.on("close", (code) => {
      const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`\x1b[32m  ${name} passed\x1b[0m (${elapsed}s)`);
        resolve();
      } else {
        reject(
          new Error(`${name} failed with exit code ${code} (${elapsed}s)`),
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start ${name}: ${err.message}`));
    });
  });
}

/**
 * Run an array of steps in parallel; reject on first failure.
 */
async function runParallel(steps) {
  await Promise.all(steps.map((s) => runCommand(s.name, s.command, s.args)));
}

/**
 * Run an array of steps sequentially.
 */
async function runSerial(steps) {
  for (const s of steps) {
    await runCommand(s.name, s.command, s.args);
  }
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

// Phase 1 — fast checks (can all run in parallel since they're read-only)
const fastParallelSteps = [
  // Frontend lint is type-aware (recommendedTypeChecked), so it already
  // does a full TS project load. Running a separate frontend typecheck
  // on top of that is redundant — we only run the backend typecheck here.
  {
    name: "typecheck:backend",
    command: "npm",
    args: ["run", "typecheck:backend"],
  },
  { name: "lint:frontend", command: "npm", args: ["run", "lint:frontend"] },
  { name: "lint:backend", command: "npm", args: ["run", "lint:backend"] },
];

// Phase 2 — unit tests (run after lint to fail fast on obvious issues)
// Frontend and backend tests can run in parallel.
const unitTestSteps = [
  { name: "test:frontend", command: "npm", args: ["run", "test:frontend"] },
  { name: "test:backend", command: "npm", args: ["run", "test:backend"] },
];

// Phase 3 — e2e tests (expensive, requires build + servers)
const e2eSteps = [{ name: "e2e:ci", command: "npm", args: ["run", "e2e:ci"] }];

// Phase 4 — docs build (full mode only, includes screenshot generation)
const docsSteps = [
  { name: "verify:docs", command: "npm", args: ["run", "verify:docs"] },
];

// Docs build without screenshots (used in fast + e2e modes)
const docsLiteSteps = [
  {
    name: "verify:docs:lite",
    command: "npm",
    args: ["run", "verify:docs:lite"],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n\x1b[1m--- verify (${mode}) ---\x1b[0m\n`);

  try {
    // Phase 1 — lint + backend typecheck in parallel
    await runParallel(fastParallelSteps);

    // Phase 2 — unit tests in parallel
    await runParallel(unitTestSteps);

    // Phase 3 — e2e (only in e2e and full modes)
    if (mode === "e2e" || mode === "full") {
      await runSerial(e2eSteps);
    }

    // Phase 4 — docs
    if (mode === "full") {
      // Full docs build with screenshot generation
      await runSerial(docsSteps);
    } else {
      // Lite docs build (no screenshots)
      await runSerial(docsLiteSteps);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `\n\x1b[32m--- verify (${mode}) passed in ${elapsed}s ---\x1b[0m\n`,
    );
    process.exit(0);
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n\x1b[31m${error.message}\x1b[0m`);
    console.error(
      `\n\x1b[31m--- verify (${mode}) failed after ${elapsed}s ---\x1b[0m\n`,
    );
    process.exit(1);
  }
}

main();
