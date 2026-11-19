import { describe, expect, it } from "vitest";
import { deltaText, rate } from "./admin-delta";

describe("deltaText", () => {
  it("is the plain difference while the previous period is small", () => {
    expect(deltaText(5, 2)).toBe("+3");
    expect(deltaText(2, 5)).toBe("−3");
    expect(deltaText(4, 4)).toBe("±0");
    expect(deltaText(3, 0)).toBe("+3");
  });
  it("adds a percentage from 20 up, and nothing without a previous period", () => {
    expect(deltaText(30, 20)).toBe("+10 (+50%)");
    expect(deltaText(15, 20)).toBe("−5 (−25%)");
    expect(deltaText(20, 20)).toBe("±0");
    expect(deltaText(5, null)).toBeNull();
  });
  it("rate", () => {
    expect(rate(3, 12)).toBe("3 of 12 (25%)");
    expect(rate(0, 0)).toBe("0 of 0");
  });
});
