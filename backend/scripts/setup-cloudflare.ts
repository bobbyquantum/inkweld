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
const FRONTEND_DIR = join(PROJECT_ROOT, 'frontend');
const FRONTEND_ENV_DIR = join(FRONTEND_DIR, 'src', 'environments');
const WRANGLER_TOML = join(BACKEND_DIR, 'wrangler.toml');
const WRANGLER_EXAMPLE = join(BACKEND_DIR, 'wrangler.toml.example');
const FRONTEND_WRANGLER_TOML = join(FRONTEND_DIR, 'wrangler.toml');
const FRONTEND_WRANGLER_EXAMPLE = join(FRONTEND_DIR, 'wrangler.toml.example');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface WranglerBinding {
  name: string;
  type: string;
  text?: string;
  database_id?: string;
}

interface WranglerRemoteConfig {
  resources: {
    bindings: WranglerBinding[];
  };
}

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
  // Use local wrangler if command is 'wrangler'
  const actualCommand =
    command === 'wrangler' ? join(BACKEND_DIR, 'node_modules', '.bin', 'wrangler') : command;

  const result = spawnSync(actualCommand, args, {
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

async function confirm(
  rl: readline.Interface,
  question: string,
  defaultYes = true
): Promise<boolean> {
  const hint = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = await prompt(rl, `${question} ${hint}:`);
  if (answer === '') return defaultYes;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function promptWithConfirmation(
  rl: readline.Interface,
  promptQuestion: string,
  defaultValue: string,
  formatResult: (value: string) => string,
  dotDefault?: string
): Promise<string> {
  while (true) {
    const input = await prompt(rl, promptQuestion);
    // Secret dot shortcut uses the dotDefault value
    const value = input === '.' ? dotDefault || defaultValue : input || defaultValue;
    const display = formatResult(value);
    info(display);
    const confirmed = await confirm(rl, 'Continue with this?');
    if (confirmed) {
      return value;
    }
    info("Let's try again...");
  }
}

interface ExistingConfig {
  previewWorkerName?: string;
  prodWorkerName?: string;
  previewDbId?: string;
  prodDbId?: string;
  previewBackendDomain?: string;
  prodBackendDomain?: string;
}

function parseExistingWranglerToml(): ExistingConfig {
  const config: ExistingConfig = {};

  if (!existsSync(WRANGLER_TOML)) {
    return config;
  }

  try {
    const content = readFileSync(WRANGLER_TOML, 'utf-8');

    // Parse preview worker name
    const previewNameMatch = content.match(/\[env\.preview\]\s*\n\s*name\s*=\s*"([^"]+)"/);
    if (previewNameMatch) config.previewWorkerName = previewNameMatch[1];

    // Parse prod worker name
    const prodNameMatch = content.match(/\[env\.production\]\s*\n\s*name\s*=\s*"([^"]+)"/);
    if (prodNameMatch) config.prodWorkerName = prodNameMatch[1];

    // Parse preview database ID (skip placeholder)
    const previewDbMatch = content.match(
      /\[\[env\.preview\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
    );
    if (previewDbMatch && !previewDbMatch[1].includes('YOUR_')) {
      config.previewDbId = previewDbMatch[1];
    }

    // Parse prod database ID (skip placeholder)
    const prodDbMatch = content.match(
      /\[\[env\.production\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
    );
    if (prodDbMatch && !prodDbMatch[1].includes('YOUR_')) {
      config.prodDbId = prodDbMatch[1];
    }

    // Parse preview custom domain
    const previewRoutesMatch = content.match(
      /\[env\.preview\][\s\S]*?routes\s*=\s*\[\{\s*pattern\s*=\s*"([^"]+)"/
    );
    if (previewRoutesMatch) config.previewBackendDomain = previewRoutesMatch[1];

    // Parse prod custom domain
    const prodRoutesMatch = content.match(
      /\[env\.production\][\s\S]*?routes\s*=\s*\[\{\s*pattern\s*=\s*"([^"]+)"/
    );
    if (prodRoutesMatch) config.prodBackendDomain = prodRoutesMatch[1];

    if (Object.keys(config).length > 0) {
      info('Found existing configuration - will use as defaults');
    }
  } catch (e) {
    warn(`Could not parse existing wrangler.toml: ${e}`);
  }

  return config;
}

function checkWranglerInstalled(): boolean {
  // Check if wrangler is installed locally in the project
  const localWrangler = join(BACKEND_DIR, 'node_modules', '.bin', 'wrangler');
  return existsSync(localWrangler);
}

function checkWranglerLoggedIn(): boolean {
  const result = runCommand('wrangler', ['whoami']);
  const output = result.output.toLowerCase();

  // Check if output contains an email address and doesn't indicate being unauthenticated
  const hasEmail = output.includes('@');
  const isUnauthenticated =
    output.includes('not authenticated') ||
    output.includes('not logged in') ||
    output.includes('please run `wrangler login`');

  return result.success && hasEmail && !isUnauthenticated;
}

function getAccountInfo(): { email: string; accountName: string; emailPrefix: string } | null {
  const result = runCommand('wrangler', ['whoami']);
  if (!result.success) return null;

  const emailMatch = result.output.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!emailMatch) return null;

  const email = emailMatch[1];
  const emailPrefix = email.split('@')[0];

  // Parse the table to get the account name (not the header "Account Name")
  // Look for lines after the separator (├──) and extract the first column value
  const lines = result.output.split('\n');
  let accountName = emailPrefix;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('├──') && i + 1 < lines.length) {
      // Next line after separator contains the data
      const dataLine = lines[i + 1];
      const match = dataLine.match(/│\s*([^│]+?)\s*│/);
      if (match && match[1]) {
        const value = match[1].trim();
        // Skip if it's a header or looks like an ID
        if (value !== 'Account Name' && !/^[a-f0-9]{32}$/i.test(value)) {
          accountName = value;
          break;
        }
      }
    }
  }

  return {
    email,
    accountName,
    emailPrefix,
  };
}

function generateSecret(length: number = 48): string {
  return randomBytes(length).toString('base64url');
}

function setSecret(envName: string, secretName: string, secretValue: string): boolean {
  info(`Setting ${secretName} for ${envName} environment...`);
  const wranglerPath = join(BACKEND_DIR, 'node_modules', '.bin', 'wrangler');
  const result = spawnSync(wranglerPath, ['secret', 'put', secretName, '--env', envName], {
    encoding: 'utf-8',
    cwd: BACKEND_DIR,
    shell: true,
    input: secretValue + '\n',
  });

  if (result.status !== 0) {
    error(`Failed to set secret: ${result.stdout} ${result.stderr}`);
    return false;
  }

  return true;
}

function createD1Database(name: string): string | null {
  info(`Creating D1 database: ${name}...`);
  const result = runCommand('wrangler', ['d1', 'create', name]);

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
  const result = runCommand('wrangler', ['d1', 'list', '--json']);
  if (!result.success) {
    return null;
  }

  try {
    const databases = JSON.parse(result.output);
    const db = databases.find((d: { name: string; uuid?: string }) => d.name === name);
    if (db) {
      success(`Found existing database "${name}" with ID: ${db.uuid}`);
      return db.uuid || null;
    }
  } catch {
    // JSON parse failed
  }
  return null;
}

async function getRemoteConfig(envName: string): Promise<WranglerRemoteConfig | null> {
  info(`Fetching existing configuration for ${envName}...`);
  const listResult = runCommand('wrangler', ['versions', 'list', '--env', envName, '--json']);
  if (!listResult.success) return null;

  try {
    const versions = JSON.parse(listResult.output);
    if (!versions || versions.length === 0) return null;

    const latestVersionId = versions[versions.length - 1].id;
    const viewResult = runCommand('wrangler', [
      'versions',
      'view',
      latestVersionId,
      '--env',
      envName,
      '--json',
    ]);
    if (!viewResult.success) return null;

    return JSON.parse(viewResult.output);
  } catch {
    return null;
  }
}

function updateWranglerToml(
  previewDbId: string | null,
  prodDbId: string | null,
  previewWorkerName?: string,
  prodWorkerName?: string,
  previewPagesName?: string,
  prodPagesName?: string,
  previewRemoteConfig?: WranglerRemoteConfig | null,
  prodRemoteConfig?: WranglerRemoteConfig | null,
  previewBackendDomain?: string,
  prodBackendDomain?: string,
  previewFrontendDomain?: string,
  prodFrontendDomain?: string
): boolean {
  try {
    let content = readFileSync(WRANGLER_TOML, 'utf-8');

    // Update worker names if provided
    if (previewWorkerName) {
      content = content.replace(
        /name = "inkweld-backend-preview"/,
        `name = "${previewWorkerName}"`
      );
      // Also update durable object script name
      content = content.replace(
        /script_name = "inkweld-backend-preview"/,
        `script_name = "${previewWorkerName}"`
      );
    }

    if (prodWorkerName) {
      content = content.replace(/name = "inkweld-backend-prod"/, `name = "${prodWorkerName}"`);
      // Also update durable object script name
      content = content.replace(
        /script_name = "inkweld-backend-prod"/,
        `script_name = "${prodWorkerName}"`
      );
    }

    // Add custom domain route for preview backend
    if (previewBackendDomain) {
      content = content.replace(
        /# routes = \[\{ pattern = "api\.preview\.yourdomain\.com", custom_domain = true \}\]/,
        `routes = [{ pattern = "${previewBackendDomain}", custom_domain = true }]`
      );
    }

    // Add custom domain route for production backend
    if (prodBackendDomain) {
      content = content.replace(
        /# routes = \[\{ pattern = "api\.yourdomain\.com", custom_domain = true \}\]/,
        `routes = [{ pattern = "${prodBackendDomain}", custom_domain = true }]`
      );
    }

    if (previewDbId) {
      content = content.replace(
        /database_id = "YOUR_PREVIEW_DATABASE_ID_HERE"/g,
        `database_id = "${previewDbId}"`
      );
    }

    if (prodDbId) {
      content = content.replace(
        /database_id = "YOUR_PROD_DATABASE_ID_HERE"/g,
        `database_id = "${prodDbId}"`
      );
    }

    // Update ALLOWED_ORIGINS - use custom frontend domain if specified, otherwise use pages.dev
    if (previewPagesName || previewFrontendDomain) {
      const previewSectionMatch = content.match(/\[env\.preview\.vars\]([\s\S]*?)(?=\n\[|$)/);
      if (previewSectionMatch) {
        const oldSection = previewSectionMatch[0];
        const newSection = oldSection.replace(/ALLOWED_ORIGINS = "([^"]*)"/, () => {
          // If custom domain specified, use only that. Otherwise use pages.dev URL.
          if (previewFrontendDomain) {
            return `ALLOWED_ORIGINS = "https://${previewFrontendDomain}"`;
          } else if (previewPagesName) {
            return `ALLOWED_ORIGINS = "https://${previewPagesName}.pages.dev"`;
          }
          return `ALLOWED_ORIGINS = ""`;
        });
        content = content.replace(oldSection, newSection);
      }
    }

    if (prodPagesName || prodFrontendDomain) {
      const prodSectionMatch = content.match(/\[env\.production\.vars\]([\s\S]*?)(?=\n\[|$)/);
      if (prodSectionMatch) {
        const oldSection = prodSectionMatch[0];
        const newSection = oldSection.replace(/ALLOWED_ORIGINS = "([^"]*)"/, () => {
          // If custom domain specified, use only that. Otherwise use pages.dev URL.
          if (prodFrontendDomain) {
            return `ALLOWED_ORIGINS = "https://${prodFrontendDomain}"`;
          } else if (prodPagesName) {
            return `ALLOWED_ORIGINS = "https://${prodPagesName}.pages.dev"`;
          }
          return `ALLOWED_ORIGINS = ""`;
        });
        content = content.replace(oldSection, newSection);
      }
    }

    // Remove SESSION_SECRET from environment-specific vars sections
    // Cloudflare doesn't allow a variable to be both in [vars] and a secret
    const envVarsSectionRegex = /\[env\.[^.]+\.vars\]([\s\S]*?)(?=\n\[|$)/g;
    content = content.replace(envVarsSectionRegex, (section) => {
      return section.replace(/\n?\s*SESSION_SECRET = "[^"]*".*/g, '');
    });

    // Ensure migrations_dir = "drizzle" is present in all D1 sections
    // This handles cases where the template was missing it
    const d1SectionRegex = /\[\[(?:env\.[^.]+\.)?d1_databases\]\][\s\S]*?(?=\n\[|$)/g;
    content = content.replace(d1SectionRegex, (section) => {
      if (!section.includes('migrations_dir')) {
        // Insert it after database_id or database_name
        return section.replace(/(database_id = "[^"]*")/, '$1\nmigrations_dir = "drizzle"');
      }
      return section;
    });

    // Import other variables for preview
    if (previewRemoteConfig) {
      const bindings = previewRemoteConfig.resources.bindings;
      const origins = bindings.find((b: WranglerBinding) => b.name === 'ALLOWED_ORIGINS');
      if (origins && origins.text) {
        // Find the preview environment section and replace ALLOWED_ORIGINS within it
        const previewSectionMatch = content.match(/\[env\.preview\.vars\]([\s\S]*?)(?=\n\[|$)/);
        if (previewSectionMatch) {
          const oldSection = previewSectionMatch[0];
          const newSection = oldSection.replace(
            /ALLOWED_ORIGINS = "[^"]*"/,
            `ALLOWED_ORIGINS = "${origins.text}"`
          );
          content = content.replace(oldSection, newSection);
        }
      }
    }

    // Import other variables for production
    if (prodRemoteConfig) {
      const bindings = prodRemoteConfig.resources.bindings;
      const origins = bindings.find((b: WranglerBinding) => b.name === 'ALLOWED_ORIGINS');
      if (origins && origins.text) {
        // Find the production environment section and replace ALLOWED_ORIGINS within it
        const prodSectionMatch = content.match(/\[env\.production\.vars\]([\s\S]*?)(?=\n\[|$)/);
        if (prodSectionMatch) {
          const oldSection = prodSectionMatch[0];
          const newSection = oldSection.replace(
            /ALLOWED_ORIGINS = "[^"]*"/,
            `ALLOWED_ORIGINS = "${origins.text}"`
          );
          content = content.replace(oldSection, newSection);
        }
      }
    }

    writeFileSync(WRANGLER_TOML, content);
    return true;
  } catch (e) {
    error(`Failed to update wrangler.toml: ${e}`);
    return false;
  }
}

function updateFrontendWranglerToml(
  previewPagesName?: string,
  prodPagesName?: string,
  previewFrontendDomain?: string,
  prodFrontendDomain?: string
): boolean {
  try {
    let content = readFileSync(FRONTEND_WRANGLER_TOML, 'utf-8');

    // Update Pages project name for base config
    // For preview/preview, we use a separate Pages project instead of env.preview
    // because Pages environments work differently than Workers
    if (previewPagesName) {
      content = content.replace(/name = "inkweld-frontend"/, `name = "${previewPagesName}"`);
    } else if (prodPagesName) {
      content = content.replace(/name = "inkweld-frontend"/, `name = "${prodPagesName}"`);
    }

    // Note: Pages only supports "preview" and "production" environments
    // For preview, we create a separate Pages project rather than using env.preview
    // The env sections are left commented as they're optional

    // Note: Custom domains for Pages are configured via the Cloudflare Dashboard, not wrangler.toml
    // Log a reminder if domains were specified
    if (previewFrontendDomain) {
      info(
        `Remember to configure preview custom domain "${previewFrontendDomain}" in Cloudflare Dashboard`
      );
    }
    if (prodFrontendDomain) {
      info(
        `Remember to configure production custom domain "${prodFrontendDomain}" in Cloudflare Dashboard`
      );
    }

    writeFileSync(FRONTEND_WRANGLER_TOML, content);
    return true;
  } catch (e) {
    error(`Failed to update frontend wrangler.toml: ${e}`);
    return false;
  }
}

function runMigration(dbName: string, envName: string): boolean {
  info(`Running migrations on ${dbName}...`);
  // Use 'd1 migrations apply' to properly track migrations
  const envFlag = envName.toLowerCase() === 'preview' ? 'preview' : 'production';
  const result = runCommand('wrangler', [
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
    warn(`Try: bun run wrangler d1 migrations apply ${dbName} --env ${envFlag} --remote`);
    return false;
  }
}

function createR2Bucket(name: string): boolean {
  info(`Creating R2 bucket: ${name}...`);
  const result = runCommand('wrangler', ['r2', 'bucket', 'create', name]);

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
  const result = runCommand('wrangler', [
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
  workerName: string,
  subdomain: string,
  envType: 'preview' | 'cloudflare',
  customBackendDomain?: string
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

    // Use custom domain if provided, otherwise use workers.dev URL
    const backendUrl = customBackendDomain
      ? customBackendDomain
      : subdomain
        ? `${workerName}.${subdomain}.workers.dev`
        : `${workerName}.workers.dev`;

    content = content.replace(/inkweld-backend-\w+\.YOUR_SUBDOMAIN\.workers\.dev/g, backendUrl);

    // Also handle cases where it might just be .workers.dev in the template
    content = content.replace(/inkweld-backend-\w+\.workers\.dev/g, backendUrl);

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
      error('Wrangler CLI is not installed. Run: bun install from the backend directory');
      process.exit(1);
    }
    success('Wrangler CLI is installed');

    if (!checkWranglerLoggedIn()) {
      warn('You are not logged in to Cloudflare.');
      info('Run: bun run wrangler login');
      const shouldLogin = await confirm(rl, 'Would you like to login now?');
      if (shouldLogin) {
        const result = runCommand('wrangler', ['login']);
        if (!result.success) {
          error('Login failed. Please run "bun run wrangler login" manually.');
          process.exit(1);
        }
      } else {
        error('You must be logged in to continue.');
        process.exit(1);
      }
    }
    success('Logged in to Cloudflare');

    // Parse existing config for defaults before overwriting
    const existingConfig = parseExistingWranglerToml();

    // Always start fresh from template (we'll apply existing values as defaults)
    info('Creating wrangler.toml from template...');
    copyFileSync(WRANGLER_EXAMPLE, WRANGLER_TOML);
    success('Created backend wrangler.toml');

    copyFileSync(FRONTEND_WRANGLER_EXAMPLE, FRONTEND_WRANGLER_TOML);
    success('Created frontend wrangler.toml');

    // Ask which environments to set up
    header('Environment Selection');

    console.log(`
${colors.bright}Available environments:${colors.reset}

  ${colors.cyan}preview${colors.reset}     - Pre-production environment for testing
  ${colors.cyan}production${colors.reset}  - Live production environment

${colors.yellow}Note:${colors.reset} For local development, use "wrangler dev" (no setup needed).
${colors.yellow}Note:${colors.reset} Worker names must be globally unique across all Cloudflare accounts.
`);

    const setupPreview = await confirm(rl, 'Set up PREVIEW environment?');
    const setupProd = await confirm(rl, 'Set up PRODUCTION environment?');

    if (!setupPreview && !setupProd) {
      warn('No environments selected. Exiting.');
      process.exit(0);
    }

    // Get custom worker names
    header('Worker Configuration');

    info('Worker names must be globally unique across all Cloudflare accounts.');
    const accountInfo = getAccountInfo();
    if (accountInfo) {
      info(`Detected account: ${accountInfo.accountName}`);
    }

    info('Your workers.dev subdomain is required to generate the correct API URLs.');
    info('Find it at: https://dash.cloudflare.com → Workers & Pages → Overview (on the right)');
    info('Example: https://my-worker.SUBDOMAIN.workers.dev');

    // Prefer email prefix if account name looks like a generic "X's Account"
    let suggestedSubdomain = '';
    if (accountInfo) {
      const slugifiedAccount = accountInfo.accountName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const slugifiedPrefix = accountInfo.emailPrefix.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      // If account name is long or contains "account", prefer the email prefix
      if (slugifiedAccount.includes('account') || slugifiedAccount.length > 20) {
        suggestedSubdomain = slugifiedPrefix;
      } else {
        suggestedSubdomain = slugifiedAccount;
      }
    }

    const subdomain =
      (await prompt(rl, `Your workers.dev subdomain (default: ${suggestedSubdomain}):`)) ||
      suggestedSubdomain;

    if (!subdomain) {
      warn('No subdomain provided. URLs will be generated as worker.workers.dev');
    } else {
      success(`Using subdomain: ${subdomain}`);
    }
    console.log();

    let previewWorkerName = existingConfig.previewWorkerName || 'inkweld-backend-preview';
    let prodWorkerName = existingConfig.prodWorkerName || 'inkweld-backend-prod';

    if (setupPreview) {
      const suggestedPreview =
        existingConfig.previewWorkerName ||
        (suggestedSubdomain ? `${suggestedSubdomain}-inkweld-preview` : 'inkweld-backend-preview');
      previewWorkerName = await promptWithConfirmation(
        rl,
        `Worker name for PREVIEW (default: ${suggestedPreview}):`,
        suggestedPreview,
        (name) => {
          const url = subdomain ? `${name}.${subdomain}.workers.dev` : `${name}.workers.dev`;
          return `Preview worker URL: https://${url}`;
        },
        'inkweld-backend-preview'
      );
    }

    if (setupProd) {
      const suggestedProd =
        existingConfig.prodWorkerName ||
        (suggestedSubdomain ? `${suggestedSubdomain}-inkweld` : 'inkweld-backend-prod');
      prodWorkerName = await promptWithConfirmation(
        rl,
        `Worker name for PRODUCTION (default: ${suggestedProd}):`,
        suggestedProd,
        (name) => {
          const url = subdomain ? `${name}.${subdomain}.workers.dev` : `${name}.workers.dev`;
          return `Production worker URL: https://${url}`;
        },
        'inkweld-backend-prod'
      );
    }
    console.log();

    // Try to import existing config if requested
    const shouldImport = await confirm(
      rl,
      'Try to import existing environment variables from Cloudflare?'
    );
    let previewRemoteConfig: WranglerRemoteConfig | null = null;
    let prodRemoteConfig: WranglerRemoteConfig | null = null;

    if (shouldImport) {
      if (setupPreview) {
        previewRemoteConfig = await getRemoteConfig('preview');
        if (
          previewRemoteConfig &&
          previewRemoteConfig.resources &&
          previewRemoteConfig.resources.bindings
        ) {
          success('Found existing preview configuration');
        } else {
          previewRemoteConfig = null;
          warn('Could not find existing preview configuration');
        }
      }
      if (setupProd) {
        prodRemoteConfig = await getRemoteConfig('production');
        if (prodRemoteConfig && prodRemoteConfig.resources && prodRemoteConfig.resources.bindings) {
          success('Found existing production configuration');
        } else {
          prodRemoteConfig = null;
          warn('Could not find existing production configuration');
        }
      }
    }

    // Create databases
    header('Creating D1 Databases');

    let previewDbId: string | null = null;
    let prodDbId: string | null = null;

    if (setupPreview) {
      // Check if we already have the ID from remote config
      if (previewRemoteConfig) {
        const dbBinding = previewRemoteConfig.resources.bindings.find(
          (b: WranglerBinding) => b.type === 'd1' && b.name === 'DB'
        );
        if (dbBinding) previewDbId = dbBinding.database_id || null;
      }

      if (!previewDbId) {
        previewDbId = createD1Database('inkweld_preview');
      } else {
        success(`Using existing preview database ID: ${previewDbId}`);
      }

      if (!previewDbId) {
        error('Failed to create preview database');
        if (!setupProd) process.exit(1);
      }
    }

    if (setupProd) {
      // Check if we already have the ID from remote config
      if (prodRemoteConfig) {
        const dbBinding = prodRemoteConfig.resources.bindings.find(
          (b: WranglerBinding) => b.type === 'd1' && b.name === 'DB'
        );
        if (dbBinding) prodDbId = dbBinding.database_id || null;
      }

      if (!prodDbId) {
        prodDbId = createD1Database('inkweld_prod');
      } else {
        success(`Using existing production database ID: ${prodDbId}`);
      }

      if (!prodDbId) {
        error('Failed to create production database');
        process.exit(1);
      }
    }

    // Create R2 buckets for media storage
    header('Creating R2 Storage Buckets');

    info('R2 buckets store media files: project covers, avatars, inline images, etc.');

    if (setupPreview) {
      if (!createR2Bucket('inkweld-storage-preview')) {
        warn('Failed to create preview R2 bucket. Media storage may not work.');
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

    if (setupPreview) {
      if (!createPagesProject('inkweld-frontend-preview')) {
        warn('Failed to create preview Pages project. You may need to create it manually.');
      }
    }

    if (setupProd) {
      if (!createPagesProject('inkweld-frontend')) {
        warn('Failed to create production Pages project. You may need to create it manually.');
      }
    }

    // Custom domains (optional)
    header('Custom Domains (Optional)');

    info('You can configure custom domains for your frontend and backend.');
    info('This requires your domain to be added to Cloudflare first.');
    info('Skip this step to use the default *.workers.dev and *.pages.dev URLs.');
    console.log();

    let previewBackendDomain: string | undefined = existingConfig.previewBackendDomain;
    let previewFrontendDomain: string | undefined;
    let prodBackendDomain: string | undefined = existingConfig.prodBackendDomain;
    let prodFrontendDomain: string | undefined;

    if (setupPreview) {
      const hasExistingPreviewDomain = !!existingConfig.previewBackendDomain;
      const configurePreviewDomains =
        hasExistingPreviewDomain || (await confirm(rl, 'Configure custom domains for preview?'));

      if (configurePreviewDomains) {
        const defaultBackend = existingConfig.previewBackendDomain || '';
        const backendDomain = await prompt(
          rl,
          `Preview backend API domain (e.g., api.preview.yoursite.com${defaultBackend ? `, current: ${defaultBackend}` : ''}):`
        );
        if (backendDomain) {
          previewBackendDomain = backendDomain;
          success(`Preview backend will be available at: https://${backendDomain}`);
        } else if (defaultBackend) {
          previewBackendDomain = defaultBackend;
          success(`Keeping existing preview backend domain: https://${defaultBackend}`);
        }

        const frontendDomain = await prompt(
          rl,
          'Preview frontend domain (e.g., preview.yoursite.com, leave empty to skip):'
        );
        if (frontendDomain) {
          previewFrontendDomain = frontendDomain;
          success(`Preview frontend will be available at: https://${frontendDomain}`);
        }
      }
    }

    if (setupProd) {
      const hasExistingProdDomain = !!existingConfig.prodBackendDomain;
      const configureCustomDomains =
        hasExistingProdDomain || (await confirm(rl, 'Configure custom domains for production?'));

      if (configureCustomDomains) {
        const defaultBackend = existingConfig.prodBackendDomain || '';
        const backendDomain = await prompt(
          rl,
          `Production backend API domain (e.g., api.yoursite.com${defaultBackend ? `, current: ${defaultBackend}` : ''}):`
        );
        if (backendDomain) {
          prodBackendDomain = backendDomain;
          success(`Production backend will be available at: https://${backendDomain}`);
        } else if (defaultBackend) {
          prodBackendDomain = defaultBackend;
          success(`Keeping existing production backend domain: https://${defaultBackend}`);
        }

        const frontendDomain = await prompt(
          rl,
          'Production frontend domain (e.g., yoursite.com, leave empty to skip):'
        );
        if (frontendDomain) {
          prodFrontendDomain = frontendDomain;
          success(`Production frontend will be available at: https://${frontendDomain}`);
        }
      }
    }

    // Generate frontend environment files
    header('Generating Frontend Environment Files');

    info('Frontend environment files configure the API URLs for each environment.');
    info('Workers will be available at:');
    if (setupPreview) {
      const previewUrl = subdomain
        ? `${previewWorkerName}.${subdomain}.workers.dev`
        : `${previewWorkerName}.workers.dev`;
      info(`  Preview:    https://${previewUrl}`);
    }
    if (setupProd) {
      const prodUrl = subdomain
        ? `${prodWorkerName}.${subdomain}.workers.dev`
        : `${prodWorkerName}.workers.dev`;
      info(`  Production: https://${prodUrl}`);
    }
    console.log();

    if (setupPreview) {
      generateFrontendEnvironment(previewWorkerName, subdomain, 'preview', previewBackendDomain);
    }
    if (setupProd) {
      generateFrontendEnvironment(prodWorkerName, subdomain, 'cloudflare', prodBackendDomain);
    }

    // Update wrangler.toml with database IDs
    header('Updating Configuration');

    if (
      updateWranglerToml(
        previewDbId,
        prodDbId,
        setupPreview ? previewWorkerName : undefined,
        setupProd ? prodWorkerName : undefined,
        setupPreview ? 'inkweld-frontend-preview' : undefined,
        setupProd ? 'inkweld-frontend' : undefined,
        previewRemoteConfig,
        prodRemoteConfig,
        previewBackendDomain,
        prodBackendDomain,
        previewFrontendDomain,
        prodFrontendDomain
      )
    ) {
      success('Updated backend wrangler.toml with worker names, database IDs, and custom domains');
    } else {
      error('Failed to update backend wrangler.toml');
      info('Please manually update the configuration:');
      if (previewDbId) info(`  Preview DB ID:    ${previewDbId}`);
      if (prodDbId) info(`  Production DB ID: ${prodDbId}`);
    }

    // Update frontend wrangler.toml
    if (
      updateFrontendWranglerToml(
        setupPreview ? 'inkweld-frontend-preview' : undefined,
        setupProd ? 'inkweld-frontend' : undefined,
        previewFrontendDomain,
        prodFrontendDomain
      )
    ) {
      success('Updated frontend wrangler.toml with Pages project names');
    } else {
      error('Failed to update frontend wrangler.toml');
    }

    // Run migrations
    header('Running Database Migrations');

    const shouldMigrate = await confirm(rl, 'Run database migrations now?');
    if (shouldMigrate) {
      if (previewDbId) {
        runMigration('inkweld_preview', 'Preview');
      }
      if (prodDbId) {
        runMigration('inkweld_prod', 'Production');
      }
    }

    // Set secrets
    header('Setting Secrets');

    info('SESSION_SECRET is required for each environment.');
    info('This is a cryptographic key used to sign session cookies.');
    warn(
      'CRITICAL: If this key is used for database encryption, changing it will make existing data unreadable!'
    );
    console.log();

    // Check if secrets already exist
    let previewSecretExists = false;
    let prodSecretExists = false;

    if (previewRemoteConfig) {
      previewSecretExists = !!previewRemoteConfig.resources.bindings.find(
        (b: WranglerBinding) => b.name === 'SESSION_SECRET'
      );
      if (previewSecretExists) success('SESSION_SECRET is already set for PREVIEW on Cloudflare.');
    }
    if (prodRemoteConfig) {
      prodSecretExists = !!prodRemoteConfig.resources.bindings.find(
        (b: WranglerBinding) => b.name === 'SESSION_SECRET'
      );
      if (prodSecretExists) success('SESSION_SECRET is already set for PRODUCTION on Cloudflare.');
    }
    console.log();

    const allSecretsExist =
      (!setupPreview || previewSecretExists) && (!setupProd || prodSecretExists);

    let setSecrets = false;
    if (allSecretsExist) {
      info('All required secrets are already present on Cloudflare.');
      setSecrets = await confirm(
        rl,
        'Do you want to OVERWRITE these existing secrets? (Not recommended if you have existing data)',
        false
      );
    } else {
      setSecrets = await confirm(rl, 'Some secrets are missing. Would you like to set them now?');
    }

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

      if (previewDbId) {
        if (setSecret('preview', 'SESSION_SECRET', secret)) {
          success('Preview secret set');
        } else {
          error('Failed to set preview secret');
        }
      }

      if (prodDbId) {
        // Ask if they want a different secret for production
        let prodSecret = secret;
        if (previewDbId) {
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
      if (previewDbId) {
        info('  bun run wrangler secret put SESSION_SECRET --env preview');
      }
      if (prodDbId) {
        info('  bun run wrangler secret put SESSION_SECRET --env production');
      }
    }

    // Summary
    header('Setup Complete! 🎉');

    const envList: string[] = [];
    if (previewDbId) envList.push('preview');
    if (prodDbId) envList.push('production');

    console.log(`
${colors.green}Your Cloudflare Workers deployment is configured!${colors.reset}

${colors.bright}Environments configured:${colors.reset} ${envList.join(', ')}
`);

    if (previewDbId) {
      console.log(`${colors.bright}Preview Database ID:${colors.reset} ${previewDbId}`);
    }
    if (prodDbId) {
      console.log(`${colors.bright}Production Database ID:${colors.reset} ${prodDbId}`);
    }

    console.log(`
${colors.bright}Next Steps:${colors.reset}

1. ${colors.cyan}Review wrangler.toml${colors.reset}
   Update ALLOWED_ORIGINS with your actual frontend domain(s)
`);

    if (previewDbId) {
      console.log(`2. ${colors.cyan}Deploy to preview (from project root)${colors.reset}
   npm run cloudflare:preview:deploy
`);
    }

    if (prodDbId) {
      console.log(`${previewDbId ? '3' : '2'}. ${colors.cyan}Deploy to production (from project root)${colors.reset}
   npm run cloudflare:prod:deploy
`);
    }

    console.log(`${colors.bright}View logs:${colors.reset}`);
    if (previewDbId) console.log(`   npm run cloudflare:logs:preview`);
    if (prodDbId) console.log(`   npm run cloudflare:logs:prod`);

    console.log(`
${colors.bright}Full documentation:${colors.reset} docs/site/docs/hosting/cloudflare.md
`);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
