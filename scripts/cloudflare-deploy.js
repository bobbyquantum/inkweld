#!/usr/bin/env node

/**
 * Cloudflare Pages Deployment Helper
 *
 * This script wraps wrangler pages deploy to always use --branch main,
 * ensuring manual deployments from any branch go live immediately.
 *
 * Usage: node scripts/cloudflare-deploy.js <project-name> <dist-path> [--dry-run] [--retries N]
 *
 * Examples:
 *   node scripts/cloudflare-deploy.js inkweld-frontend dist/browser
 *   node scripts/cloudflare-deploy.js inkweld-frontend-preview dist/browser
 *   node scripts/cloudflare-deploy.js inkweld-frontend dist/browser --dry-run
 *   node scripts/cloudflare-deploy.js inkweld-frontend-preview dist/browser --retries 3
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function getCurrentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deployWithRetry(wranglerArgs, maxRetries = 3, baseDelay = 5000) {
  const maxAttempts = maxRetries + 1; // 1 initial attempt + maxRetries retries
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(colors.green, `\n🚀 Deploying (attempt ${attempt}/${maxAttempts}): wrangler ${wranglerArgs.join(" ")}\n`);

    const result = spawnSync("npx", ["wrangler", ...wranglerArgs], {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });

    if (result.status === 0) {
      log(colors.green, "\n✅ Pages deployment complete");
      return true;
    }

    if (attempt < maxAttempts) {
      const delay = baseDelay * Math.pow(2, attempt - 1); // exponential backoff
      log(colors.yellow, `\n⚠️  Deployment failed (exit code: ${result.status || 1}). Retrying in ${delay / 1000}s...`);
      await sleep(delay);
    } else {
      log(colors.red, `\n❌ Deployment failed after ${maxAttempts} attempt(s)`);
      return false;
    }
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const retriesIndex = args.indexOf("--retries");
  let maxRetries = 3; // default

  if (retriesIndex !== -1 && args[retriesIndex + 1]) {
    maxRetries = parseInt(args[retriesIndex + 1], 10) || 3;
  }

  const retriesValue = retriesIndex !== -1 ? args[retriesIndex + 1] : null;
  const filteredArgs = args.filter((arg) => arg !== "--dry-run" && arg !== "--retries" && arg !== retriesValue);

  if (filteredArgs.length < 2) {
    log(
      colors.red,
      "Usage: node scripts/cloudflare-deploy.js <project-name> <dist-path> [--dry-run] [--retries N]",
    );
    log(
      colors.red,
      "Example: node scripts/cloudflare-deploy.js inkweld-frontend dist/browser",
    );
    log(
      colors.red,
      "Example: node scripts/cloudflare-deploy.js inkweld-frontend-preview dist/browser --retries 3",
    );
    process.exit(1);
  }

  const [projectName, distPath] = filteredArgs;
  const currentBranch = getCurrentBranch();

  log(colors.cyan, `\n📦 Cloudflare Pages Deploy`);
  log(colors.cyan, `========================`);
  log(colors.reset, `   Project: ${colors.bold}${projectName}${colors.reset}`);
  log(colors.reset, `   Path:    ${colors.bold}${distPath}${colors.reset}`);
  log(
    colors.reset,
    `   Branch:  ${colors.bold}${currentBranch}${colors.reset}`,
  );
  log(colors.reset, `   Retries: ${colors.bold}${maxRetries}${colors.reset}`);
  if (dryRun) {
    log(colors.yellow, `   Mode:    ${colors.bold}DRY RUN${colors.reset}`);
  }

  // Warn if not on main branch
  if (currentBranch !== "main") {
    log(
      colors.yellow,
      `\n⚠️  WARNING: You are on branch '${currentBranch}', not 'main'.`,
    );
    log(
      colors.yellow,
      `   This deployment will use --branch main to go live immediately.`,
    );
    log(
      colors.yellow,
      `   The deployed version will be treated as a production deployment.\n`,
    );
  }

  // Build the wrangler command with --branch main
  const wranglerArgs = [
    "pages",
    "deploy",
    distPath,
    "--project-name",
    projectName,
    "--branch",
    "main",
  ];

  if (dryRun) {
    log(colors.yellow, "🔍 Dry run mode - skipping actual deployment");
    log(colors.green, "\n✅ Dry run complete");
    return;
  }

  const success = await deployWithRetry(wranglerArgs, maxRetries);
  if (!success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
