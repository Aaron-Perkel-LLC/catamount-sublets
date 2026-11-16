import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { OUTCOME_SOURCES, OUTCOME_VALUES } from "@/lib/listing-outcome";
import { createdAt, inList, updatedAt } from "./helpers";

/**
 * How a listing ended, in the poster's own answer: asked on delete and in
 * the email before its semester is archived. One row per listing, the latest
 * answer winning (except that a Skip never replaces an answer).
 *
 * No foreign key and nothing from the listing but its id: the row outlives
 * the listing (deleted, archived, or gone with its account) so the counts
 * survive, and it says nothing about who posted it or what it was.
 */
export const listingOutcomes = pgTable(
  "listing_outcomes",
  {
    id: serial().primaryKey(),
    listingId: integer().notNull(),
    outcome: text().notNull(),
    source: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("listing_outcomes_listing_id_key").on(t.listingId),
    check("listing_outcomes_outcome_check", inList(t.outcome, OUTCOME_VALUES)),
    check("listing_outcomes_source_check", inList(t.source, OUTCOME_SOURCES)),
    // The delete question has no "still available"; the email has no Skip.
    check("listing_outcomes_source_outcome_check", sql`(${t.source} = 'delete' and ${t.outcome} <> 'still_available') or (${t.source} = 'email' and ${t.outcome} <> 'skipped')`),
  ],
);

/**
 * The "still available?" email, one row per listing per semester it was sent
 * for: written before the send (so a second click cannot send twice) and
 * removed if the send fails (so a retry picks it up). No foreign keys, for
 * the same reason as listing_outcomes; the semester row may be deleted after
 * archiving too.
 */
export const listingOutcomeAsks = pgTable(
  "listing_outcome_asks",
  {
    id: serial().primaryKey(),
    semesterCode: text().notNull(),
    listingId: integer().notNull(),
    sentAt: createdAt(),
  },
  (t) => [unique("listing_outcome_asks_semester_listing_key").on(t.semesterCode, t.listingId), index("listing_outcome_asks_listing_idx").on(t.listingId)],
);
