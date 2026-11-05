import { describe, expect, it } from "vitest";
import { formToListingInput, listingInput, validateListingInput } from "./listing-input";

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
}

const good = {
  price: "950",
  search_place: "62 King St, Burlington",
  lat: "44.4762",
  lon: "-73.2106",
  semesters: ["spring27"],
  description: "Sunny room.",
  search_reach: "jsmith@uvm.edu",
  search_text: "",
  search_who: "Sam",
  utilityElectric: "tenant",
  utilityGas: "",
  utilityWater: "",
  utilityInternet: "landlord",
  utilityCost: "",
  amenityFurnished: "on",
  bedrooms: "4",
  bathrooms: "1.4",
  roommates: "2",
  roommateGender: "mixed",
  roommatePreference: "women",
};

describe("listingInput", () => {
  it("accepts a good form, maps the aliases and snaps bathrooms", () => {
    const r = listingInput.safeParse(formToListingInput(form(good)));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.address).toBe("62 King St, Burlington");
    expect(r.data.contactEmail).toBe("jsmith@uvm.edu");
    expect(r.data).not.toHaveProperty("displayName");
    expect(r.data.bathrooms).toBe(1.5);
    expect(r.data.utilityCost).toBeNull();
    expect(r.data.amenityFurnished).toBe(true);
    expect(r.data.amenityDishwasher).toBe(false);
    expect(r.data.roommatePreference).toBe("women");
  });

  it("clears roommate fields when there are no roommates", () => {
    const r = listingInput.parse(formToListingInput(form({ ...good, roommates: "0" })));
    expect(r.roommateGender).toBe("");
    expect(r.roommatePreference).toBe("");
  });

  it("explains each problem by field, the pin included, on the first submit", () => {
    const r = validateListingInput(
      formToListingInput(form({ ...good, price: "", lat: "0", lon: "0", semesters: [], search_reach: "not-an-email", utilityGas: "maybe" })),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.price).toMatch(/rent/i);
    expect(r.fieldErrors.address).toMatch(/Pick your address/);
    expect(r.fieldErrors.semesters).toMatch(/Pick the semester/);
    expect(r.fieldErrors.contactEmail).toMatch(/valid contact email/);
    expect(r.fieldErrors.utilityGas).toBeDefined();
  });

  it("asks for whole dollars in its own words when rent or utilities have cents", () => {
    const r = validateListingInput(formToListingInput(form({ ...good, price: "123.45", utilityCost: "80.5" })));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.price).toMatch(/Whole dollars only/);
    expect(r.fieldErrors.utilityCost).toMatch(/Whole dollars only/);
    expect(validateListingInput(formToListingInput(form({ ...good, price: "123" }))).ok).toBe(true);
  });

  it("refuses a place more than 50 miles from campus", () => {
    const r = validateListingInput(formToListingInput(form({ ...good, lat: "42.36", lon: "-71.06" })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.address).toMatch(/50 miles/);
    expect(validateListingInput(formToListingInput(form(good))).ok).toBe(true);
  });
});
