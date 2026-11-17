import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, serial, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { DIGEST } from "@/config/site";
import { DIGEST_DISABLED_VIA, DIGEST_SEND_STATUSES, SAVED_QUERY_MAX_CHARS } from "@/lib/digest";
import { user } from "./auth";
import { createdAt, inList, inListOrNull, nullableTimestamp, num, updatedAt } from "./helpers";

/**
 * A search someone asked to be told about. `query` is the Browse query
 * string itself, as filterSearchParams() writes it and parseListingQuery()
 * reads it (src/lib/listing-filters.ts): no second filter format, and a
 * saved search opens on Browse as `/browse?<query>`. The cap per person
 * (DIGEST.maxSavedSearches) is kept by the data layer.
 */
export const savedSearches = pgTable(
  "saved_searches",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    query: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("saved_searches_user_query_key").on(t.userId, t.query),
    check("saved_searches_name_check", sql`length(${t.name}) between 1 and ${num(DIGEST.savedSearchNameMaxChars)}`),
    check("saved_searches_query_check", sql`length(${t.query}) <= ${num(SAVED_QUERY_MAX_CHARS)}`),
  ],
);

/**
 * Whether someone gets the weekly digest. No row: never asked for it.
 * `enabledAt` is when it was last turned on: the first digest after that
 * covers listings posted since then (DIGEST.firstWindowDays at most).
 */
export const digestSubscriptions = pgTable(
  "digest_subscriptions",
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    enabled: boolean().notNull().default(false),
    enabledAt: nullableTimestamp(),
    disabledVia: text(),
    updatedAt: updatedAt(),
  },
  (t) => [check("digest_subscriptions_disabled_via_check", inListOrNull(t.disabledVia, DIGEST_DISABLED_VIA))],
);

/**
 * One row per person per digest week, written as `pending` BEFORE the send
 * (the claim) and settled after it, so a retried or doubled cron never sends
 * twice: the (user, week) pair is unique. `week` is the Eastern date of that
 * week's digest morning. The window is the stretch of `posted_at` the digest
 * covered; the next one starts where the last sent or empty one ended.
 * Counts only: which listings went is not kept.
 */
export const digestSends = pgTable(
  "digest_sends",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    week: date({ mode: "string" }).notNull(),
    status: text().notNull().default("pending"),
    windowStart: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    windowEnd: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    searches: smallint().notNull().default(0),
    matches: smallint().notNull().default(0),
    /** Resend's message id once sent ("console" or "test" when mail was printed or collected instead). */
    resendId: text(),
    /** Why it failed, for the admin; never the address. */
    error: text(),
    createdAt: createdAt(),
    /** When a send last tried it: set on the claim, moved when a catch-up run retakes a stuck pending row. */
    attemptedAt: createdAt(),
  },
  (t) => [
    unique("digest_sends_user_week_key").on(t.userId, t.week),
    index("digest_sends_week_status_idx").on(t.week, t.status),
    check("digest_sends_status_check", inList(t.status, DIGEST_SEND_STATUSES)),
    check("digest_sends_window_check", sql`${t.windowStart} <= ${t.windowEnd}`),
  ],
);
