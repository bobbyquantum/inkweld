import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Short-lived WebAuthn challenges issued by the server.
 *
 * Stored in the database (not in-memory) so they survive server restarts and
 * work correctly across multiple instances. Challenges are single-use and
 * expire after a few minutes.
 *
 * Two flavors:
 *   - 'registration': issued during /register/start; userId is the owning user.
 *   - 'authentication': issued during /login/start; userId is null because
 *     login is usernameless (discoverable credentials).
 */
export const webauthnChallenges = sqliteTable(
  'webauthn_challenges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Base64url-encoded random challenge */
    challenge: text('challenge').notNull(),

    /** 'registration' | 'authentication' */
    type: text('type').notNull(),

    /** Owning user for registration challenges (null for usernameless login) */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),

    /** Unix timestamp (seconds) when the challenge expires */
    expiresAt: integer('expires_at').notNull(),

    /** Unix timestamp (seconds) when the challenge was created */
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('webauthn_challenges_challenge_idx').on(table.challenge),
    index('webauthn_challenges_expires_at_idx').on(table.expiresAt),
  ]
);

export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;
export type InsertWebauthnChallenge = typeof webauthnChallenges.$inferInsert;
