import { and, eq, exists, sql, type SQL } from "drizzle-orm";
import { CAMPUS } from "@/config/site";
import { listingPhotos, listings, listingSemesters, semesters } from "@/db/schema";

/**
 * A listing is on the board when its semester is visible AND its poster has
 * not taken it down. The rule lives here, once, as query fragments.
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

export function publicListingWhere(): SQL {
  return and(visibleSemesterWhere(), eq(listings.status, "open"), hasPhotoWhere())!;
}

/**
 * Miles from campus, as the legacy computed it in SQL: the spherical law of
 * cosines with a LEAST(1, …) guard so acos never sees 1.0000001 and returns
 * NULL. Double precision in, so no casts per row.
 */
export function campusDistanceMiles(): SQL<number> {
  const lat = sql`radians(${CAMPUS.lat})`;
  const lon = sql`radians(${CAMPUS.lon})`;
  return sql<number>`3959 * acos(least(1::double precision,
      cos(${lat}) * cos(radians(${listings.lat})) * cos(radians(${listings.lon}) - ${lon})
    + sin(${lat}) * sin(radians(${listings.lat}))))`;
}
