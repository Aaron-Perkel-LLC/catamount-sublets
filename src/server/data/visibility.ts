import { and, eq, exists, sql, type SQL } from "drizzle-orm";
import { CAMPUS } from "@/config/site";
import { listingPhotos, listings, listingSemesters, semesters, user } from "@/db/schema";
import type { Audience } from "@/lib/viewer";

/**
 * A listing is on the board when its semester is visible, its poster has
 * not taken it down, it has a photo, and its poster is not banned. The rule
 * lives here, once, as query fragments: every query that shows listings to
 * students filters through publicListingWhere().
 *
 * A listing that runs for several semesters is visible while ANY of them is
 * active: a Summer and Fall listing stays up for Fall once Summer is
 * deactivated. (The legacy "code with no semesters row fails open" half is
 * gone: listing_semesters.semester_code is a foreign key now.)
 *
 * Every query that shows listings to students uses publicListingWhere().
 * visibleSemesterWhere() alone is for places that ask about semesters only:
 * the admin's "Hidden" flag and the Images tab.
 */
export function visibleSemesterWhere(): SQL {
  return exists(
    sql`(select 1 from ${listingSemesters} ls join ${semesters} sem on sem.code = ls.semester_code
         where ls.listing_id = ${listings.id} and sem.active)`,
  );
}

/** A listing with no photo is not on the board: a new listing goes live once its first photo is added. */
export function hasPhotoWhere(): SQL {
  return exists(sql`(select 1 from ${listingPhotos} lp where lp.listing_id = ${listings.id})`);
}

/**
 * A banned poster's listing comes off the board everywhere (it stays in the
 * database; unbanning puts it back). Until 16 Nov 2026 a ban only stopped
 * sign-in and the listing stayed up.
 */
export function posterNotBannedWhere(): SQL {
  return sql`not exists (select 1 from ${user} pu where pu.id = ${listings.userId} and coalesce(pu.banned, false))`;
}

/**
 * On the public board too (signed-out visitors and community accounts): the
 * poster has not kept it to students, and its approximate area has been
 * worked out. A missing area keeps it off (fails closed). Always ANDed onto
 * publicListingWhere(); audienceWhere() does both.
 */
export function publicAudienceWhere(): SQL {
  // Parenthesised: drizzle's not() and friends splice a raw fragment in as is.
  return sql`(not ${listings.signedInOnly} and ${listings.areaLat} is not null and ${listings.areaLon} is not null)`;
}

export function publicListingWhere(): SQL {
  return and(visibleSemesterWhere(), eq(listings.status, "open"), hasPhotoWhere(), posterNotBannedWhere())!;
}

/**
 * What a query may show. "full": students and the admin (every board
 * listing, the true point). "public": signed-out visitors and community
 * accounts (public listings only, measured from the approximate area,
 * returned as PublicListing). Pages get it from viewerAudience(getViewer())
 * (src/server/viewer.ts), never from "is there a session".
 */
export type { Audience };

/** The board for an audience: publicListingWhere(), plus publicAudienceWhere() for "public". */
export function audienceWhere(audience: Audience): SQL {
  return audience === "public" ? and(publicListingWhere(), publicAudienceWhere())! : publicListingWhere();
}

/**
 * Miles from campus, as the legacy computed it in SQL: the spherical law of
 * cosines with a LEAST(1, …) guard so acos never sees 1.0000001 and returns
 * NULL. Double precision in, so no casts per row. For "public", it measures
 * from the area's center, so neither the filter nor the sort can be used to
 * close in on the true point.
 */
export function campusDistanceMiles(audience: Audience): SQL<number> {
  const [pLat, pLon] = audience === "public" ? [listings.areaLat, listings.areaLon] : [listings.lat, listings.lon];
  const lat = sql`radians(${CAMPUS.lat})`;
  const lon = sql`radians(${CAMPUS.lon})`;
  return sql<number>`3959 * acos(least(1::double precision,
      cos(${lat}) * cos(radians(${pLat})) * cos(radians(${pLon}) - ${lon})
    + sin(${lat}) * sin(radians(${pLat}))))`;
}
