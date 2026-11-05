import { describe, expect, it } from "vitest";
import { dayLabel, niceTicks } from "./chart";

describe("niceTicks", () => {
  it("steps in 1, 2 or 5 × a power of ten, whole numbers only, just past the max", () => {
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(12)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(47)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(250)).toEqual([0, 100, 200, 300]);
  });
  it("gives an empty chart an axis", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("dayLabel", () => {
  it("reads the calendar date as written, whatever the machine's zone", () => {
    expect(dayLabel("2026-10-05")).toBe("Oct 5");
    expect(dayLabel("2026-10-08", true)).toBe("Thu, Oct 8");
  });
});
