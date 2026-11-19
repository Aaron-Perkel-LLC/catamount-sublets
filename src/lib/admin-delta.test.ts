import { describe, expect, it } from "vitest";
import { countChip, rate, rateChip, share } from "./admin-delta";

describe("countChip", () => {
  it("is grey with the plain difference while the period before is small", () => {
    expect(countChip(5, 2)).toMatchObject({ tone: "neutral", text: "+3" });
    expect(countChip(2, 5)).toMatchObject({ tone: "neutral", text: "−3" });
    expect(countChip(4, 4)).toMatchObject({ tone: "neutral", text: "0" });
    expect(countChip(3, 0)).toMatchObject({ tone: "neutral", text: "+3" });
  });
  it("is a coloured percentage from 20 up", () => {
    expect(countChip(30, 20)).toMatchObject({ tone: "good", text: "▲ 50%" });
    expect(countChip(15, 20)).toMatchObject({ tone: "bad", text: "▼ 25%" });
    expect(countChip(20, 20)).toMatchObject({ tone: "neutral", text: "0" });
  });
  it("is nothing without a period before, or with nothing in either", () => {
    expect(countChip(5, null)).toBeNull();
    expect(countChip(0, 0)).toBeNull();
  });
});

describe("rateChip", () => {
  it("moves in points, coloured only when the period before had enough people", () => {
    expect(rateChip(32, 16, 40)).toMatchObject({ tone: "good", text: "▲ 16 pts" });
    expect(rateChip(10, 16.4, 40)).toMatchObject({ tone: "bad", text: "▼ 6 pts" });
    expect(rateChip(32, 16, 5)).toMatchObject({ tone: "neutral", text: "+16 pts" });
    expect(rateChip(16, 16.2, 40)).toMatchObject({ tone: "neutral", text: "0 pts" });
  });
  it("is nothing when either rate has nothing to divide by", () => {
    expect(rateChip(null, 10, 40)).toBeNull();
    expect(rateChip(10, null, null)).toBeNull();
  });
});

describe("rate and share", () => {
  it("rate", () => {
    expect(rate(3, 12)).toBe("3 of 12 (25%)");
    expect(rate(0, 0)).toBe("0 of 0");
  });
  it("share", () => {
    expect(share(3, 12)).toBe(25);
    expect(share(1, 0)).toBeNull();
  });
});
