import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, unique, uuid } from "drizzle-orm/pg-core";
import { ADMIN_MAIL_STATUSES } from "@/lib/admin-mail";
import { accessRequests } from "./access-requests";
import { user } from "./auth";
import { createdAt, inList } from "./helpers";

/**
 * One-off email the admin sent from the console (src/server/services/admin-mail.ts):
 * the record of what went to whom, including the sends that failed. A row is
 * written as `pending` before the send and settled after it; the idempotency
 * key (one per preview) is unique, so one preview is one send. A row still
 * pending five minutes after its last attempt may be tried again under the
 * same key (Resend dedupes it); the daily sweep fails any left pending an
 * hour. Rows to an address go when that person's account is deleted.
 */
export const adminMessages = pgTable(
  "admin_messages",
  {
    id: serial().primaryKey(),
    /** The admin who sent it; null once that account is gone, so the record outlives it. */
    senderId: uuid().references(() => user.id, { onDelete: "set null" }),
    recipient: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    status: text().notNull().default("pending"),
    /** Resend's message id once sent ("console" or "test" when mail was printed or collected instead). */
    resendId: text(),
    /** Why it failed, for the admin; null unless status is failed. */
    error: text(),
    idempotencyKey: text().notNull(),
    /** The access request this answers, if it is a reply to one. */
    accessRequestId: integer().references(() => accessRequests.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** When Send last tried it: set on the claim, moved on a retry of a stuck pending row. */
    attemptedAt: createdAt(),
  },
  (t) => [
    unique("admin_messages_idempotency_key").on(t.idempotencyKey),
    index("admin_messages_request_idx").on(t.accessRequestId),
    index("admin_messages_created_idx").on(t.createdAt),
    index("admin_messages_recipient_idx").on(sql`lower(${t.recipient})`),
    check("admin_messages_status_check", inList(t.status, ADMIN_MAIL_STATUSES)),
    check("admin_messages_recipient_lowercase_check", sql`${t.recipient} = lower(${t.recipient})`),
  ],
);
