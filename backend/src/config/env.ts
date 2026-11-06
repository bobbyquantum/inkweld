/**
 * Environment configuration for Inkweld backend
 *
 * This file supports multiple runtimes:
 * - Bun/Node.js: Loads .env files from various locations
 * - Cloudflare Workers: Uses environment bindings from wrangler.toml
 *
 * In Workers, import.meta.url and Node.js APIs are not available,
 * so we skip dotenv loading entirely and rely on wrangler.toml vars.
 */

import { configuredNodeEnv, isCloudflareWorkers as detectCloudflareWorkers } from './runtime-env';

// Detect if we're in Cloudflare Workers (no import.meta.url or process.cwd)
const isCloudflareWorkers = detectCloudflareWorkers();

// Only load dotenv in Node.js/Bun environments (synchronously, before config is read)
if (!isCloudflareWorkers) {
  try {
    // Use require() for synchronous loading so process.env is populated before config
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync } = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { homedir, platform } = require('os');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fileURLToPath } = require('url');

    // Safely get __dirname - import.meta.url might be undefined in some contexts
    let envDir: string;
    try {
      if (import.meta.url) {
        const filename = fileURLToPath(import.meta.url);
        envDir = path.dirname(filename);
      } else {
        envDir = process.cwd();
      }
    } catch {
      envDir = process.cwd();
    }

    // Priority 1: Current directory (e.g., backend/.env when running from backend/)
    const localEnv = path.resolve(process.cwd(), '.env');
    if (existsSync(localEnv)) {
      dotenv.config({ path: localEnv });
    }
    // Priority 2: Parent directory (e.g., root .env when running from backend/)
    else {
      const parentEnv = path.resolve(process.cwd(), '../.env');
      if (existsSync(parentEnv)) {
        dotenv.config({ path: parentEnv });
      }
      // Priority 3: Monorepo root relative to this file (backend/src/config/env.ts → root/.env)
      else {
        const monorepoRoot = path.resolve(envDir, '../../../.env');
        if (existsSync(monorepoRoot)) {
          dotenv.config({ path: monorepoRoot });
        }
        // Priority 4: User config directory (~/.inkweld/.env on Unix, %APPDATA%\Inkweld\.env on Windows)
        else {
          const home = homedir();
          const plat = platform();
          let configDir: string;

          switch (plat) {
            case 'win32':
              configDir = path.join(
                process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
                'Inkweld'
              );
              break;
            case 'darwin':
            case 'linux':
            default:
              configDir = path.join(home, '.inkweld');
          }

          const configEnv = path.join(configDir, '.env');
          if (existsSync(configEnv)) {
            dotenv.config({ path: configEnv });
          }
        }
      }
    }
    // If none found, continue with environment variables only
  } catch {
    // Silently fail - require() not available or imports failed
  }
}

/**
 * NODE_ENV values allowed to run without an explicit signing secret. Anything
 * else (production, staging, preview, typos…) must set DATABASE_KEY or
 * SESSION_SECRET. An unset NODE_ENV is treated as development, matching
 * `config.nodeEnv` below.
 */
export function isDevOnlyNodeEnv(nodeEnv: string | undefined = 'development'): boolean {
  // An empty NODE_ENV is treated like an unset one.
  return nodeEnv === '' || nodeEnv === 'development' || nodeEnv === 'test';
}

/**
 * Well-known key used ONLY when no secret is configured in development/test.
 * It is public (it lives in this repository), so it must never be accepted
 * outside those environments — see `signingKeyProblem` below.
 */
export const DEV_FALLBACK_SECRET = 'fallback-secret-for-development-only';

/**
 * SESSION_SECRET sample values that appear, or have appeared, in this
 * repository's docs and example files. Like the development key, they are
 * only accepted in development and test.
 */
export const SAMPLE_SECRETS: readonly string[] = [
  'placeholder-set-via-wrangler-secret',
  'placeholder-set-via-wrangler-secret-put',
  'change-me-to-a-long-random-string',
  'local-dev-session-secret-for-testing-minimum-32-chars',
];

/** Keys published in this repository: the development key and the sample values. */
export const PUBLISHED_KEYS: readonly string[] = [DEV_FALLBACK_SECRET, ...SAMPLE_SECRETS];

/** Shortest DATABASE_KEY / SESSION_SECRET accepted for signing. */
export const MIN_SIGNING_KEY_LENGTH = 32;

const GENERATE_KEY_HINT = 'Generate a key with: openssl rand -hex 32';

/**
 * Why a DATABASE_KEY that is only too short cannot sign tokens. It never says
 * to replace the key: DATABASE_KEY also encrypts the stored settings, which a
 * new key could not read.
 */
const SHORT_DATABASE_KEY_PROBLEM =
  `DATABASE_KEY has fewer than ${MIN_SIGNING_KEY_LENGTH} characters, too few to sign tokens. ` +
  'Keep it, because it encrypts stored settings, and set SESSION_SECRET to a random value of ' +
  `at least ${MIN_SIGNING_KEY_LENGTH} characters, which then signs tokens. ${GENERATE_KEY_HINT}`;

/**
 * Why `key` cannot sign tokens when NODE_ENV is `nodeEnv`, or undefined when
 * it can. `key` is undefined when neither DATABASE_KEY nor SESSION_SECRET is
 * set; `name` is the variable it came from, for the message. The start-up
 * check below and `chooseSigningKey()` both apply it.
 *
 * - No key, the development key, or a sample value from the docs: accepted
 *   only in development and test.
 * - Any other key must be at least 32 characters, in every environment.
 */
export function signingKeyProblem(
  key: string | undefined,
  nodeEnv: string | undefined,
  name = 'DATABASE_KEY or SESSION_SECRET'
): string | undefined {
  const onlyInDevelopment = `which is only accepted when NODE_ENV is development or test (NODE_ENV is "${nodeEnv}")`;
  if (!key) {
    if (isDevOnlyNodeEnv(nodeEnv)) return undefined;
    return (
      `DATABASE_KEY or SESSION_SECRET must be set when NODE_ENV is "${nodeEnv}" ` +
      `(the built-in development key is only used in development and test). ${GENERATE_KEY_HINT}`
    );
  }
  if (key === DEV_FALLBACK_SECRET) {
    if (isDevOnlyNodeEnv(nodeEnv)) return undefined;
    return `${name} is set to the built-in development key, ${onlyInDevelopment}. ${GENERATE_KEY_HINT}`;
  }
  if (SAMPLE_SECRETS.includes(key)) {
    if (isDevOnlyNodeEnv(nodeEnv)) return undefined;
    return (
      `${name} is set to a sample value from the Inkweld documentation, ${onlyInDevelopment}. ` +
      GENERATE_KEY_HINT
    );
  }
  if (key.length < MIN_SIGNING_KEY_LENGTH) {
    return `${name} must be at least ${MIN_SIGNING_KEY_LENGTH} characters. ${GENERATE_KEY_HINT}`;
  }
  return undefined;
}

/** DATABASE_KEY and SESSION_SECRET, as a runtime provides them. */
export interface SigningKeySources {
  DATABASE_KEY?: unknown;
  SESSION_SECRET?: unknown;
}

/** The signing key, with a warning to log when it is not the one set first; or why there is none. */
export type SigningKeyChoice = { key: string; warning?: string } | { problem: string };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The key that signs tokens: DATABASE_KEY, else SESSION_SECRET (an empty value
 * counts as unset), else the development key where `signingKeyProblem` allows
 * it. When the chosen key cannot be used, the problem is returned instead.
 *
 * One exception: a DATABASE_KEY that is only too short is passed over for a
 * usable SESSION_SECRET, with a warning; without one, the problem asks for a
 * SESSION_SECRET rather than a new DATABASE_KEY. That DATABASE_KEY still
 * encrypts the stored settings (config.service.ts), and replacing it would
 * make them unreadable, while signing does not depend on it.
 */
export function chooseSigningKey(
  sources: SigningKeySources,
  nodeEnv: string | undefined
): SigningKeyChoice {
  const databaseKey = nonEmptyString(sources.DATABASE_KEY);
  const sessionSecret = nonEmptyString(sources.SESSION_SECRET);

  if (databaseKey) {
    const problem = signingKeyProblem(databaseKey, nodeEnv, 'DATABASE_KEY');
    if (!problem) return { key: databaseKey };
    // Any other problem is a published key, and those are all long enough.
    if (databaseKey.length >= MIN_SIGNING_KEY_LENGTH) return { problem };
    if (
      sessionSecret !== undefined &&
      !signingKeyProblem(sessionSecret, nodeEnv, 'SESSION_SECRET')
    ) {
      return {
        key: sessionSecret,
        warning:
          `DATABASE_KEY is shorter than ${MIN_SIGNING_KEY_LENGTH} characters, so tokens are ` +
          'signed with SESSION_SECRET. Stored settings stay encrypted with DATABASE_KEY.',
      };
    }
    return { problem: SHORT_DATABASE_KEY_PROBLEM };
  }
  if (sessionSecret) {
    const problem = signingKeyProblem(sessionSecret, nodeEnv, 'SESSION_SECRET');
    return problem ? { problem } : { key: sessionSecret };
  }
  const problem = signingKeyProblem(undefined, nodeEnv);
  return problem ? { problem } : { key: DEV_FALLBACK_SECRET };
}

/**
 * DATABASE_KEY and SESSION_SECRET from the process environment, read once
 * after the .env files above, like the rest of `config`. Bun and Node sign
 * with these; Cloudflare Workers keep their secrets in the request bindings.
 */
export const processSigningKeys: Readonly<SigningKeySources> = Object.freeze({
  DATABASE_KEY: process.env.DATABASE_KEY,
  SESSION_SECRET: process.env.SESSION_SECRET,
});

// NODE_ENV as the process was started with (read after the .env files above).
// See runtime-env.ts for why it is not read as `process.env.NODE_ENV`.
const startupNodeEnv = configuredNodeEnv();

export const config = {
  // Server
  port: Number.parseInt(process.env.PORT || '8333', 10),
  nodeEnv: startupNodeEnv ?? 'development',
  version: process.env.INKWELD_VERSION || '1.0.0-beta.6', // x-release-please-version

  // Logging
  // LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' | 'none'
  // Defaults to 'debug' in development, 'info' in production
  logLevel: process.env.LOG_LEVEL || (startupNodeEnv === 'production' ? 'info' : 'debug'),

  // Database
  database: {
    type: (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'd1',
    // SQLite/D1 only - Postgres support removed
  },

  // Database encryption key (used for encrypting sensitive config values).
  // Session and MCP tokens are signed with the key signingSecret()
  // (config/signing-secret.ts) chooses per request, which on Bun and Node is
  // this same key once the check below has passed.
  //
  // DATABASE_KEY or SESSION_SECRET MUST be set for every NODE_ENV other than
  // `development` / `test` — the server refuses to start without it. The
  // check is deliberately an allow-list rather than `=== 'production'`: a
  // deployment running with NODE_ENV "staging", "preview", etc. must never
  // sign sessions with a key published in this repository. Because this key
  // also encrypts stored settings, a DATABASE_KEY shorter than 32 characters
  // stops the server here rather than being passed over for SESSION_SECRET.
  //
  // On Cloudflare Workers, secrets are only available through c.env (not
  // process.env), so nothing is checked at start-up: signingSecret() applies
  // the rule to each request that needs the key and fails it with a 500.
  databaseKey: (() => {
    const key = process.env.DATABASE_KEY || process.env.SESSION_SECRET;
    if (!isCloudflareWorkers && !isDevOnlyNodeEnv(startupNodeEnv)) {
      const name = process.env.DATABASE_KEY ? 'DATABASE_KEY' : 'SESSION_SECRET';
      const problem = signingKeyProblem(key, startupNodeEnv, name);
      if (problem) {
        throw new Error(problem);
      }
    }
    if (!key && !isCloudflareWorkers) {
      console.warn(
        '[config] DATABASE_KEY / SESSION_SECRET not set — using the public development ' +
          'fallback. Sessions signed with it are forgeable; never expose this server.'
      );
    }
    return key || DEV_FALLBACK_SECRET;
  })(),

  // Session (uses databaseKey for signing)
  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: startupNodeEnv === 'production',
    domain: process.env.COOKIE_DOMAIN,
  },

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4200'],

  // Storage
  dataPath: process.env.DATA_PATH || './data',

  // Frontend serving (when embedded or FRONTEND_DIST is set)
  // Set to 'false' to disable frontend serving (API-only mode)
  serveFrontend: process.env.SERVE_FRONTEND !== 'false',

  // USER_APPROVAL_REQUIRED and the GitHub OAuth settings are admin-editable:
  // read them through configService (database, then env, then default), never
  // from process.env here, or a value set in admin Settings is ignored.

  // AI Kill Switch - master switch for all AI features (defaults to ON/enabled = AI disabled)
  // When set to 'true' or not set, all AI features are disabled
  // Must be explicitly set to 'false' to enable AI features
  aiKillSwitch: {
    enabled: process.env.AI_KILL_SWITCH !== 'false',
    lockedByEnv: process.env.AI_KILL_SWITCH !== undefined,
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    enabled: !!process.env.OPENAI_API_KEY,
  },

  // Default admin (for bootstrapping and testing)
  defaultAdmin: {
    username: process.env.DEFAULT_ADMIN_USERNAME || '',
    password: process.env.DEFAULT_ADMIN_PASSWORD || '',
    enabled: !!(process.env.DEFAULT_ADMIN_USERNAME && process.env.DEFAULT_ADMIN_PASSWORD),
  },

  // TLS configuration for HTTPS (Bun only)
  tls: {
    enabled: process.env.TLS_ENABLED === 'true',
    certPath: process.env.TLS_CERT_PATH || './certs/cert.pem',
    keyPath: process.env.TLS_KEY_PATH || './certs/key.pem',
  },

  // WebAuthn / passkeys
  // RP ID must match the effective domain users see in their browser (no scheme/port).
  // For local development this defaults to 'localhost'.
  // RP name is shown to users in the browser passkey UI.
  //
  // ⚠️  Production warning: once any user registers a passkey against an RP ID,
  // that ID is effectively immutable — changing it later invalidates every
  // previously registered credential. Always set WEBAUTHN_RP_ID explicitly
  // in production. We log a loud warning if the default is used in production.
  webauthn: {
    // Production refuses to start without WEBAUTHN_RP_ID because the value is
    // baked into every passkey registration: changing it later invalidates
    // every previously registered credential.
    // On Cloudflare Workers, secrets only flow through `c.env`, so we skip
    // this check and let runtime validation in `rpFromContext` handle it.
    rpId: (() => {
      const rpId = process.env.WEBAUTHN_RP_ID;
      if (!isCloudflareWorkers && startupNodeEnv === 'production' && !rpId) {
        throw new Error(
          'WEBAUTHN_RP_ID must be set in production. It cannot be changed ' +
            'after users register passkeys without invalidating their credentials.'
        );
      }
      return rpId || 'localhost';
    })(),
    rpName: process.env.WEBAUTHN_RP_NAME || 'Inkweld',
  },
} as const;

export type Config = typeof config;
