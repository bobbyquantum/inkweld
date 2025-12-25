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
  AI_KILL_SWITCH: {
    category: 'ai' as ConfigCategory,
    description:
      'Master kill switch for ALL AI features. When enabled (default), all AI features are disabled. Must be explicitly disabled to enable AI.',
    encrypted: false,
    envVar: 'AI_KILL_SWITCH',
    type: 'boolean' as const,
  },
  AI_LINT_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable AI-powered writing lint/suggestions',
    encrypted: false,
    envVar: 'AI_LINT_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable AI image generation (master switch)',
    encrypted: false,
    envVar: 'AI_IMAGE_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_DEFAULT_PROVIDER: {
    category: 'ai' as ConfigCategory,
    description: 'Default image generation provider (openai, openrouter, stable-diffusion, falai)',
    encrypted: false,
    envVar: 'AI_IMAGE_DEFAULT_PROVIDER',
    type: 'string' as const,
  },
  AI_IMAGE_DEFAULT_MODEL: {
    category: 'ai' as ConfigCategory,
    description:
      'Default model for image generation (e.g., dall-e-3, black-forest-labs/flux-1.1-pro)',
    encrypted: false,
    envVar: 'AI_IMAGE_DEFAULT_MODEL',
    type: 'string' as const,
  },

  // ============================================================================
  // Shared AI Provider Configuration (used by both Image and Text features)
  // ============================================================================
  AI_OPENAI_API_KEY: {
    category: 'ai' as ConfigCategory,
    description: 'OpenAI API key (shared across all AI features)',
    encrypted: true,
    envVar: 'OPENAI_API_KEY',
    type: 'string' as const,
  },
  AI_OPENAI_ENDPOINT: {
    category: 'ai' as ConfigCategory,
    description: 'OpenAI API endpoint URL (for OpenAI-compatible services)',
    encrypted: false,
    envVar: 'OPENAI_API_BASE',
    type: 'string' as const,
  },
  AI_OPENROUTER_API_KEY: {
    category: 'ai' as ConfigCategory,
    description: 'OpenRouter API key (shared across all AI features)',
    encrypted: true,
    envVar: 'OPENROUTER_API_KEY',
    type: 'string' as const,
  },
  AI_ANTHROPIC_API_KEY: {
    category: 'ai' as ConfigCategory,
    description: 'Anthropic API key for Claude models',
    encrypted: true,
    envVar: 'ANTHROPIC_API_KEY',
    type: 'string' as const,
  },
  AI_SD_ENDPOINT: {
    category: 'ai' as ConfigCategory,
    description: 'Stable Diffusion API endpoint URL',
    encrypted: false,
    envVar: 'SD_API_ENDPOINT',
    type: 'string' as const,
  },
  AI_SD_API_KEY: {
    category: 'ai' as ConfigCategory,
    description: 'Stable Diffusion API key (if required)',
    encrypted: true,
    envVar: 'SD_API_KEY',
    type: 'string' as const,
  },
  AI_FALAI_API_KEY: {
    category: 'ai' as ConfigCategory,
    description: 'Fal.ai API key for AI features',
    encrypted: true,
    envVar: 'FALAI_API_KEY',
    type: 'string' as const,
  },

  // ============================================================================
  // Image Generation Feature Settings
  // ============================================================================
  AI_IMAGE_OPENAI_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable OpenAI for image generation',
    encrypted: false,
    envVar: 'AI_IMAGE_OPENAI_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_OPENAI_MODELS: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of available OpenAI models (leave empty for defaults)',
    encrypted: false,
    envVar: 'AI_IMAGE_OPENAI_MODELS',
    type: 'string' as const,
  },
  AI_IMAGE_OPENROUTER_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable OpenRouter for image generation',
    encrypted: false,
    envVar: 'AI_IMAGE_OPENROUTER_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_OPENROUTER_MODELS: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of available OpenRouter models (leave empty for defaults)',
    encrypted: false,
    envVar: 'AI_IMAGE_OPENROUTER_MODELS',
    type: 'string' as const,
  },
  AI_IMAGE_SD_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable Stable Diffusion for image generation',
    encrypted: false,
    envVar: 'AI_IMAGE_SD_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_FALAI_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable Fal.ai for image generation',
    encrypted: false,
    envVar: 'AI_IMAGE_FALAI_ENABLED',
    type: 'boolean' as const,
  },
  AI_IMAGE_FALAI_MODELS: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of available Fal.ai models (leave empty for defaults)',
    encrypted: false,
    envVar: 'AI_IMAGE_FALAI_MODELS',
    type: 'string' as const,
  },
  AI_IMAGE_CUSTOM_SIZES: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of custom image size profiles',
    encrypted: false,
    envVar: 'AI_IMAGE_CUSTOM_SIZES',
    type: 'string' as const,
  },

  // ============================================================================
  // Text-to-Text AI Settings
  // ============================================================================
  AI_TEXT_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable AI text-to-text features (linting, prompt optimization)',
    encrypted: false,
    envVar: 'AI_TEXT_ENABLED',
    type: 'boolean' as const,
  },
  AI_TEXT_DEFAULT_PROVIDER: {
    category: 'ai' as ConfigCategory,
    description: 'Default text-to-text provider (openai, openrouter, anthropic)',
    encrypted: false,
    envVar: 'AI_TEXT_DEFAULT_PROVIDER',
    type: 'string' as const,
  },
  AI_TEXT_LINT_MODEL: {
    category: 'ai' as ConfigCategory,
    description: 'Model to use for AI linting (e.g., gpt-4o, claude-3-sonnet)',
    encrypted: false,
    envVar: 'AI_TEXT_LINT_MODEL',
    type: 'string' as const,
  },
  AI_TEXT_LINT_PROMPT: {
    category: 'ai' as ConfigCategory,
    description: 'Custom system prompt for AI linting (leave empty for default)',
    encrypted: false,
    envVar: 'AI_TEXT_LINT_PROMPT',
    type: 'string' as const,
  },
  AI_TEXT_IMAGE_PROMPT_MODEL: {
    category: 'ai' as ConfigCategory,
    description: 'Model to use for image prompt optimization',
    encrypted: false,
    envVar: 'AI_TEXT_IMAGE_PROMPT_MODEL',
    type: 'string' as const,
  },
  AI_TEXT_IMAGE_PROMPT_TEMPLATE: {
    category: 'ai' as ConfigCategory,
    description: 'Custom system prompt for image prompt optimization (leave empty for default)',
    encrypted: false,
    envVar: 'AI_TEXT_IMAGE_PROMPT_TEMPLATE',
    type: 'string' as const,
  },
  AI_TEXT_OPENAI_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable OpenAI for text-to-text features',
    encrypted: false,
    envVar: 'AI_TEXT_OPENAI_ENABLED',
    type: 'boolean' as const,
  },
  AI_TEXT_OPENAI_MODELS: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of available OpenAI text models (leave empty for defaults)',
    encrypted: false,
    envVar: 'AI_TEXT_OPENAI_MODELS',
    type: 'string' as const,
  },
  AI_TEXT_OPENROUTER_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable OpenRouter for text-to-text features',
    encrypted: false,
    envVar: 'AI_TEXT_OPENROUTER_ENABLED',
    type: 'boolean' as const,
  },
  AI_TEXT_OPENROUTER_MODELS: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of available OpenRouter text models (leave empty for defaults)',
    encrypted: false,
    envVar: 'AI_TEXT_OPENROUTER_MODELS',
    type: 'string' as const,
  },
  AI_TEXT_ANTHROPIC_ENABLED: {
    category: 'ai' as ConfigCategory,
    description: 'Enable Anthropic Claude for text-to-text features',
    encrypted: false,
    envVar: 'AI_TEXT_ANTHROPIC_ENABLED',
    type: 'boolean' as const,
  },
  AI_TEXT_ANTHROPIC_MODELS: {
    category: 'ai' as ConfigCategory,
    description: 'JSON array of available Anthropic models (leave empty for defaults)',
    encrypted: false,
    envVar: 'AI_TEXT_ANTHROPIC_MODELS',
    type: 'string' as const,
  },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;
