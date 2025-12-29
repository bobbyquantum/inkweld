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
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..');
const PROJECT_ROOT = join(BACKEND_DIR, '..');
const FRONTEND_ENV_DIR = join(PROJECT_ROOT, 'frontend', 'src', 'environments');
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

function generateSecret(length: number = 48): string {
  return randomBytes(length).toString('base64url');
}

function setSecret(envName: string, secretName: string, secretValue: string): boolean {
  info(`Setting ${secretName} for ${envName} environment...`);
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', secretName, '--env', envName], {
    encoding: 'utf-8',
    cwd: BACKEND_DIR,
    shell: true,
    input: secretValue + '\n',
  });
  return result.status === 0;
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
      success(`Found existing database "${name}" with ID: ${db.uuid}`);
      return db.uuid;
    }
  } catch {
    // JSON parse failed
  }
  return null;
}

function updateWranglerToml(stagingDbId: string | null, prodDbId: string | null): boolean {
  try {
    let content = readFileSync(WRANGLER_TOML, 'utf-8');

    if (stagingDbId) {
      content = content.replace(
        /database_id = "YOUR_STAGING_DATABASE_ID_HERE"/g,
        `database_id = "${stagingDbId}"`
      );
    }

    if (prodDbId) {
      content = content.replace(
        /database_id = "YOUR_PROD_DATABASE_ID_HERE"/g,
        `database_id = "${prodDbId}"`
      );
    }

    writeFileSync(WRANGLER_TOML, content);
    return true;
  } catch (e) {
    error(`Failed to update wrangler.toml: ${e}`);
    return false;
  }
}

function runMigration(dbName: string, envName: string): boolean {
  info(`Running migrations on ${dbName}...`);
  // Use 'd1 migrations apply' to properly track migrations
  const envFlag = envName.toLowerCase() === 'staging' ? 'staging' : 'production';
  const result = runCommand('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    dbName,
    '--env',
    envFlag,
    '--remote',
  ]);
  if (result.success) {
    success(`${envName} database migrated`);
    return true;
  } else {
    warn(`${envName} migration may have issues. You can run it manually later.`);
    warn(`Try: npx wrangler d1 migrations apply ${dbName} --env ${envFlag} --remote`);
    return false;
  }
}

function createR2Bucket(name: string): boolean {
  info(`Creating R2 bucket: ${name}...`);
  const result = runCommand('npx', ['wrangler', 'r2', 'bucket', 'create', name]);

  if (!result.success) {
    if (result.output.includes('already exists')) {
      warn(`Bucket "${name}" already exists.`);
      return true; // Already exists is fine
    }
    error(`Failed to create bucket: ${result.output}`);
    return false;
  }

  success(`Created R2 bucket: ${name}`);
  return true;
}

function createPagesProject(name: string): boolean {
  info(`Creating Pages project: ${name}...`);
  const result = runCommand('npx', [
    'wrangler',
    'pages',
    'project',
    'create',
    name,
    '--production-branch',
    'main',
  ]);

  if (!result.success) {
    if (
      result.output.includes('already exists') ||
      result.output.includes('A project with this name already exists')
    ) {
      warn(`Pages project "${name}" already exists.`);
      return true;
    }
    error(`Failed to create Pages project: ${result.output}`);
    return false;
  }

  success(`Created Pages project: ${name}`);
  return true;
}

function generateFrontendEnvironment(
  subdomain: string,
  envType: 'staging' | 'cloudflare'
): boolean {
  const filename = `environment.${envType}.ts`;
  const filepath = join(FRONTEND_ENV_DIR, filename);
  const examplePath = join(FRONTEND_ENV_DIR, `${filename}.example`);

  // Check if example file exists
  if (!existsSync(examplePath)) {
    error(`Template file not found: ${filename}.example`);
    return false;
  }

  try {
    let content = readFileSync(examplePath, 'utf-8');
    content = content.replace(/YOUR_SUBDOMAIN/g, subdomain);
    writeFileSync(filepath, content);
    success(`Generated ${filename}`);
    return true;
  } catch (e) {
    error(`Failed to generate ${filename}: ${e}`);
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

    // Ask which environments to set up
    header('Environment Selection');

    console.log(`
${colors.bright}Available environments:${colors.reset}

  ${colors.cyan}staging${colors.reset}     - Pre-production environment for testing
                 Deploys to: inkweld-backend-staging.workers.dev

  ${colors.cyan}production${colors.reset}  - Live production environment
                 Deploys to: inkweld-backend-prod.workers.dev

${colors.yellow}Note:${colors.reset} For local development, use "wrangler dev" (no setup needed).
`);

    const setupStaging = await confirm(rl, 'Set up STAGING environment?');
    const setupProd = await confirm(rl, 'Set up PRODUCTION environment?');

    if (!setupStaging && !setupProd) {
      warn('No environments selected. Exiting.');
      process.exit(0);
    }

    // Create databases
    header('Creating D1 Databases');

    let stagingDbId: string | null = null;
    let prodDbId: string | null = null;

    if (setupStaging) {
      stagingDbId = createD1Database('inkweld_staging');
      if (!stagingDbId) {
        error('Failed to create staging database');
        if (!setupProd) process.exit(1);
      }
    }

    if (setupProd) {
      prodDbId = createD1Database('inkweld_prod');
      if (!prodDbId) {
        error('Failed to create production database');
        process.exit(1);
      }
    }

    // Create R2 buckets for media storage
    header('Creating R2 Storage Buckets');

    info('R2 buckets store media files: project covers, avatars, inline images, etc.');

    if (setupStaging) {
      if (!createR2Bucket('inkweld-storage-staging')) {
        warn('Failed to create staging R2 bucket. Media storage may not work.');
      }
    }

    if (setupProd) {
      if (!createR2Bucket('inkweld-storage')) {
        warn('Failed to create production R2 bucket. Media storage may not work.');
      }
    }

    // Create Pages projects for frontend
    header('Creating Cloudflare Pages Projects');

    info('Pages projects host the frontend static files.');

    if (setupStaging) {
      if (!createPagesProject('inkweld-frontend-staging')) {
        warn('Failed to create staging Pages project. You may need to create it manually.');
      }
    }

    if (setupProd) {
      if (!createPagesProject('inkweld-frontend')) {
        warn('Failed to create production Pages project. You may need to create it manually.');
      }
    }

    // Generate frontend environment files
    header('Generating Frontend Environment Files');

    info('Frontend environment files configure the API URLs for each environment.');
    info('Your Cloudflare subdomain is shown in the dashboard as:');
    info('  <worker-name>.YOUR_SUBDOMAIN.workers.dev');
    console.log();

    const subdomain = await prompt(
      rl,
      'Enter your Cloudflare account subdomain (e.g., "myaccount"):'
    );

    if (subdomain) {
      if (setupStaging) {
        generateFrontendEnvironment(subdomain, 'staging');
      }
      if (setupProd) {
        generateFrontendEnvironment(subdomain, 'cloudflare');
      }
    } else {
      warn('No subdomain provided. You can manually create the environment files later.');
      info('Copy the .example files and replace YOUR_SUBDOMAIN:');
      info('  frontend/src/environments/environment.staging.ts.example');
      info('  frontend/src/environments/environment.cloudflare.ts.example');
    }

    // Update wrangler.toml with database IDs
    header('Updating Configuration');

    if (updateWranglerToml(stagingDbId, prodDbId)) {
      success('Updated wrangler.toml with database IDs');
    } else {
      error('Failed to update wrangler.toml');
      info('Please manually update the database_id values:');
      if (stagingDbId) info(`  Staging:    ${stagingDbId}`);
      if (prodDbId) info(`  Production: ${prodDbId}`);
    }

    // Run migrations
    header('Running Database Migrations');

    const shouldMigrate = await confirm(rl, 'Run database migrations now?');
    if (shouldMigrate) {
      if (stagingDbId) {
        runMigration('inkweld_staging', 'Staging');
      }
      if (prodDbId) {
        runMigration('inkweld_prod', 'Production');
      }
    }

    // Set secrets
    header('Setting Secrets');

    info('SESSION_SECRET is required for each environment.');
    info('This is a cryptographic key used to sign session cookies.');
    console.log();

    const setSecrets = await confirm(rl, 'Would you like to set secrets now?');
    if (setSecrets) {
      const generateNew = await confirm(rl, 'Generate a secure random secret? (recommended)');

      let secret: string;
      if (generateNew) {
        secret = generateSecret(48);
        success(
          `Generated secret: ${secret.substring(0, 8)}...${secret.substring(secret.length - 4)}`
        );
        info('(Full secret will be set but not displayed for security)');
      } else {
        secret = await prompt(rl, 'Enter your SESSION_SECRET (32+ chars):');
        if (secret.length < 32) {
          warn('Secret is shorter than recommended (32+ chars). Continuing anyway...');
        }
      }

      if (stagingDbId) {
        if (setSecret('staging', 'SESSION_SECRET', secret)) {
          success('Staging secret set');
        } else {
          error('Failed to set staging secret');
        }
      }

      if (prodDbId) {
        // Ask if they want a different secret for production
        let prodSecret = secret;
        if (stagingDbId) {
          const differentProd = await confirm(
            rl,
            'Use a DIFFERENT secret for production? (more secure)'
          );
          if (differentProd) {
            if (generateNew) {
              prodSecret = generateSecret(48);
              success(
                `Generated production secret: ${prodSecret.substring(0, 8)}...${prodSecret.substring(prodSecret.length - 4)}`
              );
            } else {
              prodSecret = await prompt(rl, 'Enter production SESSION_SECRET:');
            }
          }
        }

        if (setSecret('production', 'SESSION_SECRET', prodSecret)) {
          success('Production secret set');
        } else {
          error('Failed to set production secret');
        }
      }
    } else {
      warn('Remember to set secrets before deploying:');
      if (stagingDbId) {
        info('  npx wrangler secret put SESSION_SECRET --env staging');
      }
      if (prodDbId) {
        info('  npx wrangler secret put SESSION_SECRET --env production');
      }
    }

    // Summary
    header('Setup Complete! 🎉');

    const envList: string[] = [];
    if (stagingDbId) envList.push('staging');
    if (prodDbId) envList.push('production');

    console.log(`
${colors.green}Your Cloudflare Workers deployment is configured!${colors.reset}

${colors.bright}Environments configured:${colors.reset} ${envList.join(', ')}
`);

    if (stagingDbId) {
      console.log(`${colors.bright}Staging Database ID:${colors.reset} ${stagingDbId}`);
    }
    if (prodDbId) {
      console.log(`${colors.bright}Production Database ID:${colors.reset} ${prodDbId}`);
    }

    console.log(`
${colors.bright}Next Steps:${colors.reset}

1. ${colors.cyan}Review wrangler.toml${colors.reset}
   Update ALLOWED_ORIGINS with your actual frontend domain(s)
`);

    if (stagingDbId) {
      console.log(`2. ${colors.cyan}Deploy to staging (from project root)${colors.reset}
   npm run cloudflare:deploy:staging
`);
    }

    if (prodDbId) {
      console.log(`${stagingDbId ? '3' : '2'}. ${colors.cyan}Deploy to production (from project root)${colors.reset}
   npm run cloudflare:deploy:prod
`);
    }

    console.log(`${colors.bright}View logs:${colors.reset}`);
    if (stagingDbId) console.log(`   npm run cloudflare:logs:staging`);
    if (prodDbId) console.log(`   npm run cloudflare:logs:prod`);

    console.log(`
${colors.bright}Full documentation:${colors.reset} docs/site/docs/hosting/cloudflare.md
`);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
