/**
 * Vocabularies for the structured listing fields and the activity log.
 *
 * The zod schemas validate against these, the database CHECK constraints are
 * generated from them (src/db/schema), the forms render from them and the
 * filters build their SQL from them. One file, so nothing drifts.
 */

export const LISTING_STATUSES = {
  open: "Open",
  paused: "Paused",
  taken: "Taken",
} as const;
export type ListingStatus = keyof typeof LISTING_STATUSES;
export const LISTING_STATUS_VALUES = Object.keys(LISTING_STATUSES) as ListingStatus[];

/** Who currently lives in the unit. */
export const ROOMMATE_GENDER_OPTIONS = {
  "": "Prefer not to say",
  women: "All women",
  men: "All men",
  nonbinary: "Nonbinary / gender-diverse",
  mixed: "Mixed genders",
} as const;
export type RoommateGender = keyof typeof ROOMMATE_GENDER_OPTIONS;
export const ROOMMATE_GENDER_VALUES = Object.keys(ROOMMATE_GENDER_OPTIONS) as RoommateGender[];

/** Who the poster is hoping to sublet to. A preference, not a requirement. */
export const ROOMMATE_PREFERENCE_OPTIONS = {
  "": "Open to anyone",
  women_nonbinary: "Women & nonbinary folks",
  men_nonbinary: "Men & nonbinary folks",
  women: "Women",
  men: "Men",
  nonbinary: "Nonbinary folks",
} as const;
export type RoommatePreference = keyof typeof ROOMMATE_PREFERENCE_OPTIONS;
export const ROOMMATE_PREFERENCE_VALUES = Object.keys(ROOMMATE_PREFERENCE_OPTIONS) as RoommatePreference[];

/**
 * The "Roommate preference" filter: show only the places whose stated
 * preference includes the searcher. A listing with no preference always shows.
 */
export const OPEN_TO_FILTERS = {
  men: { label: "Open to men", prefs: ["men", "men_nonbinary"] },
  women: { label: "Open to women", prefs: ["women", "women_nonbinary"] },
  nonbinary: { label: "Open to nonbinary folks", prefs: ["nonbinary", "women_nonbinary", "men_nonbinary"] },
} as const satisfies Record<string, { label: string; prefs: readonly RoommatePreference[] }>;
export type OpenToFilter = keyof typeof OPEN_TO_FILTERS;
export const OPEN_TO_VALUES = Object.keys(OPEN_TO_FILTERS) as OpenToFilter[];

/** Who pays each utility. */
export const UTILITY_OPTIONS = {
  "": "Not specified",
  landlord: "Included in rent",
  tenant: "Tenant pays",
} as const;
export type UtilityPayer = keyof typeof UTILITY_OPTIONS;
export const UTILITY_VALUES = Object.keys(UTILITY_OPTIONS) as UtilityPayer[];
export const UTILITY_KINDS = ["electric", "gas", "water", "internet"] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

/**
 * The eight amenity flags, in the post form's order. `kind` picks the card
 * tag's tint: `included` comes with the place; `plain` costs extra.
 */
export const AMENITIES = {
  freeParking: { label: "Free parking", kind: "included" },
  paidParking: { label: "Paid parking", kind: "plain" },
  laundryFree: { label: "Laundry", formLabel: "In-unit laundry (free)", kind: "included" },
  laundryPaid: { label: "Paid laundry", formLabel: "In-unit laundry (paid)", kind: "plain" },
  dishwasher: { label: "Dishwasher", kind: "included" },
  airConditioning: { label: "A/C", kind: "included" },
  petsAllowed: { label: "Pets OK", formLabel: "Pets allowed", kind: "included" },
  furnished: { label: "Furnished", kind: "included" },
} as const satisfies Record<string, { label: string; formLabel?: string; kind: "included" | "plain" }>;
export type AmenityKey = keyof typeof AMENITIES;
export const AMENITY_KEYS = Object.keys(AMENITIES) as AmenityKey[];

/** The longer label the post form and the listing view use. */
export function amenityFormLabel(key: AmenityKey): string {
  const a: { label: string; formLabel?: string } = AMENITIES[key];
  return a.formLabel ?? a.label;
}

/** Card tag tie-break order: the rarest of these win, "Prefers …" always first. */
export const CARD_TAG_ORDER: readonly AmenityKey[] = [
  "petsAllowed",
  "airConditioning",
  "dishwasher",
  "freeParking",
  "paidParking",
  "laundryFree",
  "laundryPaid",
  "furnished",
];

/** The "Must have" chips on Browse and Map: a chip matches any of its flags. */
export const AMENITY_FILTERS = {
  furnished: { label: "Furnished", flags: ["furnished"] },
  parking: { label: "Parking", flags: ["freeParking", "paidParking"] },
  laundry: { label: "In-unit laundry", flags: ["laundryFree", "laundryPaid"] },
  dishwasher: { label: "Dishwasher", flags: ["dishwasher"] },
  ac: { label: "A/C", flags: ["airConditioning"] },
  pets: { label: "Pets OK", flags: ["petsAllowed"] },
} as const satisfies Record<string, { label: string; flags: readonly AmenityKey[] }>;
export type AmenityFilter = keyof typeof AMENITY_FILTERS;
export const AMENITY_FILTER_VALUES = Object.keys(AMENITY_FILTERS) as AmenityFilter[];

/** Browse sort options. `closest` needs the distance column. */
export const LISTING_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  closest: "Closest to campus",
} as const;
export type ListingSort = keyof typeof LISTING_SORTS;
export const LISTING_SORT_VALUES = Object.keys(LISTING_SORTS) as ListingSort[];

/**
 * Activity log vocabularies. `dedupe: true` means one event per person,
 * listing and Eastern day; the rest count every time.
 */
export const EVENT_TYPES = {
  listing_open: { dedupe: true },
  map_pin_open: { dedupe: true },
  share_open: { dedupe: true },
  share_arrival: { dedupe: true },
  share_target: { dedupe: false },
  email_click: { dedupe: false },
  call_click: { dedupe: false },
  copy_email: { dedupe: false },
  copy_phone: { dedupe: false },
  copy_message: { dedupe: false },
  mail_app: { dedupe: false },
  dial: { dedupe: false },
  text: { dedupe: false },
} as const;
export type EventType = keyof typeof EVENT_TYPES;
export const EVENT_TYPE_VALUES = Object.keys(EVENT_TYPES) as EventType[];

export const CONTACT_EVENT_TYPES: readonly EventType[] = [
  "email_click",
  "call_click",
  "copy_email",
  "copy_phone",
  "copy_message",
  "mail_app",
  "dial",
  "text",
];
/** Counted even when the poster does them: sharing your own listing is how listings travel. */
export const SHARE_EVENT_TYPES: readonly EventType[] = ["share_open", "share_target"];

export const EVENT_SOURCES = ["browse", "map", "share-link", "deeplink", "post"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const SHARE_TARGETS = ["native", "instagram", "snapchat", "text", "email", "x", "copy"] as const;
export type ShareTarget = (typeof SHARE_TARGETS)[number];

/** Stored events per person per minute before the beacon answers 429. */
export const EVENTS_PER_MINUTE = 60;

/** Format "1.5" as "1.5" and "2.0" as "2". */
export function formatHalf(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "2 bd · 1.5 ba · 1 roommate", or "" when nothing is set. */
export function sizeSummary(s: {
  bedrooms: number | null;
  bathrooms: number | string | null;
  roommates: number | null;
}): string {
  const bits: string[] = [];
  if (s.bedrooms !== null && s.bedrooms !== undefined) bits.push(`${s.bedrooms} bd`);
  if (s.bathrooms !== null && s.bathrooms !== undefined && s.bathrooms !== "") {
    bits.push(`${formatHalf(Number(s.bathrooms))} ba`);
  }
  if (s.roommates !== null && s.roommates !== undefined) {
    const n = s.roommates;
    bits.push(n === 0 ? "No roommates" : `${n} roommate${n === 1 ? "" : "s"}`);
  }
  return bits.join(" · ");
}
