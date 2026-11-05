import { z } from "zod";
import { AMENITY_FILTER_VALUES, type AmenityFilter, LISTING_SORT_VALUES, type ListingSort, OPEN_TO_VALUES, type OpenToFilter } from "./options";

/**
 * The Browse and Map query string, parsed leniently: an unusable value is
 * dropped rather than rejected, because these come from URLs people share.
 * An untouched slider leaves its parameter empty, so it is not a filter.
 */
export interface ListingQuery {
  minPrice?: number;
  maxPrice?: number;
  semester?: string;
  maxDistance?: number;
  amenities: AmenityFilter[];
  negotiable: boolean;
  openTo?: OpenToFilter;
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
  return n;
}

/** The filter half of the query string (no sort, no empties), to carry across Browse ↔ Map. */
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
  return p;
}

export function withQuery(path: string, p: URLSearchParams): string {
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
