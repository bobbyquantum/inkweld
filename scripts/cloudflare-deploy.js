#!/usr/bin/env node

/**
 * Cloudflare Pages Deployment Helper
 *
 * This script wraps wrangler pages deploy to always use --branch main,
 * ensuring manual deployments from any branch go live immediately.
 *
 * Usage: node scripts/cloudflare-deploy.js <project-name> <dist-path> [--dry-run]
 *
 * Examples:
 *   node scripts/cloudflare-deploy.js inkweld-frontend dist/browser
 *   node scripts/cloudflare-deploy.js inkweld-frontend-preview dist/browser
 *   node scripts/cloudflare-deploy.js inkweld-frontend dist/browser --dry-run
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

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filteredArgs = args.filter((arg) => arg !== "--dry-run");

  if (filteredArgs.length < 2) {
    log(
      colors.red,
      "Usage: node scripts/cloudflare-deploy.js <project-name> <dist-path> [--dry-run]",
    );
    log(
      colors.red,
      "Example: node scripts/cloudflare-deploy.js inkweld-frontend dist/browser",
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

  log(
    colors.green,
    `\n🚀 Deploying with: wrangler ${wranglerArgs.join(" ")}\n`,
  );

  if (dryRun) {
    log(colors.yellow, "🔍 Dry run mode - skipping actual deployment");
    log(colors.green, "\n✅ Dry run complete");
    return;
  }

  // Run wrangler via npx to ensure we use the project's version
  const result = spawnSync("npx", ["wrangler", ...wranglerArgs], {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });

  if (result.status !== 0) {
    log(colors.red, "\n❌ Deployment failed");
    process.exit(result.status || 1);
  }

  log(colors.green, "\n✅ Pages deployment complete");
}

main();
