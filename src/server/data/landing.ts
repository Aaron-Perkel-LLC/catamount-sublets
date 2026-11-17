import { and, asc, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listingPhotos, listings } from "@/db/schema";
import { semesterLabel } from "@/lib/semesters";
import { boardSemesters } from "./semesters";
import { publicListingWhere, signedOutAudienceWhere } from "./visibility";

export interface LandingBoard {
  /** Cover thumbnails of the newest listings on the signed-out board (a listing kept to signed-in students never shows here). */
  thumbs: string[];
  count: number;
  /** "Spring 2027" / "Spring & Summer 2027" / "" */
  semesters: string;
}

/**
 * The front page's facts: what is on the board right now. Public, and read
 * without a session, so it carries thumbnails and counts only. The count is
 * the whole board; the covers come only from listings shown to signed-out
 * visitors.
 */
export async function landingBoard(db: DbOrTx): Promise<LandingBoard> {
  const [all, open] = await Promise.all([
    db.select({ id: listings.id }).from(listings).where(publicListingWhere()),
    db
      .select({ id: listings.id })
      .from(listings)
      .where(and(publicListingWhere(), signedOutAudienceWhere()))
      .orderBy(desc(listings.id))
      .limit(12),
  ]);
  const thumbs: string[] = [];
  for (const { id } of open) {
    const [cover] = await db
      .select({ thumb: listingPhotos.thumbUrl })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, id))
      .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.id))
      .limit(1);
    if (cover?.thumb) thumbs.push(cover.thumb);
  }
  // The semesters of the signed-out board: everyone sees this page, and a semester only signed-in-only listings run for stays unnamed.
  const sems = await boardSemesters(db, "signed-out");
  return { thumbs, count: all.length, semesters: semesterLabel(sems.map((s) => s.name)) };
}
