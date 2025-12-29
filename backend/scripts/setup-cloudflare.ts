/**
 * Cloudflare Setup Script
 *
 * Interactive script to help users configure Cloudflare Workers deployment.
 * Run with: npm run cloudflare:setup (from project root)
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..');
const WRANGLER_TOML = join(BACKEND_DIR, 'wrangler.toml');
const WRANGLER_EXAMPLE = join(BACKEND_DIR, 'wrangler.toml.example');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function warn(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function header(message: string) {
  console.log();
  log(`${'='.repeat(60)}`, colors.blue);
  log(`  ${message}`, colors.bright);
  log(`${'='.repeat(60)}`, colors.blue);
  console.log();
}

function runCommand(command: string, args: string[]): { success: boolean; output: string } {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    cwd: BACKEND_DIR,
    shell: true,
  });

  return {
    success: result.status === 0,
    output: result.stdout + result.stderr,
  };
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}${question}${colors.reset} `, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await prompt(rl, `${question} (y/n):`);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

function checkWranglerInstalled(): boolean {
  const result = runCommand('npx', ['wrangler', '--version']);
  return result.success;
}

function checkWranglerLoggedIn(): boolean {
  const result = runCommand('npx', ['wrangler', 'whoami']);
  return result.success && !result.output.includes('Not logged in');
}

function createD1Database(name: string): string | null {
  info(`Creating D1 database: ${name}...`);
  const result = runCommand('npx', ['wrangler', 'd1', 'create', name]);

  if (!result.success) {
    if (result.output.includes('already exists')) {
      warn(`Database "${name}" already exists. Fetching existing ID...`);
      return getD1DatabaseId(name);
    }
    error(`Failed to create database: ${result.output}`);
    return null;
  }

  // Parse database_id from output
  const match = result.output.match(/database_id\s*=\s*"([^"]+)"/);
  if (match) {
    success(`Created database "${name}" with ID: ${match[1]}`);
    return match[1];
  }

  error('Could not parse database ID from output');
  return null;
}

function getD1DatabaseId(name: string): string | null {
  const result = runCommand('npx', ['wrangler', 'd1', 'list', '--json']);
  if (!result.success) {
    return null;
  }

  try {
    const databases = JSON.parse(result.output);
    const db = databases.find((d: { name: string }) => d.name === name);
    if (db) {
      return db.uuid;
    }
  } catch {
    // JSON parse failed
  }
  return null;
}

function updateWranglerToml(devDbId: string, prodDbId: string): boolean {
  try {
    let content = readFileSync(WRANGLER_TOML, 'utf-8');

    content = content.replace(
      /database_id = "YOUR_DEV_DATABASE_ID_HERE"/g,
      `database_id = "${devDbId}"`
    );

    content = content.replace(
      /database_id = "YOUR_PROD_DATABASE_ID_HERE"/g,
      `database_id = "${prodDbId}"`
    );

    writeFileSync(WRANGLER_TOML, content);
    return true;
  } catch (e) {
    error(`Failed to update wrangler.toml: ${e}`);
    return false;
  }
}

async function main() {
  const rl = createReadlineInterface();

  try {
    header('Inkweld Cloudflare Setup');

    // Check prerequisites
    info('Checking prerequisites...');

    if (!checkWranglerInstalled()) {
      error('Wrangler CLI is not installed. Install it with: npm install -g wrangler');
      process.exit(1);
    }
    success('Wrangler CLI is installed');

    if (!checkWranglerLoggedIn()) {
      warn('You are not logged in to Cloudflare.');
      info('Run: npx wrangler login');
      const shouldLogin = await confirm(rl, 'Would you like to login now?');
      if (shouldLogin) {
        const result = runCommand('npx', ['wrangler', 'login']);
        if (!result.success) {
          error('Login failed. Please run "npx wrangler login" manually.');
          process.exit(1);
        }
      } else {
        error('You must be logged in to continue.');
        process.exit(1);
      }
    }
    success('Logged in to Cloudflare');

    // Check/create wrangler.toml
    if (!existsSync(WRANGLER_TOML)) {
      info('wrangler.toml not found. Copying from wrangler.toml.example...');
      copyFileSync(WRANGLER_EXAMPLE, WRANGLER_TOML);
      success('Created wrangler.toml');
    } else {
      warn('wrangler.toml already exists.');
      const shouldOverwrite = await confirm(rl, 'Overwrite with fresh template?');
      if (shouldOverwrite) {
        copyFileSync(WRANGLER_EXAMPLE, WRANGLER_TOML);
        success('Overwrote wrangler.toml');
      }
    }

    header('Creating D1 Databases');

    // Create development database
    const devDbId = createD1Database('inkweld_dev');
    if (!devDbId) {
      error('Failed to create development database');
      process.exit(1);
    }

    // Create production database
    const prodDbId = createD1Database('inkweld_prod');
    if (!prodDbId) {
      error('Failed to create production database');
      process.exit(1);
    }

    // Update wrangler.toml with database IDs
    header('Updating Configuration');

    if (updateWranglerToml(devDbId, prodDbId)) {
      success('Updated wrangler.toml with database IDs');
    } else {
      error('Failed to update wrangler.toml');
      info('Please manually update the database_id values:');
      info(`  Dev:  ${devDbId}`);
      info(`  Prod: ${prodDbId}`);
    }

    // Run migrations
    header('Running Database Migrations');

    const shouldMigrate = await confirm(rl, 'Run database migrations now?');
    if (shouldMigrate) {
      info('Running migrations on development database...');
      const devMigration = runCommand('npx', [
        'wrangler',
        'd1',
        'execute',
        'inkweld_dev',
        '--remote',
        '--file=./drizzle/0000_safe_mysterio.sql',
      ]);
      if (devMigration.success) {
        success('Dev database migrated');
      } else {
        warn('Dev migration may have issues. You can run it manually later.');
      }

      info('Running migrations on production database...');
      const prodMigration = runCommand('npx', [
        'wrangler',
        'd1',
        'execute',
        'inkweld_prod',
        '--remote',
        '--file=./drizzle/0000_safe_mysterio.sql',
      ]);
      if (prodMigration.success) {
        success('Production database migrated');
      } else {
        warn('Production migration may have issues. You can run it manually later.');
      }
    }

    // Set secrets
    header('Setting Secrets');

    info('You need to set a SESSION_SECRET for each environment.');
    info('This should be a random string of at least 32 characters.');
    console.log();

    const setSecrets = await confirm(rl, 'Would you like to set secrets now?');
    if (setSecrets) {
      const secret = await prompt(rl, 'Enter SESSION_SECRET (32+ chars):');
      if (secret.length >= 32) {
        info('Setting secret for dev environment...');
        runCommand('npx', ['wrangler', 'secret', 'put', 'SESSION_SECRET', '--env', 'dev']);

        info('Setting secret for production environment...');
        runCommand('npx', ['wrangler', 'secret', 'put', 'SESSION_SECRET', '--env', 'production']);
      } else {
        warn('Secret too short. Set it manually with:');
        info('  echo "your-secret" | npx wrangler secret put SESSION_SECRET --env dev');
        info('  echo "your-secret" | npx wrangler secret put SESSION_SECRET --env production');
      }
    }

    // Summary
    header('Setup Complete! 🎉');

    console.log(`
${colors.green}Your Cloudflare Workers deployment is configured!${colors.reset}

${colors.bright}Database IDs:${colors.reset}
  Development: ${devDbId}
  Production:  ${prodDbId}

${colors.bright}Next Steps:${colors.reset}

1. ${colors.cyan}Review wrangler.toml${colors.reset}
   Update ALLOWED_ORIGINS with your actual frontend domain(s)

2. ${colors.cyan}Deploy to development (from project root)${colors.reset}
   npm run cloudflare:deploy:dev

3. ${colors.cyan}Deploy to production (from project root)${colors.reset}
   npm run cloudflare:deploy:prod

4. ${colors.cyan}View logs (from project root)${colors.reset}
   npm run cloudflare:logs:dev
   npm run cloudflare:logs:prod

${colors.bright}Full documentation:${colors.reset} docs/site/docs/hosting/cloudflare.md
`);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
