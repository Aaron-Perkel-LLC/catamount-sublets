import { z } from "zod";
import { formatMoney } from "./format";
import {
  AMENITY_FILTER_VALUES,
  AMENITY_FILTERS,
  type AmenityFilter,
  LISTING_SORT_VALUES,
  type ListingSort,
  MIN_ROOMS_FILTERS,
  type MinRoomsFilter,
  OPEN_TO_FILTERS,
  OPEN_TO_VALUES,
  type OpenToFilter,
} from "./options";

/**
 * The Browse and Map query string, parsed leniently: an unusable value is
 * dropped rather than rejected, because these come from URLs people share.
 * An untouched slider leaves its parameter empty, so it is not a filter.
 */
export interface ListingQuery {
  /** Per-room price bounds (price_per_room), both or neither. */
  minPrice?: number;
  maxPrice?: number;
  semester?: string;
  maxDistance?: number;
  amenities: AmenityFilter[];
  negotiable: boolean;
  openTo?: OpenToFilter;
  /** At least this many rooms available (`rooms=2|3|4`). */
  minRooms?: MinRoomsFilter;
  /** Only listings whose poster said nobody stays (`no_roommates=1`). */
  noRoommates: boolean;
  sort: ListingSort;
  /** A deep link: open this listing, ignoring every filter. */
  id?: number;
  /** Where the deep link came from: "share" tags the arrival as a share link. */
  via?: string;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
};
const many = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

const money = z.coerce.number().min(0).max(1_000_000).optional().catch(undefined);
const distance = z.coerce.number().positive().max(10_000).optional().catch(undefined);
const sort = z.enum(LISTING_SORT_VALUES).catch("newest");
const openTo = z.enum(OPEN_TO_VALUES).optional().catch(undefined);
const amenity = z.enum(AMENITY_FILTER_VALUES);
const id = z.coerce.number().int().positive().optional().catch(undefined);
const minRooms = z.coerce
  .number()
  .refine((n): n is MinRoomsFilter => (MIN_ROOMS_FILTERS as readonly number[]).includes(n))
  .optional()
  .catch(undefined);

export function parseListingQuery(params: SearchParams): ListingQuery {
  let minPrice = money.parse(one(params.min_price));
  let maxPrice = money.parse(one(params.max_price));
  // Both or neither, as the legacy did: a lone bound is not a range.
  if (minPrice === undefined || maxPrice === undefined) minPrice = maxPrice = undefined;
  else if (minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];

  const semesterRaw = one(params.semester);
  return {
    minPrice,
    maxPrice,
    semester: semesterRaw && /^[a-z0-9_-]{1,40}$/i.test(semesterRaw) ? semesterRaw : undefined,
    maxDistance: distance.parse(one(params.max_distance)),
    amenities: [...new Set(many(params.amenities).filter((a) => amenity.safeParse(a).success))] as AmenityFilter[],
    negotiable: one(params.negotiable) === "1",
    openTo: openTo.parse(one(params.open_to)),
    minRooms: minRooms.parse(one(params.rooms)) as MinRoomsFilter | undefined,
    noRoommates: one(params.no_roommates) === "1",
    sort: sort.parse(one(params.sort)),
    id: id.parse(one(params.id)),
    via: one(params.via),
  };
}

/** How many filters are in use, for the phone's Filters badge. */
export function filterCount(q: ListingQuery): number {
  let n = 0;
  if (q.minPrice !== undefined) n++;
  if (q.semester) n++;
  if (q.maxDistance !== undefined) n++;
  n += q.amenities.length;
  if (q.negotiable) n++;
  if (q.openTo) n++;
  if (q.minRooms !== undefined) n++;
  if (q.noRoommates) n++;
  return n;
}

/**
 * The filter half of the query string (no sort, no empties), to carry across
 * Browse ↔ Map. Keys go out in a fixed order with defaults left out, and
 * newer filters are appended after the older ones, so a saved search stored
 * before them re-canonicalises to exactly its stored string.
 */
export function filterSearchParams(q: ListingQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.minPrice !== undefined && q.maxPrice !== undefined) {
    p.set("min_price", String(q.minPrice));
    p.set("max_price", String(q.maxPrice));
  }
  if (q.semester) p.set("semester", q.semester);
  if (q.maxDistance !== undefined) p.set("max_distance", String(q.maxDistance));
  for (const a of q.amenities) p.append("amenities", a);
  if (q.negotiable) p.set("negotiable", "1");
  if (q.openTo) p.set("open_to", q.openTo);
  if (q.minRooms !== undefined) p.set("rooms", String(q.minRooms));
  if (q.noRoommates) p.set("no_roommates", "1");
  return p;
}

/** A query string ("min_price=0&max_price=900&amenities=furnished") as the SearchParams Next.js hands a page. */
export function searchParamsFromString(query: string): SearchParams {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/**
 * A saved search's stored form: the filter half of the Browse query string,
 * run through the same lenient parser Browse uses and written back out, so
 * the same filters always store as the same string (sort, deep link and
 * anything unusable dropped). Amenities are sorted so their order in the URL
 * doesn't make two copies of one search.
 */
export function canonicalFilterQuery(query: string): string {
  const q = parseListingQuery(searchParamsFromString(query));
  return filterSearchParams({ ...q, amenities: [...q.amenities].sort() }).toString();
}

/** A stored saved search, read back exactly as Browse reads its URL. */
export function parseSavedQuery(query: string): ListingQuery {
  return parseListingQuery(searchParamsFromString(query));
}

/**
 * The filters in words, for a saved search's default name and its line on
 * Account: "Spring 2027 · $500–$900 · Within 1 mi · Furnished, Pets OK".
 * `semesterName` is the semester's display name when the caller knows it.
 */
export function describeFilters(q: ListingQuery, semesterName?: string): string {
  const bits: string[] = [];
  if (q.semester) bits.push(semesterName ?? q.semester);
  if (q.minPrice !== undefined && q.maxPrice !== undefined) bits.push(q.minPrice > 0 ? `${formatMoney(q.minPrice)}–${formatMoney(q.maxPrice)}` : `Up to ${formatMoney(q.maxPrice)}`);
  if (q.maxDistance !== undefined) bits.push(`Within ${q.maxDistance} mi`);
  if (q.amenities.length) bits.push(q.amenities.map((a) => AMENITY_FILTERS[a].label).join(", "));
  if (q.negotiable) bits.push("Negotiable");
  if (q.openTo) bits.push(OPEN_TO_FILTERS[q.openTo].label);
  if (q.minRooms !== undefined) bits.push(`${q.minRooms}+ rooms`);
  if (q.noRoommates) bits.push("No roommates");
  return bits.join(" · ") || "Every new listing";
}

/** describeFilters cut to fit a saved search's name. */
export function defaultSearchName(q: ListingQuery, semesterName: string | undefined, maxChars: number): string {
  const full = describeFilters(q, semesterName);
  return full.length <= maxChars ? full : `${full.slice(0, maxChars - 1).trimEnd()}…`;
}

export function withQuery(path: string, p: URLSearchParams): string {
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
