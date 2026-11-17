import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, integer, pgTable, primaryKey, serial, text, uniqueIndex, unique, uuid } from "drizzle-orm/pg-core";
import { NOTICE_AUDIENCES, NOTICE_EVENT_TYPES, NOTICE_LIMITS } from "@/lib/notices";
import { user } from "./auth";
import { createdAt, inList, nullableTimestamp, num, updatedAt } from "./helpers";

/**
 * Popup notices (PLAN.md row 30). At most one is active: the partial unique
 * index holds it, and activating one deactivates the others in the same
 * transaction (src/server/data/notices.ts). Editing a notice never shows it
 * again to people who dismissed it; a duplicate (new id) does.
 */
export const siteNotices = pgTable(
  "site_notices",
  {
    id: serial().primaryKey(),
    title: text().notNull(),
    bodyMd: text().notNull(),
    audience: text().notNull(),
    ctaLabel: text(),
    ctaHref: text(),
    active: boolean().notNull().default(false),
    /** The first instant it no longer shows (the end of its Eastern "ends" day); null runs until deactivated. */
    endsAt: nullableTimestamp(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("site_notices_one_active").on(sql`(true)`).where(sql`${t.active}`),
    check("site_notices_title_check", sql`length(${t.title}) between 1 and ${num(NOTICE_LIMITS.title)}`),
    check("site_notices_body_check", sql`length(${t.bodyMd}) <= ${num(NOTICE_LIMITS.body)}`),
    check("site_notices_audience_check", inList(t.audience, NOTICE_AUDIENCES)),
    check("site_notices_cta_check", sql`(${t.ctaLabel} is null) = (${t.ctaHref} is null)`),
  ],
);

/** A signed-in person's "seen it". Signed-out visitors keep theirs in localStorage. */
export const noticeDismissals = pgTable(
  "notice_dismissals",
  {
    noticeId: integer()
      .notNull()
      .references(() => siteNotices.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dismissedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.userId] })],
);

/**
 * Counts per notice: one row per notice, type and actor, so every count is
 * distinct people. actor_key as in listing_events: hmac(APP_SECRET,
 * 'actor:' + user id) signed in, the daily-rotating anonymous key signed out.
 * Ids only; admins and bots are not counted.
 */
export const noticeEvents = pgTable(
  "notice_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    noticeId: integer()
      .notNull()
      .references(() => siteNotices.id, { onDelete: "cascade" }),
    type: text().notNull(),
    actorKey: char({ length: 16 }).notNull(),
    signedOut: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("notice_events_actor_key").on(t.noticeId, t.type, t.actorKey),
    check("notice_events_type_check", inList(t.type, NOTICE_EVENT_TYPES)),
  ],
);
