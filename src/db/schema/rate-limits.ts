import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for the app's own rate limits (src/server/rate-limit.ts).
 * One row per (scope, subject) window: a sign-in code per address or per IP,
 * verification attempts per address, listings created per person. The
 * subject is hashed, so no address or IP is stored. Swept by the daily cron.
 */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text().primaryKey(),
  count: integer().notNull().default(0),
  windowStart: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});
