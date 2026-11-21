import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { milesFromCampus } from "@/lib/distance";
import { cellCenter, gridCell, metersBetween, offsetPoint } from "@/lib/geo-fuzz";
import { listingInput } from "@/lib/listing-input";
import { AMENITY_KEYS, UTILITY_KINDS } from "@/lib/options";
import { amenityField, utilityField } from "@/lib/listing-input";
import { parseListingQuery } from "@/lib/listing-filters";
import { shareToken } from "@/lib/share";
import { fuzzedArea } from "@/server/geo-fuzz";
import { browseListings, filterBounds, listingForViewer, newBoardListings } from "./listings";
import { createListing, setListingVisibility, updateListing } from "./my-listing";
import { publicBoardListings, publicListingById, publicSitemapEntries, signedInOnlyCount } from "./public-listings";
import { boardSemesters, emptyActiveSemesters, setListingSemesters } from "./semesters";
import { coordinateLeaks, leaks, SECRET } from "./public-leak-fixture";
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
    for (const key of ["address", "shortAddress", "lat", "lon", "mapsUrl", "appleMapsUrl", "posterName", "hasPhone", "isMine", "shareUrl", "roommateGender", "roommatePreference", "roommateGenderLabel", "roommatePreferenceLabel", "confirmedAvailable", "description"]) {
      expect(one).not.toHaveProperty(key);
    }
    expect(one).toMatchObject({ audience: "public", title: `2BR · ${one!.neighborhood}`, price: 875 });
    expect(one).not.toHaveProperty("description");
  });

  it("puts the true point inside the circle", async () => {
    const one = (await publicListingById(db, secretId))!;
    expect(metersBetween(one.area.lat, one.area.lon, SECRET.lat, SECRET.lon)).toBeLessThan(one.area.radiusM);
    expect(one.area).toEqual(fuzzedArea(SECRET.lat, SECRET.lon));
  });

  it("the leak checks recognise the real projection's area, as JSON and inside HTML", async () => {
    const board = await publicBoardListings(db, parseListingQuery({}));
    const { area } = (await publicListingById(db, secretId))!;
    const sharesLat = { lat: area.lat, lon: -73.1 }; // a point that shares only the area's latitude
    for (const body of [JSON.stringify(board), JSON.stringify(JSON.stringify(board))]) {
      expect(coordinateLeaks(body, sharesLat)).toEqual(["lat"]); // nothing excused: found
      expect(coordinateLeaks(body, sharesLat, [area])).toEqual([]); // the area recognised and excused
      expect(coordinateLeaks(body, area, [area])).toEqual(["lat", "lon"]); // an area on the point itself
    }
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

describe("kept to signed-in students (the admin's Seen by)", () => {
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
  const areaMi = (p: { lat: number; lon: number }) => {
    const a = fuzzedArea(p.lat, p.lon);
    return milesFromCampus(a.lat, a.lon);
  };
  /** Places near (lat, lon), on a ~25 m lattice, for searching out a particular offset. */
  function* near(lat: number, lon: number, steps = 12) {
    for (let r = 1; r <= steps; r++) for (let i = 0; i < 8 * r; i++) yield offsetPoint(lat, lon, (i / (8 * r)) * 2 * Math.PI, r * 25);
  }
  /** A place near (lat, lon) whose area lands at least `meters` further from campus (sign 1) or nearer (-1) than the place itself. */
  function placeWhereAreaMoves(lat: number, lon: number, sign: 1 | -1, meters: number) {
    for (const p of near(lat, lon)) if (sign * (areaMi(p) - milesFromCampus(p.lat, p.lon)) * 1609.34 >= meters) return p;
    throw new Error("no place found");
  }

  it("a radius that takes in the true point but not the area's center does not return the listing", async () => {
    const at = placeWhereAreaMoves(44.4705, -73.2215, 1, 60);
    const u = await mkUser("radius@uvm.edu");
    const id = await addListing(u, { price: 990, ...at });
    await setListingVisibility(db, id, admin, false);
    const trueMi = milesFromCampus(at.lat, at.lon);
    const area = fuzzedArea(at.lat, at.lon);
    const maxDistance = (trueMi + milesFromCampus(area.lat, area.lon)) / 2;
    const q = { ...parseListingQuery({}), maxDistance };
    expect((await browseListings(db, q, viewerId)).listings.map((l) => l.id)).toContain(id);
    expect((await publicBoardListings(db, q)).listings.map((l) => l.id)).not.toContain(id);
    await db.delete(s.listings).where(eq(s.listings.id, id));
  });

  it('"Closest" orders by the area\'s center, not the true point', async () => {
    // A is truly nearer campus than B, but A's area is further out than B's.
    const a = placeWhereAreaMoves(44.4705, -73.2215, 1, 60);
    const b = [...near(a.lat, a.lon)].find((p) => milesFromCampus(p.lat, p.lon) > milesFromCampus(a.lat, a.lon) && areaMi(p) < areaMi(a));
    if (!b) throw new Error("no place found");
    const [ua, ub] = await Promise.all([mkUser("closest-a@uvm.edu"), mkUser("closest-b@uvm.edu")]);
    const idA = await addListing(ua, { price: 1001, ...a });
    const idB = await addListing(ub, { price: 1002, ...b });
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

describe("the approximate area belongs to the place, not the listing", () => {
  const input = (lat: number, lon: number) =>
    listingInput.parse({
      price: 700,
      priceNegotiable: false,
      address: "1 Same House St, Burlington",
      lat,
      lon,
      semesters: ["spring27"],
      description: "",
      contactEmail: "",
      contactPhone: "",
      ...Object.fromEntries(UTILITY_KINDS.map((k) => [utilityField(k), "tenant"])),
      utilityCost: null,
      ...Object.fromEntries(AMENITY_KEYS.map((k) => [amenityField(k), false])),
      bedrooms: 1,
      bathrooms: 1,
      roommates: 2,
      roommateGender: "",
      roommatePreference: "",
    });
  const areaOf = async (id: number) => (await db.select({ lat: s.listings.areaLat, lon: s.listings.areaLon }).from(s.listings).where(eq(s.listings.id, id)))[0];

  it("roommates in one house, geocoded a few metres apart, share one circle; a listing that moves gets a new one", async () => {
    const house = cellCenter(gridCell(44.4789, -73.2071));
    const nudged = offsetPoint(house.lat, house.lon, 1.1, 6);
    const [u1, u2] = await Promise.all([mkUser("room-a@uvm.edu"), mkUser("room-b@uvm.edu")]);
    const a = await createListing(db, u1, input(house.lat, house.lon), [{ code: "spring27", position: 0 }]);
    const b = await createListing(db, u2, input(nudged.lat, nudged.lon), [{ code: "spring27", position: 0 }]);
    expect(a).not.toBe(b);
    expect(await areaOf(a)).toEqual(await areaOf(b));
    expect(await areaOf(a)).toEqual({ lat: fuzzedArea(house.lat, house.lon).lat, lon: fuzzedArea(house.lat, house.lon).lon });

    const moved = offsetPoint(house.lat, house.lon, 0.4, 300);
    expect(await updateListing(db, b, { userId: u2, isAdmin: false }, input(moved.lat, moved.lon), [{ code: "spring27", position: 0 }])).toBe(true);
    expect(await areaOf(b)).not.toEqual(await areaOf(a));
    expect(await areaOf(b)).toEqual({ lat: fuzzedArea(moved.lat, moved.lon).lat, lon: fuzzedArea(moved.lat, moved.lon).lon });
    await db.delete(s.listings).where(inArray(s.listings.id, [a, b]));
  });
});

describe("the signed-out semester filter", () => {
  it("doesn't name a semester whose only listings are signed-in only, not even as \"(none yet)\"", async () => {
    await db.insert(s.semesters).values({ code: "summer27", name: "Summer 2027", active: true }).onConflictDoNothing();
    const u = await mkUser("summer-only@uvm.edu");
    const id = await addListing(u, { price: 720, lat: 44.475, lon: -73.2 });
    await setListingSemesters(db, id, [{ code: "summer27", position: 0 }]);
    await setListingVisibility(db, id, admin, true);
    try {
      // Signed in: on the board, as before.
      expect((await boardSemesters(db)).map((x) => x.code)).toContain("summer27");
      // Signed out: neither a semester to pick nor "(none yet)" would tell anyone it is there, so it is simply "(none yet)" like any empty one.
      expect((await boardSemesters(db, "signed-out")).map((x) => x.code)).not.toContain("summer27");
      expect((await emptyActiveSemesters(db, "signed-out")).map((x) => x.code)).toContain("summer27");
      expect((await boardSemesters(db, "signed-out")).map((x) => x.code)).toContain("spring27");
      // Switched public, it is named.
      await setListingVisibility(db, id, admin, false);
      expect((await boardSemesters(db, "signed-out")).map((x) => x.code)).toContain("summer27");
      expect((await emptyActiveSemesters(db, "signed-out")).map((x) => x.code)).not.toContain("summer27");
    } finally {
      await db.delete(s.listings).where(eq(s.listings.id, id));
    }
  });
});

describe("the sitemap", () => {
  it("gives each listing's last change as an Eastern date, never a time", async () => {
    // 03:30 UTC on 17 Nov is still 16 Nov in Burlington.
    await db.update(s.listings).set({ updatedAt: new Date("2026-11-17T03:30:12.345Z"), postedAt: new Date("2026-11-01T12:00:00Z") }).where(eq(s.listings.id, secretId));
    const entry = (await publicSitemapEntries(db)).find((e) => e.id === secretId);
    expect(entry).toEqual({ id: secretId, lastModified: "2026-11-16" });
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
