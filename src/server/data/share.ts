import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listingPhotos, listings } from "@/db/schema";
import { milesFromCampus } from "@/lib/distance";
import type { PriceBasis } from "@/lib/options";
import { shareCardLines, type ShareCardLines, verifyShareToken } from "@/lib/share";
import { fuzzedArea } from "@/server/geo-fuzz";
import { labelFor, listingSemestersByListing } from "./semesters";
import { publicListingWhere, visibleSemesterWhere } from "./visibility";

/**
 * What a share link resolves to. Read by anyone, crawlers included, so it
 * carries the card lines and the cover's card image and nothing else. A bad
 * token, an unknown id, a hidden or paused listing all look the same
 * ("unavailable"), so the page is not an oracle for which ids exist. A taken
 * listing behind a genuine token is the one exception, and even then nothing
 * of the listing is returned.
 */
export type ShareResolution =
  | { state: "open"; id: number; lines: ShareCardLines; cardImageUrl: string | null; fingerprint: string }
  | { state: "taken" }
  | { state: "unavailable" };

/**
 * Bumped when every card's content changes at once, so the CDN and the
 * apps that cached a card under the old URL fetch the new one. v2 (16 Nov
 * 2026): the distance is measured from the approximate area, not the house.
 */
const CARD_VERSION = "v2";

export async function resolveShare(db: DbOrTx, id: number, token: string): Promise<ShareResolution> {
  const [row] = await db
    .select({
      id: listings.id,
      price: listings.price,
      pricePerRoom: listings.pricePerRoom,
      priceBasis: listings.priceBasis,
      roomsAvailable: listings.roomsAvailable,
      priceNegotiable: listings.priceNegotiable,
      bedrooms: listings.bedrooms,
      bathrooms: listings.bathrooms,
      roommates: listings.roommates,
      status: listings.status,
      legacyToken: listings.legacyShareToken,
      lat: listings.lat,
      lon: listings.lon,
    })
    .from(listings)
    .where(and(eq(listings.id, id), visibleSemesterWhere(), inArray(listings.status, ["open", "taken"])))
    .limit(1);
  if (!row || !verifyShareToken(id, token, row.legacyToken)) return { state: "unavailable" };
  if (row.status === "taken") return { state: "taken" };

  // Open: must also be on the board (a listing with no photo is not).
  const [onBoard] = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.id, id), publicListingWhere())).limit(1);
  if (!onBoard) return { state: "unavailable" };

  const semesters = await listingSemestersByListing(db, [id]);
  const { label } = labelFor(semesters.get(id) ?? [], true);
  const [cover] = await db
    .select({ cardUrl: listingPhotos.cardUrl, stem: listingPhotos.stem })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, id))
    .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.id))
    .limit(1);
  // From the approximate area, as the signed-out board shows it (works for a signed-in-only listing too:
  // its share link still works, and the card must not be more exact than the public board).
  const area = fuzzedArea(row.lat, row.lon);
  const lines = shareCardLines({
    price: row.price,
    pricePerRoom: row.pricePerRoom,
    priceBasis: row.priceBasis as PriceBasis,
    roomsAvailable: row.roomsAvailable,
    priceNegotiable: row.priceNegotiable,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    roommates: row.roommates,
    distanceMi: milesFromCampus(area.lat, area.lon),
    semesterLabel: label,
  });
  const fingerprint = fingerprintOf([CARD_VERSION, cover?.stem ?? "", lines.price, lines.semester, lines.facts, String(lines.negotiable)]);
  return { state: "open", id, lines, cardImageUrl: cover?.cardUrl ?? null, fingerprint };
}

/** A short cache key for the card image: changes when the photo or any line does. */
function fingerprintOf(parts: string[]): string {
  let h = 2166136261;
  for (const ch of parts.join("\u0000")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
