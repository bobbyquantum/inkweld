import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Fixed-window request counters shared by every server instance.
 *
 * The rate limiter keeps its counts in memory on Bun and Node (one process).
 * On Cloudflare Workers every isolate has its own memory and isolates are
 * short-lived, so in-memory counts limit nothing there; the limiter counts in
 * this table instead (`middleware/rate-limit.ts`).
 */
export const rateLimitBuckets = sqliteTable(
  'rate_limit_buckets',
  {
    /** `<limiter name>:<client key>`, e.g. `login:203.0.113.7` */
    key: text('key').primaryKey(),

    /** Epoch ms the current window started */
    windowStart: integer('window_start').notNull(),

    /** Requests counted in the current window */
    count: integer('count').notNull(),

    /** Epoch ms after which the row can be deleted */
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('rate_limit_buckets_expires_at_idx').on(table.expiresAt)]
);

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
