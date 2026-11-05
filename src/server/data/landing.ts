import { asc, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listingPhotos, listings } from "@/db/schema";
import { semesterLabel } from "@/lib/semesters";
import { boardSemesters } from "./semesters";
import { publicListingWhere } from "./visibility";

export interface LandingBoard {
  /** Cover thumbnails of the newest listings on the board, for the photo board. */
  thumbs: string[];
  count: number;
  /** "Spring 2027" / "Spring & Summer 2027" / "" */
  semesters: string;
}

/**
 * The front page's facts: what is on the board right now. Public, and read
 * without a session, so it carries thumbnails and counts only.
 */
export async function landingBoard(db: DbOrTx): Promise<LandingBoard> {
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(publicListingWhere())
    .orderBy(desc(listings.id));
  const ids = rows.map((r) => r.id);
  const thumbs: string[] = [];
  for (const id of ids.slice(0, 12)) {
    const [cover] = await db
      .select({ thumb: listingPhotos.thumbUrl })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, id))
      .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.id))
      .limit(1);
    if (cover?.thumb) thumbs.push(cover.thumb);
  }
  const sems = await boardSemesters(db);
  return { thumbs, count: ids.length, semesters: semesterLabel(sems.map((s) => s.name)) };
}
