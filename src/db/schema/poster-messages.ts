import { check, index, integer, pgTable, serial, text, unique, uuid } from "drizzle-orm/pg-core";
import { POSTER_MESSAGE_STATUSES } from "@/lib/poster-message";
import { user } from "./auth";
import { createdAt, inList } from "./helpers";
import { listings } from "./listings";

/**
 * Messages community accounts sent posters through the site's relay
 * (src/server/services/poster-message.ts): kept for abuse review and the
 * metrics, deleted after 180 days by the daily sweep, and with either
 * person's account. A row is written `pending` before the send and settled
 * after it; the idempotency key (one per opened form) is unique, so one form
 * is one email. The listing may go first: the row stays, listing_id null.
 */
export const posterMessages = pgTable(
  "poster_messages",
  {
    id: serial().primaryKey(),
    listingId: integer().references(() => listings.id, { onDelete: "set null" }),
    posterId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    senderId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text().notNull(),
    status: text().notNull().default("pending"),
    /** Resend's message id once sent ("console" or "test" when printed or collected instead). */
    resendId: text(),
    /** Why it failed, for the admin; null unless failed. */
    error: text(),
    idempotencyKey: text().notNull(),
    createdAt: createdAt(),
    /** When the send was last tried: set on the claim, moved on a retry of a stuck pending row. */
    attemptedAt: createdAt(),
  },
  (t) => [
    unique("poster_messages_idempotency_key").on(t.idempotencyKey),
    index("poster_messages_sender_idx").on(t.senderId, t.createdAt),
    index("poster_messages_listing_idx").on(t.listingId, t.createdAt),
    index("poster_messages_poster_idx").on(t.posterId),
    index("poster_messages_created_idx").on(t.createdAt),
    check("poster_messages_status_check", inList(t.status, POSTER_MESSAGE_STATUSES)),
  ],
);
