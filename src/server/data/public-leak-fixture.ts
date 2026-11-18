import { ALLOWED_EMAIL_DOMAINS } from "@/config/site";

/**
 * A listing built to be easy to spot, for the tests that prove a signed-out
 * visitor never receives its address, true point, poster or contact: a
 * made-up street, a house number, coordinates with distinctive digits, a
 * poster with an unusual name, and a description that repeats its own
 * address, a phone number and an email. Test-only; nothing imports it at runtime.
 */
export const SECRET = {
  street: "Quillfeather",
  number: "4417",
  address: "4417 Quillfeather Lane, Burlington, Vermont 05401",
  lat: 44.481234,
  lon: -73.218765,
  first: "Zebulon",
  last: "Quartermaine",
  email: `zebulon.q@${ALLOWED_EMAIL_DOMAINS[0]}`,
  contactEmail: "zq.sublets@example.com",
  phone: "802-555-0199",
  description:
    "Big sunny room at 4417 Quillfeather Lane, two minutes from the bus, with a periwinkle hammock on the porch. Text 802-555-0199 or email zq.sublets@example.com. 2 bed, 1 bath, laundry free.",
  /** A phrase only the description has: the description is signed-in only, so this must never appear signed out. */
  descriptionMarker: "periwinkle hammock",
};

/** The secret strings found in `text`; empty when nothing leaked. */
export function leaks(text: string): string[] {
  const needles = [
    SECRET.street,
    `${SECRET.number} `,
    SECRET.first,
    SECRET.last,
    SECRET.email,
    SECRET.contactEmail,
    "555-0199",
    "5550199",
    SECRET.descriptionMarker,
  ];
  return [...needles.filter((n) => text.includes(n)), ...coordinateLeaks(text, SECRET).map((c) => `true ${c}`)];
}

/**
 * A public listing's approximate area (`"area":{"lat":…,"lon":…,"radiusM":…}`),
 * as JSON or escaped inside an HTML script (`\"area\":…`). Its coordinates
 * are meant to be there.
 */
const PUBLIC_AREA_JSON = /\\*"area\\*":\{\\*"lat\\*":-?[\d.]+,\\*"lon\\*":-?[\d.]+,\\*"radiusM\\*":\d+\}/g;

/** How a coordinate would be written out: five decimals, and its full form when that is longer. */
function coordinateForms(v: number): string[] {
  const full = String(v);
  return full.length > v.toFixed(5).length ? [v.toFixed(5), full] : [v.toFixed(5)];
}

/**
 * Which of a listing's true coordinates `body` gives away. Both together
 * anywhere in the body are a leak (an area centred on the true point, say);
 * either one outside the public `area` objects is a leak too. A lone
 * coordinate inside an area is not: another listing's area, kilometres
 * away, can share a latitude to five decimals by chance.
 */
export function coordinateLeaks(body: string, point: { lat: number; lon: number }): ("lat" | "lon")[] {
  const has = (text: string, v: number) => coordinateForms(v).some((f) => text.includes(f));
  if (has(body, point.lat) && has(body, point.lon)) return ["lat", "lon"];
  const outside = body.replace(PUBLIC_AREA_JSON, "");
  return (["lat", "lon"] as const).filter((k) => has(outside, point[k]));
}
