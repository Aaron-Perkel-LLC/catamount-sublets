import { PUBLIC_AREA } from "@/config/site";

/**
 * The geometry of the approximate area (no secrets here; the per-listing
 * bytes come from src/server/geo-fuzz.ts). Flat-earth offsets are exact
 * enough at these distances: the error over 150 m is under a millimetre.
 */

const METERS_PER_DEGREE_LAT = 111_320;

export interface Area {
  lat: number;
  lon: number;
  radiusM: number;
}

/** The point `meters` from (lat, lon) on `bearing` radians clockwise from north. */
export function offsetPoint(lat: number, lon: number, bearing: number, meters: number): { lat: number; lon: number } {
  const dLat = (meters * Math.cos(bearing)) / METERS_PER_DEGREE_LAT;
  const dLon = (meters * Math.sin(bearing)) / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Metres between two nearby points (equirectangular). */
export function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const x = (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180) * METERS_PER_DEGREE_LAT;
  const y = (lat2 - lat1) * METERS_PER_DEGREE_LAT;
  return Math.hypot(x, y);
}

/**
 * The area's center from the true point and six key bytes: a bearing from
 * the first four, a distance in [minOffsetM, maxOffsetM] from the last two.
 * The circle is never centered on the house and always contains it.
 */
export function areaFromKey(lat: number, lon: number, key: Uint8Array): Area {
  if (key.length < 6) throw new Error("geo-fuzz key too short");
  const turn = ((key[0] << 24) | (key[1] << 16) | (key[2] << 8) | key[3]) >>> 0;
  const bearing = (turn / 2 ** 32) * 2 * Math.PI;
  const span = ((key[4] << 8) | key[5]) / 0xffff;
  const meters = PUBLIC_AREA.minOffsetM + span * (PUBLIC_AREA.maxOffsetM - PUBLIC_AREA.minOffsetM);
  const p = offsetPoint(lat, lon, bearing, meters);
  // Rounded to about a metre: enough for a 150 m circle, and nothing finer to learn from.
  return { lat: round(p.lat, 5), lon: round(p.lon, 5), radiusM: PUBLIC_AREA.radiusM };
}

/** A closed [lon, lat] ring approximating the circle, for a map polygon. */
export function circleRing(area: Area, steps = 64): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const p = offsetPoint(area.lat, area.lon, (i / steps) * 2 * Math.PI, area.radiusM);
    ring.push([round(p.lon, 6), round(p.lat, 6)]);
  }
  ring.push(ring[0]);
  return ring;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
