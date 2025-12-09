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
  typeof (globalThis as Record<string, unknown>).caches !== 'undefined' &&
  typeof (globalThis as Record<string, unknown>).WebSocketPair !== 'undefined';

// Only load dotenv in Node.js/Bun environments
if (!isCloudflareWorkers) {
  // Dynamic imports to avoid bundling Node.js modules in Workers
  const loadEnvironment = async () => {
    try {
      const dotenv = await import('dotenv');
      const path = await import('path');
      const { existsSync } = await import('fs');
      const { homedir, platform } = await import('os');
      const { fileURLToPath } = await import('url');

      // Safely get __dirname - import.meta.url might be undefined in some contexts
      let __dirname: string;
      try {
        if (import.meta.url) {
          const __filename = fileURLToPath(import.meta.url);
          __dirname = path.dirname(__filename);
        } else {
          __dirname = process.cwd();
        }
      } catch {
        __dirname = process.cwd();
      }

      // Priority 1: Current directory (e.g., backend/.env when running from backend/)
      const localEnv = path.resolve(process.cwd(), '.env');
      if (existsSync(localEnv)) {
        dotenv.config({ path: localEnv });
        return;
      }

      // Priority 2: Parent directory (e.g., root .env when running from backend/)
      const parentEnv = path.resolve(process.cwd(), '../.env');
      if (existsSync(parentEnv)) {
        dotenv.config({ path: parentEnv });
        return;
      }

      // Priority 3: Monorepo root relative to this file (backend/src/config/env.ts → root/.env)
      const monorepoRoot = path.resolve(__dirname, '../../../.env');
      if (existsSync(monorepoRoot)) {
        dotenv.config({ path: monorepoRoot });
        return;
      }

      // Priority 4: User config directory (~/.inkweld/.env on Unix, %APPDATA%\Inkweld\.env on Windows)
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

      // If none found, continue with environment variables only
    } catch {
      // Silently fail - we're likely in a Workers environment or imports failed
    }
  };

  // Note: This is async but we call it synchronously for side effects
  // In Workers, this block is skipped entirely
  loadEnvironment();
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '8333', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  version: process.env.INKWELD_VERSION || '0.1.0',

  // Database
  database: {
    type: (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'd1',
    // SQLite/D1 only - Postgres support removed
  },

  // Database encryption key (used for encrypting sensitive config values)
  // Also used for session cookie signing
  databaseKey:
    process.env.DATABASE_KEY ||
    process.env.SESSION_SECRET ||
    'fallback-secret-change-in-production',

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

  // User registration
  userApprovalRequired: process.env.USER_APPROVAL_REQUIRED !== 'false',

  // GitHub OAuth
  github: {
    enabled: process.env.GITHUB_ENABLED === 'true',
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL || 'http://localhost:8333/api/auth/github/callback',
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
} as const;

export type Config = typeof config;
