import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { listingEvents } from "@/db/schema";
import type { ViewerSegment } from "@/lib/viewer-segment";

/**
 * An event's viewer segment as SQL, for grouping. The one place the metrics
 * decide who a viewer was (see src/lib/viewer-segment.ts); phase 31 reads
 * listing_events.viewer_tier here instead.
 */
export function segmentSql(): SQL<ViewerSegment> {
  return sql<ViewerSegment>`(case when ${listingEvents.signedOut} then 'signed_out' else 'signed_in' end)`;
}
