import { CAMPUS } from "@/config/site";

const EARTH_RADIUS_MILES = 3959;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in miles (haversine), as the legacy post form computed it. */
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function milesFromCampus(lat: number, lon: number): number {
  return milesBetween(CAMPUS.lat, CAMPUS.lon, lat, lon);
}

/** "0.4 mi from campus"; the legacy showed one decimal. */
export function formatMilesFromCampus(miles: number): string {
  return `${miles.toFixed(1)} mi from campus`;
}

/** Listings within about 10 m share a map pin: coordinates to four decimals. */
export function pinGroupKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
