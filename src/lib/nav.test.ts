import { describe, expect, it } from "vitest";
import { isCurrent } from "./nav";

describe("isCurrent", () => {
  it("matches the page, pages under it, and a listing as Browse", () => {
    expect(isCurrent("/browse", "/browse?semester=spring27")).toBe(true);
    expect(isCurrent("/listing/187", "/browse")).toBe(true);
    expect(isCurrent("/admin/anything", "/admin")).toBe(true);
    expect(isCurrent("/map", "/browse")).toBe(false);
    expect(isCurrent("/postal", "/post")).toBe(false);
  });
});
