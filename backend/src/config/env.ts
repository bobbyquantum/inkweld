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

// Detect if we're in Cloudflare Workers (no import.meta.url or process.cwd)
const isCloudflareWorkers =
  (globalThis as Record<string, unknown>).caches !== undefined &&
  (globalThis as Record<string, unknown>).WebSocketPair !== undefined;

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

export const config = {
  // Server
  port: Number.parseInt(process.env.PORT || '8333', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  version: process.env.INKWELD_VERSION || '0.1.0',

  // Logging
  // LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' | 'none'
  // Defaults to 'debug' in development, 'info' in production
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // Database
  database: {
    type: (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'd1',
    // SQLite/D1 only - Postgres support removed
  },

  // Database encryption key (used for encrypting sensitive config values)
  // Also used for session cookie signing
  // In production, DATABASE_KEY or SESSION_SECRET MUST be set — server will refuse to start without it.
  // On Cloudflare Workers, secrets are only available through c.env (not process.env),
  // so module-level validation is skipped — runtime validation happens in middleware instead.
  databaseKey: (() => {
    const key = process.env.DATABASE_KEY || process.env.SESSION_SECRET;
    if (!isCloudflareWorkers && process.env.NODE_ENV === 'production') {
      if (!key) {
        throw new Error(
          'DATABASE_KEY or SESSION_SECRET must be set in production. ' +
            'Generate a secure random key of at least 32 characters.'
        );
      }
      if (key.length < 32) {
        throw new Error(
          'DATABASE_KEY or SESSION_SECRET must be at least 32 characters in production.'
        );
      }
    }
    return key || 'fallback-secret-for-development-only';
  })(),

  // Session (uses databaseKey for signing)
  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.COOKIE_DOMAIN,
  },

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4200'],

  // Storage
  dataPath: process.env.DATA_PATH || './data',

  // Frontend serving (when embedded or FRONTEND_DIST is set)
  // Set to 'false' to disable frontend serving (API-only mode)
  serveFrontend: process.env.SERVE_FRONTEND !== 'false',

  // User registration - defaults to false (no approval required) for easier setup
  // Set to 'true' to require admin approval for new users
  userApprovalRequired: process.env.USER_APPROVAL_REQUIRED === 'true',

  // GitHub OAuth
  github: {
    enabled: process.env.GITHUB_ENABLED === 'true',
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL || 'http://localhost:8333/api/auth/github/callback',
  },

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
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    rpName: process.env.WEBAUTHN_RP_NAME || 'Inkweld',
  },
} as const;

if (process.env.NODE_ENV === 'production' && !process.env.WEBAUTHN_RP_ID) {
  console.warn(
    '[config] WEBAUTHN_RP_ID is not set in production — defaulting to "localhost". ' +
      'Passkey registrations made against this default cannot be migrated to a real ' +
      'domain later. Set WEBAUTHN_RP_ID to your public hostname before users register.'
  );
}

export type Config = typeof config;
