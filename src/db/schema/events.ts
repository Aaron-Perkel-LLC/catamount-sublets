import { bigint, char, check, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { EVENT_SOURCES, EVENT_TYPE_VALUES, SHARE_TARGETS } from "@/lib/options";
import { createdAt, inList, inListOrNull } from "./helpers";
import { listings } from "./listings";

/**
 * The activity log: who did what to which listing, with the "who" reduced to
 * a keyed hash (actor_key) so no page can ever say who viewed what. Events
 * are deleted with their listing. The log started empty at cutover; the
 * archived semesters' totals live in semester_archives.
 */
export const listingEvents = pgTable(
  "listing_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    listingId: integer()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** hmac_sha256(APP_SECRET, 'actor:' + user.id)[0:16]. */
    actorKey: char({ length: 16 }).notNull(),
    /** The listing's first semester at the time, so archiving can count by semester. */
    semesterCode: text(),
    type: text().notNull(),
    source: text(),
    target: text(),
    /** "type:listingId:actorKey:YYYY-MM-DD" (Eastern) for the deduplicated types. */
    dedupeKey: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("listing_events_dedupe_key").on(t.dedupeKey),
    index("listing_events_listing_idx").on(t.listingId, t.type, t.createdAt),
    index("listing_events_actor_idx").on(t.actorKey, t.createdAt),
    index("listing_events_semester_idx").on(t.semesterCode),
    index("listing_events_created_idx").on(t.createdAt),
    check("listing_events_type_check", inList(t.type, EVENT_TYPE_VALUES)),
    check("listing_events_source_check", inListOrNull(t.source, EVENT_SOURCES)),
    check("listing_events_target_check", inListOrNull(t.target, SHARE_TARGETS)),
  ],
);
