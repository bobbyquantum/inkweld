import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * One-time codes handed to the browser after a successful GitHub sign-in.
 *
 * The OAuth callback cannot return the session JWT in the redirect URL
 * (browser history, Referer, server logs), so it redirects with an opaque
 * code that the SPA exchanges for a session via POST. The code used to live
 * in a per-process Map, which breaks on any multi-instance deployment and on
 * Workers: the callback and the exchange routinely land on different
 * isolates, so sign-in failed nondeterministically.
 *
 * Only the SHA-256 hash of the code is stored, and the row references the
 * user rather than holding a token; the session is minted at exchange time.
 * Codes are single-use (`usedAt`) and expire after 60 seconds.
 */
export const oauthLoginCodes = sqliteTable(
  'oauth_login_codes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** The user who completed the provider sign-in */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 hash of the raw code (never store raw codes) */
    codeHash: text('code_hash').notNull(),
    /** Unix timestamp (ms) when the code expires */
    expiresAt: integer('expires_at').notNull(),
    /** Unix timestamp (ms) when the code was redeemed, null if unused */
    usedAt: integer('used_at'),
    /** Unix timestamp (ms) when the code was created */
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('oauth_login_codes_hash_idx').on(table.codeHash),
    index('oauth_login_codes_expires_idx').on(table.expiresAt),
  ]
);

export type OauthLoginCode = typeof oauthLoginCodes.$inferSelect;
export type InsertOauthLoginCode = typeof oauthLoginCodes.$inferInsert;
