import {
  AMENITIES,
  type AmenityKey,
  CARD_TAG_ORDER,
  ROOMMATE_PREFERENCE_OPTIONS,
  type RoommatePreference,
} from "./options";

export interface CardTag {
  label: string;
  kind: "included" | "plain" | "preference";
}

export type AmenityFlags = Record<AmenityKey, boolean>;

/** How many of the listings on screen carry each amenity. */
export function amenityCounts(rows: readonly { amenities: AmenityFlags }[]): Record<AmenityKey, number> {
  const counts = Object.fromEntries(CARD_TAG_ORDER.map((k) => [k, 0])) as Record<AmenityKey, number>;
  for (const row of rows) {
    for (const key of CARD_TAG_ORDER) if (row.amenities[key]) counts[key]++;
  }
  return counts;
}

/**
 * The few tags worth putting on one card, and how many were left off. A
 * roommate preference always comes first; then the amenities rarest among
 * the listings on screen, up to `max`. The full list stays in the listing view.
 */
export function listingCardTags(
  row: { amenities: AmenityFlags; roommatePreference: RoommatePreference },
  counts: Record<AmenityKey, number>,
  max = 3,
): { tags: CardTag[]; more: number } {
  const tags: CardTag[] = [];
  if (row.roommatePreference) {
    const label = ROOMMATE_PREFERENCE_OPTIONS[row.roommatePreference];
    // "Prefers women & nonbinary folks", not "Prefers Women & …".
    tags.push({ label: `Prefers ${label[0].toLowerCase()}${label.slice(1)}`, kind: "preference" });
  }
  const present = CARD_TAG_ORDER.map((key, order) => ({ key, order, count: counts[key] ?? 0 }))
    .filter(({ key }) => row.amenities[key])
    .sort((a, b) => a.count - b.count || a.order - b.order);
  for (const { key } of present) tags.push({ label: AMENITIES[key].label, kind: AMENITIES[key].kind });
  return { tags: tags.slice(0, max), more: Math.max(0, tags.length - max) };
}
