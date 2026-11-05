import { describe, expect, it } from "vitest";
import { actorKey, parseShareSlug, shareCardLines, shareSlug, shareToken, verifyShareToken } from "./share";

describe("share tokens", () => {
  it("derives a 10-hex token per id, and a slug the parser accepts", () => {
    const t = shareToken(187);
    expect(t).toMatch(/^[a-f0-9]{10}$/);
    expect(shareToken(188)).not.toBe(t);
    expect(shareSlug(187)).toBe(`187-${t}`);
    expect(parseShareSlug(shareSlug(187))).toEqual({ id: 187, token: t });
    // Tokens are issued lowercase; the shape check is strict, as the legacy's was.
    expect(parseShareSlug("187-ABCDEF0123")).toBeNull();
  });

  it("rejects malformed slugs", () => {
    for (const bad of ["", "187", "187-", "-abcdef0123", "0-abcdef0123", "187-abcdef012", "187-abcdef0123x", "187-abcdef0123\n", "a-abcdef0123"]) {
      expect(parseShareSlug(bad), bad).toBeNull();
    }
  });

  it("verifies this site's token or the legacy one, in constant time", () => {
    expect(verifyShareToken(187, shareToken(187), null)).toBe(true);
    expect(verifyShareToken(187, shareToken(188), null)).toBe(false);
    expect(verifyShareToken(187, "d2e9710cf1", "d2e9710cf1")).toBe(true);
    expect(verifyShareToken(187, "d2e9710cf1", "D2E9710CF1")).toBe(true);
    expect(verifyShareToken(187, "d2e9710cf1", null)).toBe(false);
    expect(verifyShareToken(187, "d2e9710cf1", "0000000000")).toBe(false);
  });

  it("keeps actor keys separate from share tokens", () => {
    expect(actorKey("user-1")).toMatch(/^[a-f0-9]{16}$/);
    expect(actorKey("user-1")).not.toBe(actorKey("user-2"));
  });
});

describe("shareCardLines", () => {
  it("publishes price, semester, size and distance and nothing else", () => {
    const lines = shareCardLines({ price: 950, priceNegotiable: true, semesterLabel: "Spring 2027", bedrooms: 2, bathrooms: 1.5, roommates: 1, distanceMi: 0.43 });
    expect(lines.price).toBe("$950/mo");
    expect(lines.facts).toBe("2 bd · 1.5 ba · 1 roommate · 0.4 mi from campus");
    expect(lines.title).toBe("$950/mo · Spring 2027 · Catamount Sublets");
    expect(lines.description).toMatch(/^2 bd .* Sign in with your student email/);
    expect(Object.keys(lines).sort()).toEqual(["description", "facts", "negotiable", "price", "semester", "title"]);
  });
});
