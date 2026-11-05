import { and, asc, desc, eq, exists, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db";
import { listingPhotos, listings, listingSemesters, user } from "@/db/schema";
import { amenityCounts, listingCardTags, type AmenityFlags, type CardTag } from "@/lib/card-tags";
import { shareUrl } from "@/lib/share";
import { postedAgo } from "@/lib/dates";
import { formatAddress, listingMapLinks } from "@/lib/format";
import { filterCount, type ListingQuery } from "@/lib/listing-filters";
import {
  AMENITY_FILTERS,
  type AmenityKey,
  type ListingSort,
  type ListingStatus,
  OPEN_TO_FILTERS,
  ROOMMATE_GENDER_OPTIONS,
  ROOMMATE_PREFERENCE_OPTIONS,
  type RoommateGender,
  type RoommatePreference,
  sizeSummary,
  UTILITY_KINDS,
  type UtilityKind,
  type UtilityPayer,
} from "@/lib/options";
import { posterColumns, shownName, type PosterColumns } from "./names";
import { labelFor, listingSemestersByListing } from "./semesters";
import { campusDistanceMiles, publicListingWhere } from "./visibility";

/** What a card and the listing view need. No contact details, no owner id. */
export interface ListingDto {
  id: number;
  price: number;
  priceNegotiable: boolean;
  address: string;
  shortAddress: string;
  lat: number;
  lon: number;
  mapsUrl: string;
  appleMapsUrl: string;
  semesterLabel: string;
  semesterCodes: string[];
  bedrooms: number | null;
  bathrooms: number | null;
  roommates: number | null;
  sizeSummary: string;
  roommateGender: RoommateGender;
  roommateGenderLabel: string;
  roommatePreference: RoommatePreference;
  roommatePreferenceLabel: string;
  description: string;
  utilities: Record<UtilityKind, UtilityPayer>;
  utilityCost: number | null;
  amenities: AmenityFlags;
  status: ListingStatus;
  postedAt: string;
  postedAgo: string;
  /** The poster's first and last name; null when there is none to show (never a login). */
  posterName: string | null;
  isMine: boolean;
  /** Whether a phone number is on the listing; the number itself is fetched on demand. */
  hasPhone: boolean;
  distanceMi: number;
  photos: { display: string; thumb: string | null }[];
  tags: CardTag[];
  moreTags: number;
  /** Built server-side so the secret never reaches the client. */
  shareUrl: string;
}

const AMENITY_COLUMNS: Record<AmenityKey, PgColumn> = {
  freeParking: listings.amenityFreeParking,
  paidParking: listings.amenityPaidParking,
  laundryFree: listings.amenityLaundryFree,
  laundryPaid: listings.amenityLaundryPaid,
  dishwasher: listings.amenityDishwasher,
  airConditioning: listings.amenityAirConditioning,
  petsAllowed: listings.amenityPetsAllowed,
  furnished: listings.amenityFurnished,
};

/** The WHERE for Browse and Map: visibility plus every filter in use. */
export function listingFilterWhere(q: ListingQuery, distance: SQL<number>): SQL {
  const parts: (SQL | undefined)[] = [publicListingWhere()];
  if (q.minPrice !== undefined && q.maxPrice !== undefined) {
    parts.push(gte(listings.price, q.minPrice), lte(listings.price, q.maxPrice));
  }
  if (q.semester) {
    parts.push(
      exists(
        sql`(select 1 from ${listingSemesters} fs where fs.listing_id = ${listings.id} and fs.semester_code = ${q.semester})`,
      ),
    );
  }
  if (q.maxDistance !== undefined) parts.push(sql`${distance} <= ${q.maxDistance}`);
  for (const chip of q.amenities) {
    const flags = AMENITY_FILTERS[chip].flags;
    parts.push(or(...flags.map((f) => eq(AMENITY_COLUMNS[f], true))));
  }
  if (q.negotiable) parts.push(eq(listings.priceNegotiable, true));
  if (q.openTo) {
    const prefs = OPEN_TO_FILTERS[q.openTo].prefs;
    parts.push(or(eq(listings.roommatePreference, ""), inArray(listings.roommatePreference, [...prefs])));
  }
  return and(...parts)!;
}

function orderFor(sort: ListingSort, distance: SQL<number>): SQL[] {
  switch (sort) {
    case "oldest":
      return [asc(listings.id)];
    case "price_asc":
      return [asc(listings.price), desc(listings.id)];
    case "price_desc":
      return [desc(listings.price), desc(listings.id)];
    case "closest":
      return [asc(distance), desc(listings.id)];
    default:
      return [desc(listings.id)];
  }
}

const BROWSE_LIMIT = 200;

export interface BrowseResult {
  listings: ListingDto[];
  filterCount: number;
}

/**
 * The listings on the board for a query, with photos and semester labels
 * attached in two more queries (one per table, for the whole page). The
 * viewer's id only decides `isMine`.
 */
export async function browseListings(db: DbOrTx, q: ListingQuery, viewerId: string | null): Promise<BrowseResult> {
  const distance = campusDistanceMiles();
  const rows = await db
    .select({ l: listings, email: user.email, poster: posterColumns, distanceMi: distance })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(listingFilterWhere(q, distance))
    .orderBy(...orderFor(q.sort, distance))
    .limit(BROWSE_LIMIT);
  return { listings: await toDtos(db, rows, viewerId), filterCount: filterCount(q) };
}

/**
 * One listing by id if it is on the board (or the viewer's own, any status).
 * `anyVisibility` is for the admin pages only: paused, taken and hidden too.
 */
export async function listingForViewer(db: DbOrTx, id: number, viewerId: string | null, opts: { anyVisibility?: boolean } = {}): Promise<ListingDto | null> {
  const distance = campusDistanceMiles();
  const visible = opts.anyVisibility
    ? sql`true`
    : viewerId
      ? or(publicListingWhere(), eq(listings.userId, viewerId))!
      : publicListingWhere();
  const rows = await db
    .select({ l: listings, email: user.email, poster: posterColumns, distanceMi: distance })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(and(eq(listings.id, id), visible))
    .limit(1);
  const [dto] = await toDtos(db, rows, viewerId);
  return dto ?? null;
}

type Row = { l: typeof listings.$inferSelect; email: string; poster: PosterColumns; distanceMi: number };

async function toDtos(db: DbOrTx, rows: Row[], viewerId: string | null): Promise<ListingDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.l.id);
  const [photos, semesters] = await Promise.all([photosByListing(db, ids), listingSemestersByListing(db, ids)]);
  const partial = rows.map(({ l, email, poster, distanceMi }) => {
    const amenities: AmenityFlags = {
      freeParking: l.amenityFreeParking,
      paidParking: l.amenityPaidParking,
      laundryFree: l.amenityLaundryFree,
      laundryPaid: l.amenityLaundryPaid,
      dishwasher: l.amenityDishwasher,
      airConditioning: l.amenityAirConditioning,
      petsAllowed: l.amenityPetsAllowed,
      furnished: l.amenityFurnished,
    };
    const { label, codes } = labelFor(semesters.get(l.id) ?? [], true);
    const links = listingMapLinks(l.address, l.lat, l.lon);
    const gender = l.roommateGender as RoommateGender;
    const pref = l.roommatePreference as RoommatePreference;
    return {
      row: { amenities, roommatePreference: pref },
      dto: {
        id: l.id,
        price: l.price,
        priceNegotiable: l.priceNegotiable,
        address: l.address,
        shortAddress: formatAddress(l.address),
        lat: l.lat,
        lon: l.lon,
        mapsUrl: links.google,
        appleMapsUrl: links.apple,
        semesterLabel: label,
        semesterCodes: codes,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        roommates: l.roommates,
        sizeSummary: sizeSummary(l),
        roommateGender: gender,
        roommateGenderLabel: gender ? ROOMMATE_GENDER_OPTIONS[gender] : "",
        roommatePreference: pref,
        roommatePreferenceLabel: pref ? ROOMMATE_PREFERENCE_OPTIONS[pref] : "",
        description: l.description ?? "",
        utilities: Object.fromEntries(
          UTILITY_KINDS.map((k) => [k, l[`utility${k[0].toUpperCase()}${k.slice(1)}` as `utility${Capitalize<UtilityKind>}`] as UtilityPayer]),
        ) as Record<UtilityKind, UtilityPayer>,
        utilityCost: l.utilityCost,
        amenities,
        status: l.status as ListingStatus,
        postedAt: l.postedAt.toISOString(),
        postedAgo: postedAgo(l.postedAt),
        posterName: shownName(l, poster, email),
        isMine: viewerId !== null && l.userId === viewerId,
        hasPhone: Boolean(l.contactPhone?.trim()),
        distanceMi: Number(distanceMi),
        photos: photos.get(l.id) ?? [],
        tags: [] as CardTag[],
        moreTags: 0,
        shareUrl: shareUrl(l.id),
      } satisfies ListingDto,
    };
  });
  const counts = amenityCounts(partial.map((p) => p.row));
  return partial.map(({ row, dto }) => {
    const { tags, more } = listingCardTags(row, counts);
    return { ...dto, tags, moreTags: more };
  });
}

/** Every photo of each listing, in gallery order, one query. */
export async function photosByListing(
  db: DbOrTx,
  ids: readonly number[],
): Promise<Map<number, { display: string; thumb: string | null }[]>> {
  const map = new Map<number, { display: string; thumb: string | null }[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ listingId: listingPhotos.listingId, display: listingPhotos.displayUrl, thumb: listingPhotos.thumbUrl })
    .from(listingPhotos)
    .where(inArray(listingPhotos.listingId, [...ids]))
    .orderBy(asc(listingPhotos.listingId), asc(listingPhotos.sortOrder), asc(listingPhotos.id));
  for (const r of rows) {
    const list = map.get(r.listingId) ?? [];
    list.push({ display: r.display, thumb: r.thumb || null });
    map.set(r.listingId, list);
  }
  return map;
}

export interface FilterBounds {
  minPrice: number;
  maxPrice: number;
  maxDistance: number;
}

/**
 * Slider bounds from the listings people can actually see, so a hidden or
 * paused listing cannot stretch a slider. Prices to the nearest $50, distance
 * to the nearest half mile; defaults when the board is empty.
 */
export async function filterBounds(db: DbOrTx): Promise<FilterBounds> {
  const distance = campusDistanceMiles();
  const [row] = await db
    .select({
      min: sql<number | null>`min(${listings.price})::float`,
      max: sql<number | null>`max(${listings.price})::float`,
      dist: sql<number | null>`max(${distance})::float`,
    })
    .from(listings)
    .where(publicListingWhere());
  const maxPrice = Math.max(Math.ceil((row?.max ?? 3000) / 50) * 50, 100);
  const minPrice = Math.min(Math.floor((row?.min ?? 0) / 50) * 50, maxPrice - 50);
  const maxDistance = Math.max(Math.ceil((row?.dist ?? 20) * 2) / 2, 1);
  return { minPrice, maxPrice, maxDistance };
}

/** True when any listing exists at all (for the empty state's wording). */
export async function anyListingExists(db: DbOrTx): Promise<boolean> {
  const [row] = await db.select({ id: listings.id }).from(listings).limit(1);
  return Boolean(row);
}

export interface ContactDetails {
  email: string;
  phone: string | null;
  /** The poster's first and last name; null when there is none to show (never a login). */
  posterName: string | null;
}

/**
 * The poster's contact details, fetched only when the panel opens and only
 * for a listing the viewer may see. The account email is the fallback when
 * the poster left the contact email blank.
 */
export async function contactDetails(db: DbOrTx, id: number, viewerId: string, isAdmin: boolean): Promise<ContactDetails | null> {
  const visible = isAdmin ? sql`true` : or(publicListingWhere(), eq(listings.userId, viewerId))!;
  const [row] = await db
    .select({ contactEmail: listings.contactEmail, phone: listings.contactPhone, displayName: listings.displayName, email: user.email, poster: posterColumns })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(and(eq(listings.id, id), visible))
    .limit(1);
  if (!row) return null;
  return {
    email: row.contactEmail?.trim() || row.email,
    phone: row.phone?.trim() || null,
    posterName: shownName(row, row.poster, row.email),
  };
}
