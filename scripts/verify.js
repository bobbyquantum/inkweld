#!/usr/bin/env node

/**
 * Cross-platform verify script
 * Runs typecheck, lint, tests, and docs build with timing
 */

import { spawn } from "child_process";

const startTime = Date.now();

const steps = [
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "verify:backend", command: "npm", args: ["run", "verify:backend"] },
  { name: "verify:frontend", command: "npm", args: ["run", "verify:frontend"] },
  { name: "verify:docs", command: "npm", args: ["run", "verify:docs"] },
];

async function runCommand(name, command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 Running ${name}...\n`);

    const isWindows = process.platform === "win32";
    const shell = isWindows ? true : false;

    const proc = spawn(command, args, {
      stdio: "inherit",
      shell,
      cwd: process.cwd(),
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${name} failed with exit code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start ${name}: ${err.message}`));
    });
  });
}

async function main() {
  console.log("🔍 Starting verification...\n");

  try {
    for (const step of steps) {
      await runCommand(step.name, step.command, step.args);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Verify completed in ${elapsed} seconds\n`);
    process.exit(0);
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ ${error.message}`);
    console.error(`\n⏱️  Failed after ${elapsed} seconds\n`);
    process.exit(1);
  }
}

main();
