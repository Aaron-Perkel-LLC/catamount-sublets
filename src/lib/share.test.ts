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

const ONE_ROOM = { priceBasis: "room" as const, roomsAvailable: 1 };

describe("shareCardLines", () => {
  it("publishes price, semester, size and distance and nothing else", () => {
    const lines = shareCardLines({ ...ONE_ROOM, price: 950, pricePerRoom: 950, priceNegotiable: true, semesterLabel: "Spring 2027", bedrooms: 2, bathrooms: 1.5, roommates: 1, distanceMi: 0.43 });
    expect(lines.price).toBe("$950/mo");
    expect(lines.facts).toBe("2 bd · 1.5 ba · 1 roommate · 0.4 mi from campus");
    expect(lines.title).toBe("$950/mo · Spring 2027 · Catamount Sublets");
    expect(lines.description).toMatch(/^2 bd .* Sign in with your student email/);
    expect(Object.keys(lines).sort()).toEqual(["description", "facts", "negotiable", "price", "semester", "title"]);
  });

  it("leads a multi-room listing with its per-room price, then the size chip and any total, under the same six keys", () => {
    const base = { priceNegotiable: false, semesterLabel: "Fall 2027", bathrooms: 2, distanceMi: 1.2 };
    const whole = shareCardLines({ ...base, price: 3200, pricePerRoom: 800, priceBasis: "total", roomsAvailable: 4, bedrooms: 4, roommates: 0 });
    expect(whole.price).toBe("$800/room");
    expect(whole.facts).toBe("Whole place · 4 BR · $3,200 total · 4 bd · 2 ba · No roommates · 1.2 mi from campus");
    expect(whole.title).toBe("$800/room · Fall 2027 · Catamount Sublets");
    const some = shareCardLines({ ...base, price: 700, pricePerRoom: 700, priceBasis: "room", roomsAvailable: 3, bedrooms: 5, roommates: 2 });
    expect(some.price).toBe("$700/room");
    expect(some.facts).toBe("3 rooms · 5 bd · 2 ba · 2 roommates · 1.2 mi from campus");
    expect(Object.keys(whole).sort()).toEqual(["description", "facts", "negotiable", "price", "semester", "title"]);
  });
});
