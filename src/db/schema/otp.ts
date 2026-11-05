import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createdAt } from "./helpers";

/**
 * One row per sign-in code sent, so the per-address throttle (no new code
 * within 60 s, at most 5 per hour) can be enforced in the auth before-hook.
 * Swept by the daily cron after a day. The address is the normalized one;
 * nothing else is stored.
 */
export const otpSends = pgTable(
  "otp_sends",
  {
    id: serial().primaryKey(),
    email: text().notNull(),
    sentAt: createdAt(),
  },
  (t) => [index("otp_sends_email_idx").on(t.email, t.sentAt)],
);
