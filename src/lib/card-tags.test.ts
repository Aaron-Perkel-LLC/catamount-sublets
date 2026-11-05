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

it("puts the preference first, then the rarest amenities, and counts the rest", () => {
  const rows = [
    { amenities: { ...none, furnished: true, laundryFree: true, dishwasher: true, petsAllowed: true }, roommatePreference: "women_nonbinary" as const },
    { amenities: { ...none, furnished: true, laundryFree: true }, roommatePreference: "" as const },
    { amenities: { ...none, furnished: true }, roommatePreference: "" as const },
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
