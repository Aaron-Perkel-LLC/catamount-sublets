import { describe, expect, it } from "vitest";
import { canonicalFilterQuery, defaultSearchName, describeFilters, filterCount, filterSearchParams, parseListingQuery, parseSavedQuery, withQuery } from "./listing-filters";

it("parses a shared URL leniently", () => {
  const q = parseListingQuery({
    min_price: "500",
    max_price: "1200",
    semester: "spring27",
    max_distance: "1.5",
    amenities: ["pets", "bogus", "ac", "ac"],
    negotiable: "1",
    open_to: "women",
    sort: "closest",
    id: "187",
    via: "share",
  });
  expect(q).toEqual({
    minPrice: 500,
    maxPrice: 1200,
    semester: "spring27",
    maxDistance: 1.5,
    amenities: ["pets", "ac"],
    negotiable: true,
    openTo: "women",
    sort: "closest",
    id: 187,
    via: "share",
  });
  expect(filterCount(q)).toBe(7);
  expect(filterSearchParams(q).toString()).toBe(
    "min_price=500&max_price=1200&semester=spring27&max_distance=1.5&amenities=pets&amenities=ac&negotiable=1&open_to=women",
  );
});

it("drops a lone price bound, bad values and empties", () => {
  const q = parseListingQuery({ min_price: "500", sort: "sideways", open_to: "cats", max_distance: "-2", semester: "" });
  expect(q.minPrice).toBeUndefined();
  expect(q.sort).toBe("newest");
  expect(q.openTo).toBeUndefined();
  expect(q.maxDistance).toBeUndefined();
  expect(q.semester).toBeUndefined();
  expect(filterCount(q)).toBe(0);
  expect(withQuery("/map", filterSearchParams(q))).toBe("/map");
});

it("swaps an inverted price range", () => {
  const q = parseListingQuery({ min_price: "1200", max_price: "500" });
  expect([q.minPrice, q.maxPrice]).toEqual([500, 1200]);
});

describe("saved searches use Browse's query string", () => {
  it("canonicalises: filters only, amenities sorted, unusable values dropped", () => {
    expect(canonicalFilterQuery("sort=closest&id=9&via=share&amenities=pets&amenities=ac&semester=spring27&bogus=1")).toBe("semester=spring27&amenities=ac&amenities=pets");
    expect(canonicalFilterQuery("max_price=900&min_price=1200")).toBe("min_price=900&max_price=1200");
    expect(canonicalFilterQuery("max_price=900")).toBe("");
    expect(canonicalFilterQuery("")).toBe("");
  });

  it("reads a stored search back exactly as Browse reads its URL", () => {
    const stored = canonicalFilterQuery("semester=spring27&max_distance=1.5&negotiable=1&open_to=women&amenities=laundry");
    expect(parseSavedQuery(stored)).toEqual(parseListingQuery({ semester: "spring27", max_distance: "1.5", negotiable: "1", open_to: "women", amenities: ["laundry"] }));
    expect(parseSavedQuery("amenities=ac&amenities=pets").amenities).toEqual(["ac", "pets"]);
  });

  it("describes the filters in words, cut to fit a name", () => {
    const q = parseListingQuery({ semester: "spring27", min_price: "0", max_price: "900", max_distance: "1", amenities: ["furnished", "pets"] });
    expect(describeFilters(q, "Spring 2027")).toBe("Spring 2027 · Up to $900 · Within 1 mi · Furnished, Pets OK");
    expect(describeFilters(parseListingQuery({}))).toBe("Every new listing");
    const long = parseListingQuery({ semester: "spring27", min_price: "500", max_price: "900", max_distance: "1.5", amenities: ["furnished", "parking", "laundry", "dishwasher", "ac", "pets"], negotiable: "1", open_to: "nonbinary" });
    const name = defaultSearchName(long, "Spring 2027", 60);
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith("…")).toBe(true);
  });
});
