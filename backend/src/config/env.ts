import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from parent directory .env file
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '8333', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  version: process.env.INKWELD_VERSION || '0.1.0',

  // Database
  database: {
    type: (process.env.DB_TYPE || 'postgres') as 'postgres' | 'sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'inkweld',
    password: process.env.DB_PASSWORD || 'inkweld',
    database: process.env.DB_DATABASE || 'inkweld',
    synchronize: process.env.DB_SYNC === 'true',
  },

  // Session
  session: {
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
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
} as const;

export type Config = typeof config;
