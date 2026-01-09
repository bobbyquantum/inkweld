#!/usr/bin/env bun
/**
 * Inkweld Cloudflare Undeploy Script
 *
 * This script removes ALL Cloudflare resources created by Inkweld.
 * USE WITH EXTREME CAUTION - This is destructive and irreversible!
 *
 * Run from project root: npm run cloudflare:undeploy
 */

import { spawnSync } from 'child_process';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';

const BACKEND_DIR = join(import.meta.dirname, '..');
const WRANGLER_TOML = join(BACKEND_DIR, 'wrangler.toml');

// Colors for terminal output
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function error(msg: string) {
  console.log(`${RED}✗ ${msg}${RESET}`);
}
function warn(msg: string) {
  console.log(`${YELLOW}⚠ ${msg}${RESET}`);
}
function success(msg: string) {
  console.log(`${GREEN}✓ ${msg}${RESET}`);
}
function info(msg: string) {
  console.log(`${CYAN}ℹ ${msg}${RESET}`);
}
function header(msg: string) {
  console.log(`\n${BOLD}${CYAN}=== ${msg} ===${RESET}\n`);
}

function runCommand(command: string, args: string[]): { success: boolean; output: string } {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    cwd: BACKEND_DIR,
    shell: true,
  });
  return {
    success: result.status === 0,
    output: (result.stdout || '') + (result.stderr || ''),
  };
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question} `, resolve);
  });
}

async function confirm(rl: ReturnType<typeof createInterface>, question: string): Promise<boolean> {
  const answer = await prompt(rl, `${question} (yes/no):`);
  return answer.toLowerCase() === 'yes';
}

function getConfiguredResources(): {
  previewDb: string | null;
  prodDb: string | null;
  previewWorker: string | null;
  prodWorker: string | null;
  previewBucket: string | null;
  prodBucket: string | null;
  previewPages: string;
  prodPages: string;
} {
  if (!existsSync(WRANGLER_TOML)) {
    return {
      previewDb: null,
      prodDb: null,
      previewWorker: null,
      prodWorker: null,
      previewBucket: null,
      prodBucket: null,
      previewPages: 'inkweld-frontend-preview',
      prodPages: 'inkweld-frontend',
    };
  }

  const content = readFileSync(WRANGLER_TOML, 'utf-8');

  // Extract database names (not IDs - we need names for deletion)
  const previewDbMatch = content.match(
    /\[env\.preview[\s\S]*?database_name\s*=\s*"([^"]+)"[\s\S]*?(?=\[env\.|$)/
  );
  const prodDbMatch = content.match(
    /\[env\.production[\s\S]*?database_name\s*=\s*"([^"]+)"[\s\S]*?(?=\[|$)/
  );

  // Extract worker names
  const previewWorkerMatch = content.match(/\[env\.preview\][\s\S]*?name\s*=\s*"([^"]+)"/);
  const prodWorkerMatch = content.match(/\[env\.production\][\s\S]*?name\s*=\s*"([^"]+)"/);

  // Extract R2 bucket names
  const previewBucketMatch = content.match(
    /\[\[env\.preview\.r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/
  );
  const prodBucketMatch = content.match(
    /\[\[env\.production\.r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/
  );

  return {
    previewDb: previewDbMatch?.[1] || null,
    prodDb: prodDbMatch?.[1] || null,
    previewWorker: previewWorkerMatch?.[1] || null,
    prodWorker: prodWorkerMatch?.[1] || null,
    previewBucket: previewBucketMatch?.[1] || null,
    prodBucket: prodBucketMatch?.[1] || null,
    // Pages projects - hardcoded names (not in wrangler.toml)
    previewPages: 'inkweld-frontend-preview',
    prodPages: 'inkweld-frontend',
  };
}

async function main() {
  console.log(`
${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗
║                                                                ║
║   ⚠️  CLOUDFLARE UNDEPLOY - DESTRUCTIVE OPERATION ⚠️             ║
║                                                                ║
║   This will PERMANENTLY DELETE:                                ║
║   • Workers (preview and/or production)                        ║
║   • D1 Databases (and ALL DATA within them)                    ║
║   • Durable Objects (and ALL collaborative editing data)       ║
║   • Your local wrangler.toml configuration                     ║
║                                                                ║
║   THIS CANNOT BE UNDONE!                                       ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝${RESET}
`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // First confirmation
    const firstConfirm = await confirm(
      rl,
      `${RED}Do you understand this will DELETE ALL DATA?${RESET}`
    );
    if (!firstConfirm) {
      info('Undeploy cancelled.');
      process.exit(0);
    }

    // Type confirmation
    const typeConfirm = await prompt(rl, `${RED}Type "DELETE EVERYTHING" to confirm:${RESET}`);
    if (typeConfirm !== 'DELETE EVERYTHING') {
      info('Confirmation text did not match. Undeploy cancelled.');
      process.exit(0);
    }

    // Detect configured resources
    header('Detecting Configured Resources');
    const resources = getConfiguredResources();

    if (!existsSync(WRANGLER_TOML)) {
      warn('No wrangler.toml found. Nothing to undeploy.');
      process.exit(0);
    }

    info('Found the following resources:');
    if (resources.previewWorker) info(`  Preview Worker:      ${resources.previewWorker}`);
    if (resources.prodWorker) info(`  Production Worker:   ${resources.prodWorker}`);
    if (resources.previewDb) info(`  Preview Database:    ${resources.previewDb}`);
    if (resources.prodDb) info(`  Production Database: ${resources.prodDb}`);
    if (resources.previewBucket) info(`  Preview R2 Bucket:   ${resources.previewBucket}`);
    if (resources.prodBucket) info(`  Production R2 Bucket: ${resources.prodBucket}`);
    info(`  Preview Pages:       ${resources.previewPages}`);
    info(`  Production Pages:    ${resources.prodPages}`);
    console.log();

    // Ask which environments to delete
    let deletePreview = false;
    let deleteProd = false;

    // Always offer to delete both since Pages projects always exist
    deletePreview = await confirm(rl, 'Delete PREVIEW environment?');
    deleteProd = await confirm(rl, 'Delete PRODUCTION environment?');

    if (!deletePreview && !deleteProd) {
      info('No environments selected. Undeploy cancelled.');
      process.exit(0);
    }

    // Final confirmation
    console.log();
    warn('About to delete:');
    if (deletePreview) {
      if (resources.previewWorker) warn(`  • Worker: ${resources.previewWorker}`);
      if (resources.previewDb) warn(`  • Database: ${resources.previewDb} (ALL DATA WILL BE LOST)`);
      if (resources.previewBucket)
        warn(`  • R2 Bucket: ${resources.previewBucket} (ALL MEDIA WILL BE LOST)`);
      warn(`  • Pages: ${resources.previewPages}`);
    }
    if (deleteProd) {
      if (resources.prodWorker) warn(`  • Worker: ${resources.prodWorker}`);
      if (resources.prodDb) warn(`  • Database: ${resources.prodDb} (ALL DATA WILL BE LOST)`);
      if (resources.prodBucket)
        warn(`  • R2 Bucket: ${resources.prodBucket} (ALL MEDIA WILL BE LOST)`);
      warn(`  • Pages: ${resources.prodPages}`);
    }
    console.log();

    const finalConfirm = await confirm(
      rl,
      `${RED}${BOLD}LAST CHANCE: Proceed with deletion?${RESET}`
    );
    if (!finalConfirm) {
      info('Undeploy cancelled.');
      process.exit(0);
    }

    // Delete workers
    header('Deleting Workers');

    if (deletePreview && resources.previewWorker) {
      info(`Deleting preview worker: ${resources.previewWorker}...`);
      const result = runCommand('npx', ['wrangler', 'delete', '--env', 'preview', '--force']);
      if (result.success) {
        success(`Deleted worker: ${resources.previewWorker}`);
      } else if (result.output.includes('not found')) {
        warn(`Worker ${resources.previewWorker} not found (may already be deleted)`);
      } else {
        error(`Failed to delete worker: ${result.output}`);
      }
    }

    if (deleteProd && resources.prodWorker) {
      info(`Deleting production worker: ${resources.prodWorker}...`);
      const result = runCommand('npx', ['wrangler', 'delete', '--env', 'production', '--force']);
      if (result.success) {
        success(`Deleted worker: ${resources.prodWorker}`);
      } else if (result.output.includes('not found')) {
        warn(`Worker ${resources.prodWorker} not found (may already be deleted)`);
      } else {
        error(`Failed to delete worker: ${result.output}`);
      }
    }

    // Delete databases
    header('Deleting D1 Databases');

    if (deletePreview && resources.previewDb) {
      info(`Deleting preview database: ${resources.previewDb}...`);
      const result = runCommand('npx', ['wrangler', 'd1', 'delete', resources.previewDb, '-y']);
      if (result.success) {
        success(`Deleted database: ${resources.previewDb}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Database ${resources.previewDb} not found (may already be deleted)`);
      } else {
        error(`Failed to delete database: ${result.output}`);
      }
    }

    if (deleteProd && resources.prodDb) {
      info(`Deleting production database: ${resources.prodDb}...`);
      const result = runCommand('npx', ['wrangler', 'd1', 'delete', resources.prodDb, '-y']);
      if (result.success) {
        success(`Deleted database: ${resources.prodDb}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Database ${resources.prodDb} not found (may already be deleted)`);
      } else {
        error(`Failed to delete database: ${result.output}`);
      }
    }

    // Delete R2 buckets
    header('Deleting R2 Storage Buckets');

    if (deletePreview && resources.previewBucket) {
      info(`Deleting preview R2 bucket: ${resources.previewBucket}...`);
      const result = runCommand('npx', [
        'wrangler',
        'r2',
        'bucket',
        'delete',
        resources.previewBucket,
      ]);
      if (result.success) {
        success(`Deleted R2 bucket: ${resources.previewBucket}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Bucket ${resources.previewBucket} not found (may already be deleted)`);
      } else {
        error(`Failed to delete bucket: ${result.output}`);
      }
    }

    if (deleteProd && resources.prodBucket) {
      info(`Deleting production R2 bucket: ${resources.prodBucket}...`);
      const result = runCommand('npx', [
        'wrangler',
        'r2',
        'bucket',
        'delete',
        resources.prodBucket,
      ]);
      if (result.success) {
        success(`Deleted R2 bucket: ${resources.prodBucket}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Bucket ${resources.prodBucket} not found (may already be deleted)`);
      } else {
        error(`Failed to delete bucket: ${result.output}`);
      }
    }

    // Delete Pages projects
    header('Deleting Cloudflare Pages Projects');

    if (deletePreview) {
      info(`Deleting preview Pages project: ${resources.previewPages}...`);
      const result = runCommand('npx', [
        'wrangler',
        'pages',
        'project',
        'delete',
        resources.previewPages,
        '-y',
      ]);
      if (result.success) {
        success(`Deleted Pages project: ${resources.previewPages}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Pages project ${resources.previewPages} not found (may already be deleted)`);
      } else {
        error(`Failed to delete Pages project: ${result.output}`);
      }
    }

    if (deleteProd) {
      info(`Deleting production Pages project: ${resources.prodPages}...`);
      const result = runCommand('npx', [
        'wrangler',
        'pages',
        'project',
        'delete',
        resources.prodPages,
        '-y',
      ]);
      if (result.success) {
        success(`Deleted Pages project: ${resources.prodPages}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Pages project ${resources.prodPages} not found (may already be deleted)`);
      } else {
        error(`Failed to delete Pages project: ${result.output}`);
      }
    }

    // Delete wrangler.toml
    header('Cleanup');

    if (deletePreview && deleteProd) {
      // Only delete wrangler.toml if BOTH environments are deleted
      const deleteConfig = await confirm(rl, 'Delete wrangler.toml configuration file?');
      if (deleteConfig) {
        try {
          unlinkSync(WRANGLER_TOML);
          success('Deleted wrangler.toml');
        } catch (e) {
          error(`Failed to delete wrangler.toml: ${e}`);
        }
      } else {
        info('Kept wrangler.toml (you may want to manually update it)');
      }
    } else {
      info('Keeping wrangler.toml since not all environments were deleted');
      warn('You should manually update wrangler.toml to remove deleted environment config');
    }

    // Summary
    header('Undeploy Complete');
    success('Selected Cloudflare resources have been deleted.');
    console.log();
    info('Note: Secrets are automatically deleted with their workers.');

    rl.close();
  } catch (err) {
    error(`Unexpected error: ${err}`);
    rl.close();
    process.exit(1);
  }
}

main();
