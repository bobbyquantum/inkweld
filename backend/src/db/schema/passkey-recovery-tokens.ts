import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Passkey recovery tokens (magic-link enrolment).
 *
 * When PASSWORD_LOGIN_ENABLED is false and EMAIL_RECOVERY_ENABLED is true a
 * user who has lost access to all their passkeys can request a recovery
 * email. The email contains a single-use, short-lived link that opens a
 * frontend page which (a) exchanges the token for a short-lived enrolment
 * session and (b) immediately runs the WebAuthn registration ceremony to add
 * a new passkey. Existing passkeys are deliberately NOT removed by this
 * flow — see PR #1029 for the threat-model rationale (a stolen email link
 * must not be able to wipe trusted devices).
 *
 * Storage mirrors `password_reset_tokens`: SHA-256 hash of the raw token,
 * single-use via `usedAt`, expiry via `expiresAt`, all timestamps in
 * seconds (consistent with the rest of the auth schema).
 */
export const passkeyRecoveryTokens = sqliteTable('passkey_recovery_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  /** The user this recovery token was issued for */
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** SHA-256 hash of the raw token (never store raw tokens). UNIQUE — two
   *  rows with the same hash would be a serious bug (collision on 32-byte
   *  random source is astronomical, but the constraint catches the bug). */
  tokenHash: text('token_hash').notNull().unique(),

  /** Unix timestamp (seconds) when the token expires */
  expiresAt: integer('expires_at').notNull(),

  /** Unix timestamp (seconds) when the token was used, null if unused */
  usedAt: integer('used_at'),

  /** Unix timestamp (seconds) when the token was created */
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export type PasskeyRecoveryToken = typeof passkeyRecoveryTokens.$inferSelect;
export type InsertPasskeyRecoveryToken = typeof passkeyRecoveryTokens.$inferInsert;
