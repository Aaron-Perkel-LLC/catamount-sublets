/**
 * The description as a signed-out visitor reads it: anything that could
 * locate the place or reach the poster becomes "[sign in to see]". Signed-in
 * students see the original. Leans towards redacting: a lost "2 blocks from
 * Church St" costs little, a house number left in costs a lot.
 */

export const REDACTED = "[sign in to see]";

const SUFFIXES =
  "street|st|avenue|ave|av|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|terrace|ter|way|circle|cir|parkway|pkwy|highway|hwy|square|sq|row|alley|aly|path|extension|ext";

/** Words that make "2 bedroom place" or "10 min drive" not an address. */
const NOT_A_STREET = new Set(
  "bed beds bedroom bedrooms br bd bath baths bathroom bathrooms ba min mins minute minutes hour hours block blocks mile miles mi roommate roommates person people month months week weeks room rooms car cars spot spots story stories floor floors unit units year years day days the a an and or of to from my our your this that".split(" "),
);

const TLDS = "com|edu|org|net|io|me|co|us|ly|gl|app|link|info|biz|gov";
const SEP_AT = String.raw`(?:\s*\(at\)\s*|\s*\[at\]\s*|\s*\{at\}\s*|\s+at\s+)`;
const SEP_DOT = String.raw`(?:\s*\.\s*|\s*\(dot\)\s*|\s*\[dot\]\s*|\s+dot\s+)`;

const PATTERNS: { re: RegExp; keep?: (match: string, ...groups: string[]) => boolean }[] = [
  // Links: a Maps, Zillow or Instagram URL carries the address or the person.
  { re: /\b(?:https?:\/\/|www\.)\S+/gi },
  { re: new RegExp(String.raw`\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLDS})\/\S*`, "gi") },
  // Email, plain and spelled out ("sam at school dot edu", "sam(at)gmail.com").
  { re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { re: new RegExp(String.raw`\b[\w.+-]+${SEP_AT}[\w-]+(?:${SEP_DOT}[\w-]+)*${SEP_DOT}(?:${TLDS})\b`, "gi") },
  // Handles: "@sam.k", "ig: sam.k", "snap - samk".
  {
    re: /\b(?:ig|insta|instagram|snap|snapchat|tiktok|twitter|fb|facebook|discord|whatsapp|venmo|telegram|signal|groupme|linkedin)\s*(?:[:\-–—]|is)\s*@?[\w.]{2,40}/gi,
  },
  { re: /(?<![\w.@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?/g },
  // US phone numbers, with or without a country code and separators.
  { re: /(?<![\d$.,])(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}(?![\d])/g },
  // House number + street + suffix ("62 King St", "12B N. Winooski Avenue", "41-43 pearl street").
  {
    re: new RegExp(
      String.raw`\b\d{1,5}[a-z]?(?:\s*[-–]\s*\d{1,5}[a-z]?)?\s+((?:(?:[nsew]\.?|north|south|east|west)\s+)?(?:[a-z0-9][\w'.]*\s+){0,3}?)(?:${SUFFIXES})\b\.?`,
      "gi",
    ),
    keep: (_m, words) => (words ?? "").trim().split(/\s+/).some((w) => NOT_A_STREET.has(w.toLowerCase().replace(/[.']/g, ""))),
  },
  // "corner of Pearl and Union"
  { re: /\bcorner of\s+[A-Z][\w.]*(?:\s+[A-Z][\w.]*)?\s+(?:and|&)\s+[A-Z][\w.]*(?:\s+(?:St|Street|Ave|Avenue)\b\.?)?/g },
  // Unit and apartment numbers.
  { re: /\b(?:apt|apartment|unit|suite|ste)\.?\s*#?\s*[a-z]?\d{1,4}[a-z]?\b/gi },
  { re: /(?<![\w#])#\s?\d{1,4}[a-z]?\b/gi },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The listing's own street from its stored address ("62 King St, Burlington"
 * → number "62", street "King St"), so "on King St" goes too, not only "62 King St".
 */
function ownStreetPatterns(address: string | null | undefined): RegExp[] {
  if (!address) return [];
  const first = address.split(",")[0]?.trim() ?? "";
  const m = new RegExp(String.raw`^(\d{1,5}[a-z]?)\s+(.+?)\s+(${SUFFIXES})\.?$`, "i").exec(first);
  if (!m) return [];
  const [, number, name] = m;
  const out = [new RegExp(String.raw`\b${escape(name)}\s+(?:${SUFFIXES})\b\.?`, "gi")];
  // The bare house number next to "#", "number" or "no." ("we're number 62").
  out.push(new RegExp(String.raw`\b(?:#|no\.?|number)\s*${escape(number)}\b`, "gi"));
  return out;
}

export function redactForPublic(text: string, ownAddress?: string | null): string {
  let out = text;
  for (const { re, keep } of PATTERNS) {
    out = out.replace(re, (match: string, ...rest: unknown[]) => {
      const groups = rest.slice(0, -2) as string[]; // capture groups; the offset and the whole string come last
      return keep?.(match, ...groups) ? match : REDACTED;
    });
  }
  for (const re of ownStreetPatterns(ownAddress)) out = out.replace(re, REDACTED);
  // "[sign in to see] [sign in to see]" reads as one.
  const twice = new RegExp(String.raw`${escape(REDACTED)}(?:[\s,/&-]*${escape(REDACTED)})+`, "g");
  return out.replace(twice, REDACTED);
}
