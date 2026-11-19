import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, serial, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { DELIVERY_STATUSES, EMAIL_RESOLUTIONS, EMAIL_SENDERS, EMAIL_STATUSES, type EmailAudience } from "@/lib/email";
import { accessRequests } from "./access-requests";
import { user } from "./auth";
import { createdAt, inList, inListOrNull, nullableTimestamp, updatedAt } from "./helpers";

/**
 * Email the admin writes from the console (src/server/services/email.ts).
 * One row per email, draft or sent, whether it goes to one address or to a
 * group; what happened to each recipient is in email_deliveries. `audience`
 * is what was chosen, not who that came to: the list is worked out and
 * frozen into deliveries at the moment of sending, and `to_label` keeps the
 * group's name as it read then. An email leaves `draft` once, under a row
 * lock, which is what makes a second Send do nothing.
 */
export const emails = pgTable(
  "emails",
  {
    id: serial().primaryKey(),
    status: text().notNull().default("draft"),
    subject: text().notNull().default(""),
    /** As typed, placeholders unresolved. */
    body: text().notNull().default(""),
    audience: jsonb().$type<EmailAudience>().notNull(),
    /** "Fall 2026 posters", or the one address, as it read when sent; null in a draft. */
    toLabel: text(),
    /** The access request this answers, and what sending does to it. */
    accessRequestId: integer().references(() => accessRequests.id, { onDelete: "set null" }),
    resolve: text(),
    /** Which From it went out under; null in a draft. */
    sender: text(),
    /** The admin who wrote it; null once that account is gone, so the record outlives it. */
    createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** When Send was confirmed and the recipients frozen. */
    sentAt: nullableTimestamp(),
    /** When the last recipient was settled. */
    finishedAt: nullableTimestamp(),
  },
  (t) => [
    index("emails_created_idx").on(t.createdAt),
    index("emails_request_idx").on(t.accessRequestId),
    check("emails_status_check", inList(t.status, EMAIL_STATUSES)),
    check("emails_resolve_check", inListOrNull(t.resolve, EMAIL_RESOLUTIONS)),
    check("emails_sender_check", inListOrNull(t.sender, EMAIL_SENDERS)),
  ],
);

/**
 * One row per recipient of an email, and one per test sent to the admin.
 * The unique index is the database's own "nobody gets one email twice".
 * When an account is deleted the row stays so the email's totals still add
 * up, but without the address or the name (forgetRecipient() in
 * src/server/data/emails.ts); `user_id` goes null by itself.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: serial().primaryKey(),
    emailId: integer()
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    userId: uuid().references(() => user.id, { onDelete: "set null" }),
    /** Lowercase, as sent; null once the person's account is gone. */
    address: text(),
    /** What {name} became for them, so their copy can be shown again without storing it. */
    greetedAs: text(),
    /** Whether they had a listing then: the footer says why they are getting it. */
    posted: boolean().notNull().default(false),
    status: text().notNull().default("queued"),
    /** Left out: `stop_email` or `banned`. Failed: what the mail provider said. */
    reason: text(),
    /** A test to the admin's own address, written as this recipient would get it. Never counted. */
    test: boolean().notNull().default(false),
    /** Sent to one person marked Stop email because the admin ticked "send anyway". */
    overridden: boolean().notNull().default(false),
    providerId: text(),
    attempts: smallint().notNull().default(0),
    lastAttemptAt: nullableTimestamp(),
    sentAt: nullableTimestamp(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("email_deliveries_once").on(t.emailId, t.address).where(sql`${t.test} = false`),
    index("email_deliveries_email_idx").on(t.emailId, t.status),
    index("email_deliveries_user_idx").on(t.userId),
    check("email_deliveries_status_check", inList(t.status, DELIVERY_STATUSES)),
  ],
);
