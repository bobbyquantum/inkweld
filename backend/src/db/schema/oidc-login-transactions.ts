import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Short-lived OIDC authorization state. State values are hashed at rest; the
 * verifier and nonce are needed only to finish the matching authorization.
 */
export const oidcLoginTransactions = sqliteTable(
  'oidc_login_transactions',
  {
    stateHash: text('state_hash').primaryKey(),
    nonce: text('nonce').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('oidc_login_transactions_expires_idx').on(table.expiresAt)]
);
