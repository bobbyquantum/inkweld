import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Password reset tokens for the "forgot password" flow.
 *
 * Tokens are stored as SHA-256 hashes — the raw token is only sent to the
 * user's email and never persisted. Tokens expire after 1 hour and are
 * single-use (marked via `usedAt`).
 */
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  /** The user this token was issued for */
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** SHA-256 hash of the raw token (never store raw tokens) */
  tokenHash: text('token_hash').notNull(),

  /** Unix timestamp (seconds) when the token expires */
  expiresAt: integer('expires_at').notNull(),

  /** Unix timestamp (seconds) when the token was used, null if unused */
  usedAt: integer('used_at'),

  /** Unix timestamp (seconds) when the token was created */
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
