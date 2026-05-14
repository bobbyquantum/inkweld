/**
 * Inkweld TWA Setup Script
 *
 * Interactive script to configure the TWA Android project and generate
 * the Digital Asset Links file.
 *
 * The android/ Gradle project is committed to the repo.
 * This script generates the .well-known/assetlinks.json for deployment.
 *
 * It also optionally runs `bubblewrap init` interactively to regenerate
 * the android/ project if your PWA manifest changes significantly.
 *
 * Usage: bun run twa:setup
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const TWA_MANIFEST_PATH = join(PROJECT_ROOT, 'twa-manifest.json');
const ANDROID_DIR = join(PROJECT_ROOT, 'android');
const APP_DIR = join(ANDROID_DIR, 'app');
const APP_BUILD_GRADLE = join(APP_DIR, 'build.gradle.kts');
const GRADLE_PROPS = join(ANDROID_DIR, 'gradle.properties');
const ASSETLINKS_DIR = join(PROJECT_ROOT, 'frontend', 'public', '.well-known');
const FRONTEND_ENV_DIR = join(PROJECT_ROOT, 'frontend', 'src', 'environments');
const BUBBLEWRAP_BIN = join(PROJECT_ROOT, 'node_modules', '.bin', 'bubblewrap');
const KEYSTORE_PATH = join(ANDROID_DIR, 'inkweld-release.keystore');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
};

function log(m: string, c: string = colors.reset) { console.log(`${c}${m}${colors.reset}`); }
function success(m: string) { log(`✅ ${m}`, colors.green); }
function warn(m: string) { log(`⚠️  ${m}`, colors.yellow); }
function error(m: string) { log(`❌ ${m}`, colors.red); }
function info(m: string) { log(`ℹ️  ${m}`, colors.cyan); }
function header(m: string) {
  console.log();
  log(`${'='.repeat(60)}`, colors.blue);
  log(`  ${m}`, colors.bright);
  log(`${'='.repeat(60)}`, colors.blue);
  console.log();
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}${question}${colors.reset} `, (answer) => resolve(answer.trim()));
  });
}

async function confirm(rl: readline.Interface, q: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '(Y/n)' : '(y/N)';
  const a = await prompt(rl, `${q} ${hint}:`);
  if (a === '') return defaultYes;
  return a.toLowerCase() === 'y' || a.toLowerCase() === 'yes';
}

function readEnvHost(envType: string): string | null {
  const fp = join(FRONTEND_ENV_DIR, `environment.${envType}.ts`);
  if (!existsSync(fp)) return null;
  try {
    const c = readFileSync(fp, 'utf-8');
    const m = c.match(/apiUrl:\s*['"]([^'"]+)['"]/);
    if (m) {
      const host = m[1].replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return host.replace(/^api\./, '') || null;
    }
  } catch {}
  return null;
}

// ============================================================================
// Keystore helpers
// ============================================================================

function generateKeystore(ksPath: string, alias: string, password: string): boolean {
  info('Generating keystore...');
  const r = spawnSync('keytool', [
    '-genkey', '-v',
    '-keystore', ksPath,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', password,
    '-keypass', password,
    '-dname', 'CN=Inkweld TWA, OU=Dev, O=Inkweld, L=Unknown, ST=Unknown, C=US',
  ], { encoding: 'utf-8' });
  if (r.status !== 0) {
    error(`Failed: ${r.stderr || r.stdout}`);
    return false;
  }
  return true;
}

function getFingerprint(ksPath: string, alias: string, pw: string): string | null {
  const r = spawnSync('keytool', [
    '-list', '-v',
    '-keystore', ksPath,
    '-alias', alias,
    '-storepass', pw,
    '-keypass', pw,
  ], { encoding: 'utf-8' });
  if (r.status !== 0) return null;
  const m = r.output.match(/SHA256:\s*([A-F0-9:]+)/i);
  return m ? m[1].replace(/:/g, '').toLowerCase() : null;
}

// ============================================================================
// assetlinks.json
// ============================================================================

function generateAssetLinks(pkg: string, sha256: string) {
  return JSON.stringify([{
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: pkg,
      sha256_cert_fingerprints: [sha256],
    },
  }], null, 2) + '\n';
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const rl = createReadlineInterface();

  try {
    header('Inkweld TWA Setup');

    const prodHost = readEnvHost('cloudflare') || readEnvHost('prod');
    const previewHost = readEnvHost('preview');

    // --- Package name ---
    const pkgInput = await prompt(rl, 'Package name (default: app.inkweld):');
    const pkg = pkgInput || 'app.inkweld';

    // --- App name ---
    const nameInput = await prompt(rl, 'App display name (default: Inkweld):');
    const appName = nameInput || 'Inkweld';

    // --- Preview host ---
    const defaultPH = previewHost || 'preview.inkweld.app';
    const phInput = await prompt(
      rl, `Preview host${previewHost ? ` (detected: ${previewHost})` : ''} (default: ${defaultPH}):`);
    const previewH = phInput || previewHost || defaultPH;

    // --- Prod host ---
    const defaultPRH = prodHost || 'inkweld.app';
    const prhInput = await prompt(
      rl, `Production host${prodHost ? ` (detected: ${prodHost})` : ''} (default: ${defaultPRH}):`);
    const prodH = prhInput || prodHost || defaultPRH;

    const previewName = `${appName} Preview`;
    success(`Preview:  ${previewH}  →  ${previewName}`);
    success(`Prod:     ${prodH}  →  ${appName}`);

    // --- Keystore ---
    header('Signing Keystore');

    const alias = await prompt(rl, 'Key alias (default: inkweld):') || 'inkweld';

    let password: string;
    if (existsSync(KEYSTORE_PATH)) {
      success(`Keystore exists at ${KEYSTORE_PATH}`);
      password = await prompt(rl, 'Keystore password:');
    } else {
      const gen = await confirm(rl, `No keystore. Generate one at ${KEYSTORE_PATH}?`);
      if (!gen) {
        warn('You need a keystore to sign the APK/AAB. Run the script again or provide one.');
        process.exit(0);
      }
      password = randomBytes(24).toString('base64url').slice(0, 24);
      if (!generateKeystore(KEYSTORE_PATH, alias, password)) process.exit(1);
      success(`Generated: ${KEYSTORE_PATH}`);
      warn(`Alias: ${alias}  Password: ${password}`);
      warn('SAVE THESE SECURELY. Lost = cannot update Play Store app.');
    }

    const fp = getFingerprint(KEYSTORE_PATH, alias, password);
    if (!fp) {
      error('Could not read SHA256 fingerprint. Check alias/password.');
      process.exit(1);
    }
    success(`SHA256: ${fp}`);

    // ====================================================================
    // Update android/app/build.gradle.kts hosts
    // ====================================================================
    header('Updating Android project hosts');

    if (existsSync(APP_BUILD_GRADLE)) {
      let gradleContent = readFileSync(APP_BUILD_GRADLE, 'utf-8');

      gradleContent = gradleContent.replace(
        /manifestPlaceholders\["twaHost"\] = "preview\.[^"]+"/,
        `manifestPlaceholders["twaHost"] = "${previewH}"`
      );
      gradleContent = gradleContent.replace(
        /resValue\("string", "hostName", "preview\.[^"]+"\)/,
        `resValue("string", "hostName", "${previewH}")`
      );
      gradleContent = gradleContent.replace(
        /resValue\("string", "twaAppName", "[^"]+ Preview"\)/,
        `resValue("string", "twaAppName", "${previewName}")`
      );

      gradleContent = gradleContent.replace(
        /manifestPlaceholders\["twaHost"\] = "[^"]+"/g,
        (match: string) => {
          return match.includes('preview')
            ? `manifestPlaceholders["twaHost"] = "${previewH}"`
            : `manifestPlaceholders["twaHost"] = "${prodH}"`;
        }
      );

      writeFileSync(APP_BUILD_GRADLE, gradleContent);
      success('Updated android/app/build.gradle.kts');
    } else {
      warn('android/app/build.gradle.kts not found — skipping update');
    }

    // ====================================================================
    // Generate assetlinks.json
    // ====================================================================
    header('Generating assetlinks.json');

    mkdirSync(ASSETLINKS_DIR, { recursive: true });
    writeFileSync(
      join(ASSETLINKS_DIR, 'assetlinks.json'),
      generateAssetLinks(pkg, fp)
    );
    success('Created frontend/public/.well-known/assetlinks.json');

    // ====================================================================
    // Summary
    // ====================================================================
    header('TWA Setup Complete!');

    console.log(`
${colors.bright}Configuration:${colors.reset}
  Package:      ${pkg}
  Preview:      ${previewH}  (${previewName})
  Prod:         ${prodH}  (${appName})
  Keystore:     ${KEYSTORE_PATH}

${colors.bright}Next Steps:${colors.reset}

  1. ${colors.cyan}Deploy${colors.reset} — assetlinks.json deploys with your frontend
     CF Pages:  npm run cloudflare:preview:deploy
     Docker:    npm run docker:prod

  2. ${colors.cyan}Verify${colors.reset}
     https://developers.google.com/digital-asset-links/tools/generator
     Host: https://${prodH}   Package: ${pkg}

  3. ${colors.cyan}Build locally${colors.reset}
     Preview APK:  bun run twa:build:preview
     Prod AAB:     bun run twa:bundle:prod

  4. ${colors.cyan}CI/CD${colors.reset}
     Actions → TWA Build → Run workflow
     Select preview or prod, optionally override hosts

${colors.yellow}Encode keystore for CI:${colors.reset}
  base64 < ${KEYSTORE_PATH} > keystore.txt
  Add as GitHub secret: TWA_KEYSTORE_BASE64
`);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
