import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Revoked JWT tokens for server-side token invalidation.
 *
 * When a user logs out or an admin revokes a session, the token's unique
 * identifier (a SHA-256 hash of the full JWT) is stored here. Auth checks
 * consult this table to reject tokens that have been explicitly revoked.
 *
 * Rows whose `expiresAt` has passed can be safely pruned — once a JWT
 * has naturally expired it no longer needs to be tracked.
 */
export const revokedTokens = sqliteTable(
  'revoked_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** SHA-256 hash of the full JWT string */
    tokenHash: text('token_hash').notNull().unique(),

    /** The user who owned this token */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Original JWT expiration (unix seconds) — used for cleanup */
    expiresAt: integer('expires_at').notNull(),

    /** When the token was revoked (unix seconds) */
    revokedAt: integer('revoked_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),

    /** Why the token was revoked */
    reason: text('reason').notNull().default('logout'),
  },
  (table) => [
    index('idx_revoked_tokens_hash').on(table.tokenHash),
    index('idx_revoked_tokens_user').on(table.userId),
    index('idx_revoked_tokens_expires').on(table.expiresAt),
  ]
);

export type RevokedToken = typeof revokedTokens.$inferSelect;
export type InsertRevokedToken = typeof revokedTokens.$inferInsert;
