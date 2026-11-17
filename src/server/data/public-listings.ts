import { and, count, eq, not, sql } from "drizzle-orm";
import { PUBLIC_AREA } from "@/config/site";
import type { DbOrTx } from "@/db";
import { listings } from "@/db/schema";
import { amenityCounts, listingCardTags, type AmenityFlags, type CardTag } from "@/lib/card-tags";
import { easternDate, postedAgo } from "@/lib/dates";
import { milesFromCampus } from "@/lib/distance";
import type { Area } from "@/lib/geo-fuzz";
import { filterCount, type ListingQuery } from "@/lib/listing-filters";
import { neighborhoodAt } from "@/lib/neighborhood";
import { sizeSummary, UTILITY_KINDS, type UtilityKind, type UtilityPayer } from "@/lib/options";
import { publicTitle } from "@/lib/public-title";
import { BROWSE_LIMIT, listingFilterWhere, orderFor, photosByListing } from "./listings";
import { labelFor, listingSemestersByListing } from "./semesters";
import { campusDistanceMiles, publicListingWhere, signedOutAudienceWhere } from "./visibility";

/**
 * The public surface (CLAUDE.md rule 9): everything a signed-out visitor
 * may learn about a listing, and the only listing shape any signed-out page,
 * prop, route handler, sitemap or metadata may take. There is no address,
 * no true coordinate, no real title (the address), no poster, no contact
 * no roommate gender or preference and no description (free text can hold
 * any of those, so it is signed-in only, and nothing derived from it is here
 * either), and toPublicListing() never reads them. Adding a field publishes it.
 */
export interface PublicListing {
  audience: "public";
  id: number;
  /** "2BR · Old North End": size and neighborhood, never the address. */
  title: string;
  price: number;
  priceNegotiable: boolean;
  semesterLabel: string;
  semesterCodes: string[];
  bedrooms: number | null;
  bathrooms: number | null;
  roommates: number | null;
  sizeSummary: string;
  /** From the approximate area's center, to 0.1 mi. */
  distanceMi: number;
  /** The named area the approximate center falls in, or "Burlington area". */
  neighborhood: string;
  /** A circle that contains the place, never centered on it (src/server/geo-fuzz.ts). */
  area: Area;
  amenities: AmenityFlags;
  utilities: Record<UtilityKind, UtilityPayer>;
  utilityCost: number | null;
  postedAgo: string;
  photos: { display: string; thumb: string | null }[];
  /** Amenity tags only (no roommate preference). */
  tags: CardTag[];
  moreTags: number;
}

/** The only columns a public listing is read from: no address, true point, description, poster or contact is selected at all. */
const PUBLIC_COLUMNS = {
  id: listings.id,
  price: listings.price,
  priceNegotiable: listings.priceNegotiable,
  bedrooms: listings.bedrooms,
  bathrooms: listings.bathrooms,
  roommates: listings.roommates,
  areaLat: listings.areaLat,
  areaLon: listings.areaLon,
  utilityElectric: listings.utilityElectric,
  utilityGas: listings.utilityGas,
  utilityWater: listings.utilityWater,
  utilityInternet: listings.utilityInternet,
  utilityCost: listings.utilityCost,
  amenityFreeParking: listings.amenityFreeParking,
  amenityPaidParking: listings.amenityPaidParking,
  amenityLaundryFree: listings.amenityLaundryFree,
  amenityLaundryPaid: listings.amenityLaundryPaid,
  amenityDishwasher: listings.amenityDishwasher,
  amenityAirConditioning: listings.amenityAirConditioning,
  amenityPetsAllowed: listings.amenityPetsAllowed,
  amenityFurnished: listings.amenityFurnished,
  postedAt: listings.postedAt,
};

type PublicRow = {
  [K in keyof typeof PUBLIC_COLUMNS]: (typeof PUBLIC_COLUMNS)[K]["_"]["notNull"] extends true
    ? (typeof PUBLIC_COLUMNS)[K]["_"]["data"]
    : (typeof PUBLIC_COLUMNS)[K]["_"]["data"] | null;
};

/** One listing, projected. The caller has already checked it is on the signed-out board. */
export function toPublicListing(
  r: PublicRow,
  extra: { semesterLabel: string; semesterCodes: string[]; photos: { display: string; thumb: string | null }[] },
): PublicListing {
  if (r.areaLat === null || r.areaLon === null) throw new Error(`listing ${r.id} has no area`);
  const area: Area = { lat: r.areaLat, lon: r.areaLon, radiusM: PUBLIC_AREA.radiusM };
  const neighborhood = neighborhoodAt(area.lat, area.lon);
  const amenities: AmenityFlags = {
    freeParking: r.amenityFreeParking,
    paidParking: r.amenityPaidParking,
    laundryFree: r.amenityLaundryFree,
    laundryPaid: r.amenityLaundryPaid,
    dishwasher: r.amenityDishwasher,
    airConditioning: r.amenityAirConditioning,
    petsAllowed: r.amenityPetsAllowed,
    furnished: r.amenityFurnished,
  };
  const utilities = {
    electric: r.utilityElectric,
    gas: r.utilityGas,
    water: r.utilityWater,
    internet: r.utilityInternet,
  } as Record<UtilityKind, UtilityPayer>;
  return {
    audience: "public",
    id: r.id,
    title: publicTitle(r.bedrooms, neighborhood),
    price: r.price,
    priceNegotiable: r.priceNegotiable,
    semesterLabel: extra.semesterLabel,
    semesterCodes: extra.semesterCodes,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    roommates: r.roommates,
    sizeSummary: sizeSummary(r),
    distanceMi: Math.round(milesFromCampus(area.lat, area.lon) * 10) / 10,
    neighborhood,
    area,
    amenities,
    utilities: Object.fromEntries(UTILITY_KINDS.map((k) => [k, utilities[k]])) as Record<UtilityKind, UtilityPayer>,
    utilityCost: r.utilityCost,
    postedAgo: postedAgo(r.postedAt),
    photos: extra.photos,
    tags: [],
    moreTags: 0,
  };
}

async function project(db: DbOrTx, rows: PublicRow[]): Promise<PublicListing[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [photos, semesters] = await Promise.all([photosByListing(db, ids), listingSemestersByListing(db, ids)]);
  const out = rows.map((r) => {
    const { label, codes } = labelFor(semesters.get(r.id) ?? [], true);
    return toPublicListing(r, { semesterLabel: label, semesterCodes: codes, photos: photos.get(r.id) ?? [] });
  });
  const counts = amenityCounts(out);
  return out.map((l) => {
    const { tags, more } = listingCardTags({ amenities: l.amenities, roommatePreference: "" }, counts);
    return { ...l, tags, moreTags: more };
  });
}

export interface PublicBrowseResult {
  listings: PublicListing[];
  filterCount: number;
}

/**
 * The signed-out board: Browse's own filter path (listingFilterWhere) with
 * the signed-out audience, so the distance filter and "Closest" sort run on
 * the approximate area, never the true point.
 */
export async function publicBoardListings(db: DbOrTx, q: ListingQuery): Promise<PublicBrowseResult> {
  const query = { ...q, openTo: undefined };
  const distance = campusDistanceMiles("signed-out");
  const rows = await db
    .select(PUBLIC_COLUMNS)
    .from(listings)
    .where(listingFilterWhere(query, distance, "signed-out"))
    .orderBy(...orderFor(query.sort, distance))
    .limit(BROWSE_LIMIT);
  return { listings: await project(db, rows), filterCount: filterCount(query) };
}

/** One listing for a signed-out visitor, or null when it is not on the signed-out board (the page 404s). */
export async function publicListingById(db: DbOrTx, id: number): Promise<PublicListing | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await db
    .select(PUBLIC_COLUMNS)
    .from(listings)
    .where(and(eq(listings.id, id), publicListingWhere(), signedOutAudienceWhere()))
    .limit(1);
  const [l] = await project(db, rows);
  return l ?? null;
}

/** How many listings the signed-out board has, before any filter. */
export async function publicBoardCount(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(listings)
    .where(and(publicListingWhere(), signedOutAudienceWhere()));
  return row?.n ?? 0;
}

/** Listings on the signed-in board that signed-out visitors cannot see: a count, nothing else. */
export async function signedInOnlyCount(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(listings)
    .where(and(publicListingWhere(), not(signedOutAudienceWhere())));
  return row?.n ?? 0;
}

/** Ids of the signed-out board and the Eastern date each last changed ("2026-11-16"; never the time), for the sitemap. */
export async function publicSitemapEntries(db: DbOrTx): Promise<{ id: number; lastModified: string }[]> {
  const rows = await db
    .select({ id: listings.id, updatedAt: sql<Date>`greatest(${listings.updatedAt}, ${listings.postedAt})`.mapWith(listings.updatedAt) })
    .from(listings)
    .where(and(publicListingWhere(), signedOutAudienceWhere()))
    .orderBy(listings.id);
  return rows.map((r) => ({ id: r.id, lastModified: easternDate(r.updatedAt) }));
}
