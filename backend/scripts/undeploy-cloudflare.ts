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
  stagingDb: string | null;
  prodDb: string | null;
  stagingWorker: string | null;
  prodWorker: string | null;
  stagingBucket: string | null;
  prodBucket: string | null;
  stagingPages: string;
  prodPages: string;
} {
  if (!existsSync(WRANGLER_TOML)) {
    return {
      stagingDb: null,
      prodDb: null,
      stagingWorker: null,
      prodWorker: null,
      stagingBucket: null,
      prodBucket: null,
      stagingPages: 'inkweld-frontend-staging',
      prodPages: 'inkweld-frontend',
    };
  }

  const content = readFileSync(WRANGLER_TOML, 'utf-8');

  // Extract database names (not IDs - we need names for deletion)
  const stagingDbMatch = content.match(
    /\[env\.staging[\s\S]*?database_name\s*=\s*"([^"]+)"[\s\S]*?(?=\[env\.|$)/
  );
  const prodDbMatch = content.match(
    /\[env\.production[\s\S]*?database_name\s*=\s*"([^"]+)"[\s\S]*?(?=\[|$)/
  );

  // Extract worker names
  const stagingWorkerMatch = content.match(/\[env\.staging\][\s\S]*?name\s*=\s*"([^"]+)"/);
  const prodWorkerMatch = content.match(/\[env\.production\][\s\S]*?name\s*=\s*"([^"]+)"/);

  // Extract R2 bucket names
  const stagingBucketMatch = content.match(
    /\[\[env\.staging\.r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/
  );
  const prodBucketMatch = content.match(
    /\[\[env\.production\.r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/
  );

  return {
    stagingDb: stagingDbMatch?.[1] || null,
    prodDb: prodDbMatch?.[1] || null,
    stagingWorker: stagingWorkerMatch?.[1] || null,
    prodWorker: prodWorkerMatch?.[1] || null,
    stagingBucket: stagingBucketMatch?.[1] || null,
    prodBucket: prodBucketMatch?.[1] || null,
    // Pages projects - hardcoded names (not in wrangler.toml)
    stagingPages: 'inkweld-frontend-staging',
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
║   • Workers (staging and/or production)                        ║
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
    if (resources.stagingWorker) info(`  Staging Worker:      ${resources.stagingWorker}`);
    if (resources.prodWorker) info(`  Production Worker:   ${resources.prodWorker}`);
    if (resources.stagingDb) info(`  Staging Database:    ${resources.stagingDb}`);
    if (resources.prodDb) info(`  Production Database: ${resources.prodDb}`);
    if (resources.stagingBucket) info(`  Staging R2 Bucket:   ${resources.stagingBucket}`);
    if (resources.prodBucket) info(`  Production R2 Bucket: ${resources.prodBucket}`);
    info(`  Staging Pages:       ${resources.stagingPages}`);
    info(`  Production Pages:    ${resources.prodPages}`);
    console.log();

    // Ask which environments to delete
    let deleteStaging = false;
    let deleteProd = false;

    // Always offer to delete both since Pages projects always exist
    deleteStaging = await confirm(rl, 'Delete STAGING environment?');
    deleteProd = await confirm(rl, 'Delete PRODUCTION environment?');

    if (!deleteStaging && !deleteProd) {
      info('No environments selected. Undeploy cancelled.');
      process.exit(0);
    }

    // Final confirmation
    console.log();
    warn('About to delete:');
    if (deleteStaging) {
      if (resources.stagingWorker) warn(`  • Worker: ${resources.stagingWorker}`);
      if (resources.stagingDb) warn(`  • Database: ${resources.stagingDb} (ALL DATA WILL BE LOST)`);
      if (resources.stagingBucket)
        warn(`  • R2 Bucket: ${resources.stagingBucket} (ALL MEDIA WILL BE LOST)`);
      warn(`  • Pages: ${resources.stagingPages}`);
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

    if (deleteStaging && resources.stagingWorker) {
      info(`Deleting staging worker: ${resources.stagingWorker}...`);
      const result = runCommand('npx', ['wrangler', 'delete', '--env', 'staging', '--force']);
      if (result.success) {
        success(`Deleted worker: ${resources.stagingWorker}`);
      } else if (result.output.includes('not found')) {
        warn(`Worker ${resources.stagingWorker} not found (may already be deleted)`);
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

    if (deleteStaging && resources.stagingDb) {
      info(`Deleting staging database: ${resources.stagingDb}...`);
      const result = runCommand('npx', ['wrangler', 'd1', 'delete', resources.stagingDb, '-y']);
      if (result.success) {
        success(`Deleted database: ${resources.stagingDb}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Database ${resources.stagingDb} not found (may already be deleted)`);
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

    if (deleteStaging && resources.stagingBucket) {
      info(`Deleting staging R2 bucket: ${resources.stagingBucket}...`);
      const result = runCommand('npx', [
        'wrangler',
        'r2',
        'bucket',
        'delete',
        resources.stagingBucket,
      ]);
      if (result.success) {
        success(`Deleted R2 bucket: ${resources.stagingBucket}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Bucket ${resources.stagingBucket} not found (may already be deleted)`);
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

    if (deleteStaging) {
      info(`Deleting staging Pages project: ${resources.stagingPages}...`);
      const result = runCommand('npx', [
        'wrangler',
        'pages',
        'project',
        'delete',
        resources.stagingPages,
        '-y',
      ]);
      if (result.success) {
        success(`Deleted Pages project: ${resources.stagingPages}`);
      } else if (result.output.includes('not found') || result.output.includes('does not exist')) {
        warn(`Pages project ${resources.stagingPages} not found (may already be deleted)`);
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

    if (deleteStaging && deleteProd) {
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
