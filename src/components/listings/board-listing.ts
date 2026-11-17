import type { ListingDto } from "@/server/data/listings";
import type { PublicListing } from "@/server/data/public-listings";

/**
 * What the board's components take: the signed-in DTO or the public
 * projection, never both on one page. Anything only the DTO has (address,
 * pin, poster, contact) is reached through isPublicListing() first, so the
 * signed-out branch cannot touch it.
 */
export type BoardListing = ListingDto | PublicListing;

export function isPublicListing(l: BoardListing): l is PublicListing {
  return l.audience === "public";
}

/** The card and dialog heading: the address when signed in, "2BR · Old North End" when not. */
export function headingOf(l: BoardListing): string {
  return isPublicListing(l) ? l.title : l.shortAddress;
}

/** Where the map puts it: the pin when signed in, the approximate area's center when not. */
export function pointOf(l: BoardListing): { lat: number; lon: number } {
  return isPublicListing(l) ? { lat: l.area.lat, lon: l.area.lon } : { lat: l.lat, lon: l.lon };
}
