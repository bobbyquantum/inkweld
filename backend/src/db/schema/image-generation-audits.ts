import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { imageModelProfiles } from './image-model-profiles';

/**
 * Audit table for image generation requests.
 *
 * Records every image generation attempt, including:
 * - Which user made the request
 * - Which profile was used
 * - The prompt text
 * - Reference images used
 * - Output images generated
 * - Credit cost at time of request
 * - Status (success, moderated, error)
 *
 * Note: General errors are NOT logged (only successful and moderated requests).
 */
export const imageGenerationAudits = sqliteTable(
  'image_generation_audits',
  {
    // Unique identifier
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // User who made the request
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Profile used for generation
    profileId: text('profile_id').references(() => imageModelProfiles.id, { onDelete: 'set null' }),

    // Profile name at time of request (preserved even if profile is deleted)
    profileName: text('profile_name').notNull(),

    // The text prompt used for generation
    prompt: text('prompt').notNull(),

    // Reference images used (as media:// URLs or data: URLs, stored as JSON array)
    referenceImageUrls: text('reference_image_urls', { mode: 'json' }).$type<string[]>(),

    // Output images (as media:// URLs, stored as JSON array)
    outputImageUrls: text('output_image_urls', { mode: 'json' }).$type<string[]>(),

    // Credit cost at time of request
    creditCost: integer('credit_cost').notNull().default(0),

    // Generation status
    status: text('status').$type<'success' | 'moderated'>().notNull(),

    // Error or moderation message (if applicable)
    message: text('message'),

    // Request timestamp
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('audit_user_idx').on(table.userId),
    index('audit_created_idx').on(table.createdAt),
    index('audit_profile_idx').on(table.profileId),
    index('audit_status_idx').on(table.status),
  ]
);

export type ImageGenerationAudit = typeof imageGenerationAudits.$inferSelect;
export type InsertImageGenerationAudit = typeof imageGenerationAudits.$inferInsert;
