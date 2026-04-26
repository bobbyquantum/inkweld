import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * WebAuthn / passkey credentials registered by users.
 *
 * Each row represents a single passkey (authenticator) bound to a user.
 * A user may have multiple passkeys (e.g. one per device). Login uses
 * discoverable credentials (usernameless) — the authenticator returns a
 * credential ID, which is looked up to find the owning user.
 *
 * Storage notes:
 *   - `credentialId` is the base64url-encoded credential ID returned by the
 *     authenticator. It is unique across all users.
 *   - `publicKey` is the COSE-encoded public key, base64url-encoded for
 *     portable storage in TEXT columns.
 *   - `transports` is a JSON-encoded string array (e.g. ["internal","hybrid"]).
 *   - `counter` is the authenticator signature counter (used for cloning
 *     detection). Many modern authenticators always return 0 — that's expected.
 */
export const userPasskeys = sqliteTable(
  'user_passkeys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Owning user */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Base64url-encoded credential ID (unique across all users) */
    credentialId: text('credential_id').notNull().unique(),

    /** Base64url-encoded COSE public key */
    publicKey: text('public_key').notNull(),

    /** Authenticator signature counter (for cloning detection) */
    counter: integer('counter').notNull().default(0),

    /** JSON array of supported transports, e.g. ["internal","hybrid","usb"] */
    transports: text('transports'),

    /** AAGUID of the authenticator (for display / metadata), nullable */
    aaguid: text('aaguid'),

    /** Authenticator attachment: 'platform' | 'cross-platform' | null */
    deviceType: text('device_type'),

    /** Whether this credential is backed up (synced across devices) */
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),

    /** User-supplied label for the passkey (e.g. "MacBook Touch ID") */
    name: text('name'),

    /** Unix timestamp (seconds) when the passkey was registered */
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),

    /** Unix timestamp (seconds) of the last successful authentication */
    lastUsedAt: integer('last_used_at'),
  },
  (table) => [index('user_passkeys_user_id_idx').on(table.userId)]
);

export type UserPasskey = typeof userPasskeys.$inferSelect;
export type InsertUserPasskey = typeof userPasskeys.$inferInsert;
