import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Application configuration stored in the database.
 *
 * This table stores encrypted key-value pairs for application settings.
 * Values can override environment variable defaults, allowing runtime
 * configuration changes via the admin panel.
 *
 * Encryption uses AES-256-GCM with the DATABASE_KEY environment variable.
 * The `encrypted` flag indicates whether the value needs decryption.
 *
 * Categories help organize settings in the admin UI:
 * - 'auth': Authentication settings (user approval, local users, etc.)
 * - 'ai': AI feature settings (lint, image generation, etc.)
 * - 'github': GitHub OAuth settings
 * - 'general': General application settings
 */
export const config = sqliteTable('config', {
  // The config key (e.g., 'USER_APPROVAL_REQUIRED', 'OPENAI_API_KEY')
  key: text('key').primaryKey(),

  // The value (possibly encrypted)
  value: text('value').notNull(),

  // Whether the value is encrypted (for sensitive data like API keys)
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),

  // Category for organizing in admin UI
  category: text('category').notNull().default('general'),

  // Human-readable description
  description: text('description'),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Config = typeof config.$inferSelect;
export type InsertConfig = typeof config.$inferInsert;

/**
 * Config categories for the admin UI
 */
export const CONFIG_CATEGORIES = ['auth', 'ai', 'github', 'general'] as const;
export type ConfigCategory = (typeof CONFIG_CATEGORIES)[number];

/**
 * Known config keys with their metadata.
 * This defines what settings are available and their default behavior.
 */
export const CONFIG_KEYS = {
  // Auth settings
  USER_APPROVAL_REQUIRED: {
    category: 'auth' as ConfigCategory,
    description: 'Require admin approval for new user registrations',
    encrypted: false,
    envVar: 'USER_APPROVAL_REQUIRED',
    type: 'boolean' as const,
  },
  LOCAL_USERS_ENABLED: {
    category: 'auth' as ConfigCategory,
    description: 'Allow local username/password authentication',
    encrypted: false,
    envVar: 'LOCAL_USERS_ENABLED',
    type: 'boolean' as const,
  },

  // GitHub OAuth settings
  GITHUB_ENABLED: {
    category: 'github' as ConfigCategory,
    description: 'Enable GitHub OAuth authentication',
    encrypted: false,
    envVar: 'GITHUB_ENABLED',
    type: 'boolean' as const,
  },
  GITHUB_CLIENT_ID: {
    category: 'github' as ConfigCategory,
    description: 'GitHub OAuth application client ID',
    encrypted: false,
    envVar: 'GITHUB_CLIENT_ID',
    type: 'string' as const,
  },
  GITHUB_CLIENT_SECRET: {
    category: 'github' as ConfigCategory,
    description: 'GitHub OAuth application client secret',
    encrypted: true,
    envVar: 'GITHUB_CLIENT_SECRET',
    type: 'string' as const,
  },

  // AI settings
  AI_LINT_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable AI-powered writing lint/suggestions',
    encrypted: false,
    envVar: 'AI_LINT_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable AI image generation',
    encrypted: false,
    envVar: 'AI_IMAGE_ENABLED',
    type: 'boolean' as const,
  },
  OPENAI_API_KEY: {
    category: 'ai' as ConfigCategory,
    description: 'OpenAI API key for AI features',
    encrypted: true,
    envVar: 'OPENAI_API_KEY',
    type: 'string' as const,
  },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;
