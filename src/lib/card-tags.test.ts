import { expect, it } from "vitest";
import { amenityCounts, listingCardTags, type AmenityFlags } from "./card-tags";

const none: AmenityFlags = {
  freeParking: false,
  paidParking: false,
  laundryFree: false,
  laundryPaid: false,
  dishwasher: false,
  airConditioning: false,
  petsAllowed: false,
  furnished: false,
};

const ONE = { roomsAvailable: 1, bedrooms: 3, roommates: 2 };

it("puts the preference first, then the rarest amenities, and counts the rest", () => {
  const rows = [
    { amenities: { ...none, furnished: true, laundryFree: true, dishwasher: true, petsAllowed: true }, roommatePreference: "women_nonbinary" as const, ...ONE },
    { amenities: { ...none, furnished: true, laundryFree: true }, roommatePreference: "" as const, ...ONE },
    { amenities: { ...none, furnished: true }, roommatePreference: "" as const, ...ONE },
  ];
  const counts = amenityCounts(rows);
  expect(counts.furnished).toBe(3);
  expect(counts.petsAllowed).toBe(1);
  const { tags, more } = listingCardTags(rows[0], counts);
  expect(tags.map((t) => t.label)).toEqual(["Prefers women & nonbinary folks", "Pets OK", "Dishwasher"]);
  expect(tags[0].kind).toBe("preference");
  expect(more).toBe(2);
  expect(listingCardTags(rows[2], counts)).toEqual({ tags: [{ label: "Furnished", kind: "included" }], more: 0 });
});

it("puts a multi-room listing's size chip first, within the same limit", () => {
  const row = { amenities: { ...none, furnished: true, dishwasher: true }, roommatePreference: "women" as const, roomsAvailable: 4, bedrooms: 4, roommates: 0 };
  const { tags, more } = listingCardTags(row, amenityCounts([row]));
  expect(tags).toEqual([
    { label: "Whole place · 4 BR", kind: "rooms" },
    { label: "Prefers women", kind: "preference" },
    { label: "Dishwasher", kind: "included" },
  ]);
  expect(more).toBe(1);
  expect(listingCardTags({ ...row, roomsAvailable: 3, bedrooms: 5 }, amenityCounts([row])).tags[0]).toEqual({ label: "3 rooms", kind: "rooms" });
});
