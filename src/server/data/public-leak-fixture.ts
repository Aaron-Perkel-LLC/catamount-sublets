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
export function leaks(text: string, publicAreas: readonly { lat: number; lon: number }[] = []): string[] {
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
  return [...needles.filter((n) => text.includes(n)), ...coordinateLeaks(text, SECRET, publicAreas).map((c) => `true ${c}`)];
}

type Point = { lat: number; lon: number };

/** A quote as it appears in JSON (`"`), in JSON escaped inside an HTML script (`\"`, `\\\"`), or as an HTML entity. */
const Q = String.raw`(?:\\*"|&quot;)`;
/** Any `"area":{…}` object, whatever its key order or escaping. */
const AREA_OBJECT = new RegExp(String.raw`${Q}area${Q}:\{([^{}]*)\}`, "g");
const areaField = (inner: string, key: "lat" | "lon") => {
  const m = new RegExp(String.raw`${Q}${key}${Q}:(-?[\d.]+)`).exec(inner);
  return m ? Number(m[1]) : NaN;
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Patterns for a coordinate however it might be printed: any printing with
 * five or more decimals starts with it truncated to five (or reads as its
 * five-decimal rounding); a shorter one (44.4762, or 44.47620 with its zeros
 * dropped) must stand alone, not run on into more digits.
 */
function coordinatePatterns(v: number): RegExp[] {
  const [int, dec = ""] = String(v).split(".");
  const fixed = v.toFixed(5);
  const forms = new Set([fixed]);
  const exact = new Set<string>();
  if (dec.length >= 5) forms.add(`${int}.${dec.slice(0, 5)}`);
  else exact.add(String(v));
  const trimmed = fixed.replace(/\.?0+$/, "");
  if (trimmed !== fixed) exact.add(trimmed);
  return [
    ...[...forms].map((f) => new RegExp(String.raw`(?<!\d)${escapeRe(f)}`)),
    ...[...exact].map((f) => new RegExp(String.raw`(?<!\d)${escapeRe(f)}(?![\d])`)),
  ];
}

/**
 * Which of a listing's true coordinates `body` gives away. `publicAreas` are
 * the approximate areas the page may legitimately carry (the public
 * listings'); an `"area"` object exactly equal to one of them is excused,
 * because another listing's area can share a latitude with this point to
 * five decimals by chance. Any coordinate outside the excused areas is a
 * leak, and so is an excused area that holds both of this point's
 * coordinates (an area centred on the true point). With no `publicAreas`,
 * nothing is excused.
 */
export function coordinateLeaks(body: string, point: Point, publicAreas: readonly Point[] = []): ("lat" | "lon")[] {
  const pats = { lat: coordinatePatterns(point.lat), lon: coordinatePatterns(point.lon) };
  const has = (text: string, k: "lat" | "lon") => pats[k].some((re) => re.test(text));
  const excused: string[] = [];
  const outside = body.replace(AREA_OBJECT, (whole, inner: string) => {
    const lat = areaField(inner, "lat");
    const lon = areaField(inner, "lon");
    if (!publicAreas.some((a) => a.lat === lat && a.lon === lon)) return whole;
    excused.push(inner);
    return "";
  });
  if (excused.some((inner) => has(inner, "lat") && has(inner, "lon"))) return ["lat", "lon"];
  return (["lat", "lon"] as const).filter((k) => has(outside, k));
}
