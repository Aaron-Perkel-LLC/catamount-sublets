import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { milesFromCampus } from "@/lib/distance";
import { metersBetween } from "@/lib/geo-fuzz";
import { parseListingQuery } from "@/lib/listing-filters";
import { shareToken } from "@/lib/share";
import { fuzzedArea } from "@/server/geo-fuzz";
import { browseListings, filterBounds, listingForViewer, newBoardListings } from "./listings";
import { setListingVisibility } from "./my-listing";
import { publicBoardListings, publicListingById, publicSitemapEntries, signedInOnlyCount } from "./public-listings";
import { setListingSemesters } from "./semesters";
import { leaks, SECRET } from "./public-leak-fixture";
import { resolveShare } from "./share";

/** The public projection against a real (PGlite) database, seeded with the easy-to-spot listing in ./public-leak-fixture.ts. */
let db: Db;
let close: () => Promise<void>;
let posterId: string;
let viewerId: string;
let secretId: number;

async function addListing(userId: string, v: Partial<typeof s.listings.$inferInsert> & { lat: number; lon: number; price: number; id?: number }) {
  const [l] = await db
    .insert(s.listings)
    .values({ userId, address: `${v.price} Plain St, Burlington`, ...v })
    .returning({ id: s.listings.id });
  await setListingSemesters(db, l.id, [{ code: "spring27", position: 0 }]);
  await db.insert(s.listingPhotos).values({
    listingId: l.id,
    sortOrder: 0,
    stem: `p${l.id}`.padEnd(32, "0"),
    displayUrl: `/photos/${l.id}-display.webp`,
    thumbUrl: `/photos/${l.id}-thumb.webp`,
    cardUrl: `/photos/${l.id}-card.jpg`,
    sha256: "0".repeat(64),
  });
  return l.id;
}

const mkUser = async (email: string) => (await db.insert(s.user).values({ email, name: email.split("@")[0] }).returning({ id: s.user.id }))[0].id;
const admin = { userId: "", isAdmin: true };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", active: true });
  posterId = await mkUser(SECRET.email);
  await db.update(s.user).set({ firstName: SECRET.first, lastName: SECRET.last }).where(eq(s.user.id, posterId));
  viewerId = await mkUser("viewer@uvm.edu");
  secretId = await addListing(posterId, {
    price: 875,
    address: SECRET.address,
    lat: SECRET.lat,
    lon: SECRET.lon,
    bedrooms: 2,
    bathrooms: 1,
    description: SECRET.description,
    contactEmail: SECRET.contactEmail,
    contactPhone: SECRET.phone,
    roommatePreference: "women",
    roommateGender: "women",
    amenityLaundryFree: true,
  });
  await setListingVisibility(db, secretId, admin, false);
});
afterAll(() => close());

describe("the public projection", () => {
  it("carries nothing that locates the place or reaches the poster", async () => {
    const board = await publicBoardListings(db, parseListingQuery({}));
    const one = await publicListingById(db, secretId);
    expect(board.listings.map((l) => l.id)).toEqual([secretId]);
    expect(one).not.toBeNull();
    const text = JSON.stringify([board, one]);
    expect(leaks(text)).toEqual([]);
    // No field that is only the signed-in DTO's, whatever its value.
    for (const key of ["address", "shortAddress", "lat", "lon", "mapsUrl", "appleMapsUrl", "posterName", "hasPhone", "isMine", "shareUrl", "roommateGender", "roommatePreference", "roommateGenderLabel", "roommatePreferenceLabel", "confirmedAvailable"]) {
      expect(one).not.toHaveProperty(key);
    }
    expect(one).toMatchObject({ audience: "public", title: `2BR · ${one!.neighborhood}`, price: 875 });
    expect(one!.description).toContain("[sign in to see]");
    expect(one!.description).toContain("laundry free");
  });

  it("puts the true point inside the circle, off its center", async () => {
    const one = (await publicListingById(db, secretId))!;
    const d = metersBetween(one.area.lat, one.area.lon, SECRET.lat, SECRET.lon);
    expect(d).toBeGreaterThan(38);
    expect(d).toBeLessThan(one.area.radiusM);
    expect(one.area).toEqual(fuzzedArea(secretId, SECRET.lat, SECRET.lon));
  });

  it("measures distance from the circle's center, to a tenth of a mile", async () => {
    const one = (await publicListingById(db, secretId))!;
    expect(one.distanceMi).toBe(Math.round(milesFromCampus(one.area.lat, one.area.lon) * 10) / 10);
  });

  it("leaves the signed-in board exactly as it was (positive control)", async () => {
    const dto = await listingForViewer(db, secretId, viewerId);
    expect(dto).toMatchObject({ address: SECRET.address, lat: SECRET.lat, lon: SECRET.lon, posterName: `${SECRET.first} ${SECRET.last}`, description: SECRET.description });
    expect(dto).not.toHaveProperty("audience");
    const board = await browseListings(db, parseListingQuery({}), viewerId);
    expect(JSON.stringify(board)).toContain(SECRET.street);
  });

  it("ignores the roommate-preference filter signed out (it would reveal the preference)", async () => {
    const women = await publicBoardListings(db, parseListingQuery({ openTo: "men" }));
    expect(women.listings.map((l) => l.id)).toContain(secretId);
  });
});

describe("Only show to signed-in students", () => {
  it("takes the listing off the signed-out board, sitemap and direct URL, and leaves its share link working", async () => {
    await setListingVisibility(db, secretId, admin, true);
    try {
      expect((await publicBoardListings(db, parseListingQuery({}))).listings.map((l) => l.id)).not.toContain(secretId);
      expect(await publicListingById(db, secretId)).toBeNull();
      expect((await publicSitemapEntries(db)).map((e) => e.id)).not.toContain(secretId);
      expect(await signedInOnlyCount(db)).toBe(1);
      expect((await resolveShare(db, secretId, shareToken(secretId))).state).toBe("open");
      // Signed in, nothing changes.
      expect(await listingForViewer(db, secretId, viewerId)).not.toBeNull();
    } finally {
      await setListingVisibility(db, secretId, admin, false);
    }
    expect(await publicListingById(db, secretId)).not.toBeNull();
    expect(await signedInOnlyCount(db)).toBe(0);
  });

  it("fails closed: a public listing with no area yet is not on the signed-out board", async () => {
    const u = await mkUser("noarea@uvm.edu");
    const id = await addListing(u, { price: 640, lat: 44.47, lon: -73.21 });
    expect((await db.select({ a: s.listings.areaLat, o: s.listings.signedInOnly }).from(s.listings).where(eq(s.listings.id, id)))[0]).toEqual({ a: null, o: false });
    expect(await publicListingById(db, id)).toBeNull();
    expect(await signedInOnlyCount(db)).toBe(1);
    await db.delete(s.listings).where(eq(s.listings.id, id));
  });

  it("is checked against the owner: someone else's listing does not change", async () => {
    expect(await setListingVisibility(db, secretId, { userId: viewerId, isAdmin: false }, true)).toBe(false);
    expect(await publicListingById(db, secretId)).not.toBeNull();
  });
});

describe("the signed-out distance filter and sort use the approximate area", () => {
  /** An id whose area lands at least `meters` further from campus (sign 1) or nearer (-1) than the true point. */
  function idWhereAreaMoves(lat: number, lon: number, sign: 1 | -1, meters: number, from = 5000): number {
    const trueMi = milesFromCampus(lat, lon);
    for (let id = from; id < from + 5000; id++) {
      const a = fuzzedArea(id, lat, lon);
      if (sign * (milesFromCampus(a.lat, a.lon) - trueMi) * 1609.34 >= meters) return id;
    }
    throw new Error("no id found");
  }

  it("a radius that takes in the true point but not the area's center does not return the listing", async () => {
    const at = { lat: 44.4705, lon: -73.2215 };
    const u = await mkUser("radius@uvm.edu");
    const id = idWhereAreaMoves(at.lat, at.lon, 1, 60);
    await addListing(u, { id, price: 990, ...at });
    await setListingVisibility(db, id, admin, false);
    const trueMi = milesFromCampus(at.lat, at.lon);
    const area = fuzzedArea(id, at.lat, at.lon);
    const maxDistance = (trueMi + milesFromCampus(area.lat, area.lon)) / 2;
    const q = { ...parseListingQuery({}), maxDistance };
    expect((await browseListings(db, q, viewerId)).listings.map((l) => l.id)).toContain(id);
    expect((await publicBoardListings(db, q)).listings.map((l) => l.id)).not.toContain(id);
    await db.delete(s.listings).where(eq(s.listings.id, id));
  });

  it('"Closest" orders by the area\'s center, not the true point', async () => {
    // A is truly nearer than B by ~30 m; A's area moves 60+ m out, B's 60+ m in.
    const a = { lat: 44.4705, lon: -73.2215 };
    const b = { lat: 44.47023, lon: -73.22185 };
    expect(milesFromCampus(a.lat, a.lon)).toBeLessThan(milesFromCampus(b.lat, b.lon));
    const idA = idWhereAreaMoves(a.lat, a.lon, 1, 60, 20_000);
    const idB = idWhereAreaMoves(b.lat, b.lon, -1, 60, 30_000);
    const [ua, ub] = await Promise.all([mkUser("closest-a@uvm.edu"), mkUser("closest-b@uvm.edu")]);
    await addListing(ua, { id: idA, price: 1001, ...a });
    await addListing(ub, { id: idB, price: 1002, ...b });
    await setListingVisibility(db, idA, admin, false);
    await setListingVisibility(db, idB, admin, false);
    const q = { ...parseListingQuery({ sort: "closest" }), minPrice: 1000, maxPrice: 1010 };
    expect((await browseListings(db, q, viewerId)).listings.map((l) => l.id)).toEqual([idA, idB]);
    expect((await publicBoardListings(db, q)).listings.map((l) => l.id)).toEqual([idB, idA]);
    await db.delete(s.listings).where(eq(s.listings.id, idA));
    await db.delete(s.listings).where(eq(s.listings.id, idB));
  });

  it("slider bounds come from the signed-out board only", async () => {
    const u = await mkUser("pricey@uvm.edu");
    const id = await addListing(u, { price: 4800, lat: 44.47, lon: -73.21, signedInOnly: true });
    await setListingVisibility(db, id, admin, true);
    expect((await filterBounds(db)).maxPrice).toBe(4800);
    expect((await filterBounds(db, "signed-out")).maxPrice).toBeLessThan(4800);
    await db.delete(s.listings).where(eq(s.listings.id, id));
  });
});

describe("the weekly digest is untouched", () => {
  it("still matches on the signed-in board, including signed-in-only listings", async () => {
    await setListingVisibility(db, secretId, admin, true);
    const found = await newBoardListings(db, parseListingQuery({}), { recipientId: viewerId, since: new Date(0), until: new Date(Date.now() + 60_000) });
    expect(found.map((l) => l.id)).toContain(secretId);
    await setListingVisibility(db, secretId, admin, false);
  });
});
