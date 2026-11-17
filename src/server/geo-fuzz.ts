import { createHmac } from "node:crypto";
import { type Area, areaFromKey, cellCenter, gridCell } from "@/lib/geo-fuzz";
import { appSecret } from "@/lib/share";

/**
 * The approximate area shown to signed-out visitors for a place at (lat,
 * lon). Keyed by the place, not the listing: the true point is snapped to
 * its PUBLIC_AREA.gridM cell, and the circle is a fixed offset of that
 * cell's center by HMAC(APP_SECRET, "geo-fuzz-cell:" + cell). So every
 * listing in one house (roommates, a repost, a re-geocode a few metres off
 * in the same cell) gets the same circle, and several of them cannot be
 * intersected to narrow it down. Deterministic, so there is nothing to
 * average away; secret, so the offset cannot be undone. Domain-separated
 * from share tokens ("sublet:") and actor keys ("actor:").
 */
export function fuzzedArea(lat: number, lon: number): Area {
  const cell = gridCell(lat, lon);
  const key = createHmac("sha256", appSecret()).update(`geo-fuzz-cell:${cell.row}:${cell.col}`).digest();
  const center = cellCenter(cell);
  return areaFromKey(center.lat, center.lon, key);
}
