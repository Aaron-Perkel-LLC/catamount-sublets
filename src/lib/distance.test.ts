import { describe, expect, it } from "vitest";
import { formatMilesFromCampus, milesBetween, milesFromCampus, pinGroupKey } from "./distance";

describe("milesBetween", () => {
  it("is zero for the same point and symmetric", () => {
    expect(milesBetween(44.477435, -73.195323, 44.477435, -73.195323)).toBe(0);
    const a = milesBetween(44.477435, -73.195323, 44.4759, -73.2121);
    const b = milesBetween(44.4759, -73.2121, 44.477435, -73.195323);
    expect(a).toBeCloseTo(b, 10);
  });

  it("gets Burlington distances about right", () => {
    // Church Street Marketplace is roughly 0.8 miles from the Waterman Building.
    const d = milesFromCampus(44.4759, -73.2121);
    expect(d).toBeGreaterThan(0.7);
    expect(d).toBeLessThan(0.95);
    // Montpelier is about 32 miles away as the crow flies.
    expect(milesFromCampus(44.2601, -72.5754)).toBeGreaterThan(30);
    expect(milesFromCampus(44.2601, -72.5754)).toBeLessThan(35);
  });
});

it("formats one decimal", () => {
  expect(formatMilesFromCampus(0.83)).toBe("0.8 mi from campus");
});

it("groups pins at four decimals", () => {
  expect(pinGroupKey(44.47743, -73.19532)).toBe(pinGroupKey(44.477434, -73.195324));
  expect(pinGroupKey(44.4774, -73.1953)).not.toBe(pinGroupKey(44.4776, -73.1953));
});
