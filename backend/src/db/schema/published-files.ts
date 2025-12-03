import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';

/**
 * Sharing permission levels for published files
 */
export const sharePermissions = ['private', 'collaborators', 'link', 'public'] as const;
export type SharePermission = (typeof sharePermissions)[number];

/**
 * Published files table
 * Stores metadata about published exports (EPUB, PDF, HTML, Markdown)
 */
export const publishedFiles = sqliteTable('published_files', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  /** Reference to the project */
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),

  /** Original filename (e.g., "my-novel.epub") */
  filename: text('filename').notNull(),

  /** File format: EPUB, PDF_SIMPLE, HTML, MARKDOWN */
  format: text('format').notNull(),

  /** MIME type */
  mimeType: text('mime_type').notNull(),

  /** File size in bytes */
  size: integer('size').notNull(),

  /** Name of the publish plan used */
  planName: text('plan_name').notNull(),

  /** Sharing permission level */
  sharePermission: text('share_permission').notNull().default('private'),

  /** Share token for link-based sharing (null if private) */
  shareToken: text('share_token'),

  /** Title at time of publishing */
  metaTitle: text('meta_title').notNull(),

  /** Author at time of publishing */
  metaAuthor: text('meta_author').notNull(),

  /** Subtitle at time of publishing */
  metaSubtitle: text('meta_subtitle'),

  /** Language at time of publishing */
  metaLanguage: text('meta_language'),

  /** Number of content items included */
  metaItemCount: integer('meta_item_count').notNull().default(0),

  /** Word count if available */
  metaWordCount: integer('meta_word_count'),

  /** Creation timestamp */
  createdAt: integer('created_at', { mode: 'number' }).notNull(),

  /** Last modified timestamp */
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

export type PublishedFile = typeof publishedFiles.$inferSelect;
export type InsertPublishedFile = typeof publishedFiles.$inferInsert;
