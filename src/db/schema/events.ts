import { bigint, boolean, char, check, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { EVENT_SOURCES, EVENT_TYPE_VALUES, SHARE_TARGETS } from "@/lib/options";
import { createdAt, inList, inListOrNull } from "./helpers";

/**
 * The activity log: who did what to which listing, with the "who" reduced to
 * a keyed hash (actor_key) so no page can ever say who viewed what. The log
 * started empty at cutover; the archived semesters' totals also live in
 * semester_archives.
 *
 * listing_id has no foreign key (like listing_outcomes): events outlive their
 * listing, its poster's account and the semester's archive, so past totals
 * don't shrink when a filled listing is deleted. They hold no name, email or
 * contact detail: the listing's number and the one-way actor code. Every
 * writer looks the listing up before inserting (src/server/data/events.ts),
 * so a made-up id is refused; an event racing a delete can still land for
 * the id just deleted, which is a real event and harmless.
 */
export const listingEvents = pgTable(
  "listing_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    listingId: integer().notNull(),
    /**
     * hmac_sha256(APP_SECRET, 'actor:' + user.id)[0:16]; for a signed-out
     * view, hmac_sha256(APP_SECRET, 'anon-view:' + Eastern date + ':' + IP + UA)[0:16],
     * which changes every day and from which the IP cannot be recovered.
     */
    actorKey: char({ length: 16 }).notNull(),
    /** A signed-out visitor's event: a listing view or a share-link arrival, the only two a signed-out visitor can record. */
    signedOut: boolean().notNull().default(false),
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
