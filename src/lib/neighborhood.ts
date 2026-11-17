import { NEIGHBORHOOD_FALLBACK, NEIGHBORHOODS } from "@/config/site";

/** Ray casting on [lon, lat] rings; a point exactly on a border may land on either side. */
function inRing(lon: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The named area a point is in, or "Burlington area" outside them all. Only
 * ever called with the fuzzed center, so the name says nothing the circle
 * does not.
 */
export function neighborhoodAt(lat: number, lon: number): string {
  for (const n of NEIGHBORHOODS) if (inRing(lon, lat, n.ring)) return n.name;
  return NEIGHBORHOOD_FALLBACK;
}
