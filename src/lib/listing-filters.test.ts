import { expect, it } from "vitest";
import { filterCount, filterSearchParams, parseListingQuery, withQuery } from "./listing-filters";

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
