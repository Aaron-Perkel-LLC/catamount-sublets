import { describe, expect, it } from "vitest";
import { GO_PUBLIC_AT, posterMayChooseVisibility, PUBLIC_BY_DEFAULT_SINCE, visibilityControl } from "./visibility-rollout";

const before = new Date(PUBLIC_BY_DEFAULT_SINCE.getTime() - 1);
const nov18 = new Date("2026-11-18T15:00:00Z");

describe("the visibility rollout", () => {
  it("goes public at 00:00 Eastern on 21 Nov (EST, UTC−5)", () => {
    expect(GO_PUBLIC_AT.toISOString()).toBe("2026-11-21T05:00:00.000Z");
  });

  it("lets only posters from before the cutoff choose", () => {
    expect(posterMayChooseVisibility(before)).toBe(true);
    expect(posterMayChooseVisibility(PUBLIC_BY_DEFAULT_SINCE)).toBe(false);
  });

  it("shows the pending notice only for a never-chosen signed-in listing before the go-public day", () => {
    const backfilled = { postedAt: before, signedInOnly: true, visibilityChosenAt: null };
    expect(visibilityControl(backfilled, nov18)).toBe("pending");
    expect(visibilityControl(backfilled, new Date(GO_PUBLIC_AT.getTime() - 1))).toBe("pending");
    expect(visibilityControl(backfilled, GO_PUBLIC_AT)).toBe("switch");
    expect(visibilityControl({ ...backfilled, visibilityChosenAt: nov18 }, nov18)).toBe("switch");
    // After go-public has run it is public, so the notice cannot show whatever the date.
    expect(visibilityControl({ ...backfilled, signedInOnly: false }, nov18)).toBe("switch");
  });

  it("gives a listing from after the cutoff no switch, whatever its state", () => {
    for (const signedInOnly of [true, false]) {
      expect(visibilityControl({ postedAt: PUBLIC_BY_DEFAULT_SINCE, signedInOnly, visibilityChosenAt: null }, nov18)).toBe("none");
    }
  });
});
