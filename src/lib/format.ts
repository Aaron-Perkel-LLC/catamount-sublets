/**
 * Display formatting. Addresses are stored exactly as the geocoder returned
 * them (the raw string is what a future re-geocode would match against);
 * these helpers only change what is rendered.
 */

const US_STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

const STATE_WORDS = new Set<string>();
for (const [name, abbr] of Object.entries(US_STATES)) {
  STATE_WORDS.add(name.toLowerCase());
  STATE_WORDS.add(abbr.toLowerCase());
}

/**
 * Trim the administrative tail off a geocoded address: the country, a US ZIP,
 * the state and any "… County" — trailing segments only, so a street called
 * "County Road" survives. A bare leading house number ("62, King Street") is
 * joined to the street.
 */
export function formatAddress(address: string | null | undefined): string {
  const trimmed = (address ?? "").trim();
  if (trimmed === "") return "";
  const parts = trimmed.split(",").map((p) => p.trim());
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    const isCountry = /^(united states|usa)$/i.test(last);
    const isZip = /^\d{5}(-\d{4})?$/.test(last);
    const isState = STATE_WORDS.has(last.toLowerCase());
    const isCounty = /\bCounty$/i.test(last);
    if (isCountry || isZip || isState || isCounty) {
      parts.pop();
      continue;
    }
    break;
  }
  if (parts.length > 1 && /^\d+[a-zA-Z]?$/.test(parts[0])) {
    const number = parts.shift()!;
    parts[0] = `${number} ${parts[0]}`;
  }
  return parts.join(", ");
}

/** A geocoder result's structured address, as Nominatim and Photon shape it. */
export interface GeocodeAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  hamlet?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

/**
 * A short address from structured fields: "62 King Street, Downtown,
 * Burlington". Falls back to formatAddress(displayName) when there is no road
 * (a point of interest carries its name only in the display string).
 */
export function shortAddressFromDetails(displayName: string, a: GeocodeAddress | null | undefined): string {
  if (!a || !a.road) return formatAddress(displayName);
  const parts = [`${a.house_number ?? ""} ${a.road}`.trim()];
  const area = a.neighbourhood ?? a.suburb ?? a.hamlet ?? "";
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
  if (area !== "") parts.push(area);
  if (city !== "" && city.toLowerCase() !== area.toLowerCase()) parts.push(city);
  return parts.join(", ");
}

/**
 * Links to the place in Google Maps and Apple Maps. When the stored address
 * names no state and the point is in Vermont's longitude band, ", VT" is
 * added so a street name shared with other towns resolves locally.
 */
export function listingMapLinks(address: string, lat: number, lon: number): { google: string; apple: string } {
  const parts = address.split(",").map((p) => p.trim().toLowerCase());
  const hasState = parts.some((p) => STATE_WORDS.has(p));
  const query = !hasState && lon > -73.35 && lat < 45.0 ? `${address}, VT` : address;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    apple: `https://maps.apple.com/?q=${encodeURIComponent(query)}&ll=${lat},${lon}`,
  };
}

/** "$1,200" — rent is shown without cents. */
export function formatMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** "820 KB", "12.4 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
