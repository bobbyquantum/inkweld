import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { homedir, platform } from 'os';

// Try to load environment variables from multiple locations
function loadEnvironment() {
  // Priority 1: Current directory
  const localEnv = path.resolve(process.cwd(), '.env');
  if (existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
    return;
  }

  // Priority 2: Parent directory (for monorepo structure)
  const parentEnv = path.resolve(process.cwd(), '../.env');
  if (existsSync(parentEnv)) {
    dotenv.config({ path: parentEnv });
    return;
  }

  // Priority 3: User config directory (~/.inkweld/.env on Unix, %APPDATA%\Inkweld\.env on Windows)
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
}

loadEnvironment();

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
