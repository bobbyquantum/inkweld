import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Image model profiles for AI image generation.
 *
 * Profiles are admin-configured presets that abstract away provider/model
 * complexity from end users. Each profile defines:
 * - Which provider and model to use
 * - Pre-configured generation parameters (quality, style, etc.)
 * - Supported sizes
 * - Whether reference images are supported
 *
 * Users simply select a profile by name when generating images.
 */
export const imageModelProfiles = sqliteTable('image_model_profiles', {
  // Unique identifier
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Display name shown to users (e.g., "Fast Draft", "High Quality Portrait")
  name: text('name').notNull().unique(),

  // Optional description for users
  description: text('description'),

  // Provider type: 'openai' | 'openrouter' | 'falai' | 'stable-diffusion'
  provider: text('provider').notNull(),

  // Model identifier (provider-specific, e.g., 'gpt-image-1', 'fal-ai/flux-pro/v1.1')
  modelId: text('model_id').notNull(),

  // Whether this profile is available to users
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

  // Whether this profile supports reference image input
  supportsImageInput: integer('supports_image_input', { mode: 'boolean' }).notNull().default(false),

  // Whether this profile allows custom/arbitrary resolutions
  supportsCustomResolutions: integer('supports_custom_resolutions', { mode: 'boolean' })
    .notNull()
    .default(false),

  // Supported sizes as JSON array (e.g., ["1024x1024", "1536x1024"])
  // If null, all sizes from the model are available
  supportedSizes: text('supported_sizes', { mode: 'json' }).$type<string[]>(),

  // Default size to use if not specified
  defaultSize: text('default_size'),

  // Pre-configured model parameters as JSON
  // This stores provider/model-specific settings like quality, style, steps, etc.
  // Example for OpenAI: { "quality": "hd", "style": "vivid" }
  // Example for Fal.ai: { "num_inference_steps": 28, "guidance_scale": 3.5 }
  modelConfig: text('model_config', { mode: 'json' }).$type<Record<string, unknown>>(),

  // Sort order for display (lower = first)
  sortOrder: integer('sort_order').notNull().default(0),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ImageModelProfile = typeof imageModelProfiles.$inferSelect;
export type InsertImageModelProfile = typeof imageModelProfiles.$inferInsert;

/**
 * Provider types supported by the image generation system
 */
export const IMAGE_PROVIDERS = ['openai', 'openrouter', 'falai', 'stable-diffusion'] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];
