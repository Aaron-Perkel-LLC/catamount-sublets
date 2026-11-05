import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { parseListingQuery } from "@/lib/listing-filters";
import { anyListingExists, browseListings, contactDetails, filterBounds, listingForViewer } from "./listings";
import { boardSemesters, emptyActiveSemesters, setListingSemesters } from "./semesters";

let db: Db;
let close: () => Promise<void>;
let viewer: string;
let poster: string;
const ids: Record<string, number> = {};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([
    { code: "fall26", name: "Fall 2026", active: false },
    { code: "spring27", name: "Spring 2027", active: true },
    { code: "summer27", name: "Summer 2027", active: true },
    { code: "fall27", name: "Fall 2027", active: true },
  ]);
  const mk = async (email: string) =>
    (await db.insert(s.user).values({ email, name: email.split("@")[0] }).returning({ id: s.user.id }))[0].id;
  viewer = await mk("viewer@uvm.edu");
  poster = await mk("poster@uvm.edu");
  await db.update(s.user).set({ firstName: "Pat", lastName: "Poster" }).where(eq(s.user.id, poster));
  const others = await Promise.all(["a@uvm.edu", "b@uvm.edu", "c@uvm.edu", "d@uvm.edu"].map(mk));

  const add = async (
    key: string,
    userId: string,
    v: Partial<typeof s.listings.$inferInsert> & { price: number; lat: number; lon: number },
    sems: string[],
  ) => {
    const [l] = await db
      .insert(s.listings)
      .values({ userId, address: `${key} street, Burlington, Vermont, United States`, ...v })
      .returning({ id: s.listings.id });
    await setListingSemesters(db, l.id, sems.map((code, position) => ({ code, position })));
    ids[key] = l.id;
    for (let i = 0; i < 2; i++) {
      await db.insert(s.listingPhotos).values({
        listingId: l.id,
        sortOrder: 1 - i, // reversed on purpose: order is by sort_order, not insertion
        stem: `${key}${i}`.padEnd(32, "0"),
        displayUrl: `${key}-display-${i}`,
        thumbUrl: `${key}-thumb-${i}`,
        cardUrl: "c",
        sha256: "0".repeat(64),
      });
    }
  };

  // Near campus, cheap, pets, prefers women, contact email blank → account email.
  await add("near", poster, { price: 700, lat: 44.4778, lon: -73.1965, amenityPetsAllowed: true, roommatePreference: "women", contactPhone: "802-555-0100" }, ["spring27"]);
  // Downtown, negotiable, parking (paid), summer+fall.
  await add("down", others[0], { price: 1250, lat: 44.4759, lon: -73.2121, priceNegotiable: true, amenityPaidParking: true, contactEmail: "me@example.com" }, ["summer27", "fall27"]);
  // Winooski, far-ish, furnished, prefers men.
  await add("wino", others[1], { price: 950, lat: 44.4906, lon: -73.1853, amenityFurnished: true, roommatePreference: "men" }, ["spring27"]);
  // Paused: never on the board.
  await add("paused", others[2], { price: 500, lat: 44.4778, lon: -73.1965, status: "paused" }, ["spring27"]);
  // Only an inactive semester: hidden.
  await add("old", others[3], { price: 600, lat: 44.4778, lon: -73.1965 }, ["fall26"]);
});
afterAll(async () => {
  await close();
});

const q = (p: Record<string, string | string[]> = {}) => parseListingQuery(p);

describe("browseListings", () => {
  it("shows only open listings in an active semester, newest first", async () => {
    const r = await browseListings(db, q(), viewer);
    expect(r.listings.map((l) => l.id)).toEqual([ids.wino, ids.down, ids.near]);
    expect(r.filterCount).toBe(0);
  });

  it("builds the card data without contact details or owner ids", async () => {
    const r = await browseListings(db, q(), poster);
    const near = r.listings.find((l) => l.id === ids.near)!;
    expect(near.isMine).toBe(true);
    expect(near.shortAddress).toBe("near street, Burlington");
    expect(near.semesterLabel).toBe("Spring 2027");
    expect(near.photos.map((p) => p.display)).toEqual(["near-display-1", "near-display-0"]);
    expect(near.tags.map((t) => t.label)).toEqual(["Prefers women", "Pets OK"]);
    expect(near.posterName).toBe("Pat Poster");
    expect(near.distanceMi).toBeLessThan(0.2);
    expect(JSON.stringify(near)).not.toMatch(/uvm\.edu|555-0100/);
    const down = r.listings.find((l) => l.id === ids.down)!;
    expect(down.semesterLabel).toBe("Summer & Fall 2027");
    expect(down.isMine).toBe(false);
  });

  it("applies each filter", async () => {
    const byIds = async (p: Record<string, string | string[]>) => (await browseListings(db, q(p), viewer)).listings.map((l) => l.id);
    expect(await byIds({ semester: "fall27" })).toEqual([ids.down]);
    expect(await byIds({ min_price: "600", max_price: "1000" })).toEqual([ids.wino, ids.near]);
    expect(await byIds({ max_distance: "0.5" })).toEqual([ids.near]);
    expect(await byIds({ amenities: ["parking"] })).toEqual([ids.down]);
    expect(await byIds({ amenities: ["pets", "parking"] })).toEqual([]);
    expect(await byIds({ negotiable: "1" })).toEqual([ids.down]);
    expect(await byIds({ open_to: "women" })).toEqual([ids.down, ids.near]);
    expect(await byIds({ open_to: "men" })).toEqual([ids.wino, ids.down]);
    expect(await byIds({ sort: "price_asc" })).toEqual([ids.near, ids.wino, ids.down]);
    expect(await byIds({ sort: "closest" })).toEqual([ids.near, ids.down, ids.wino]);
    expect(await byIds({ sort: "oldest" })).toEqual([ids.near, ids.down, ids.wino]);
  });

  it("lets a poster see their own hidden listing, and nobody else", async () => {
    const [{ userId: pausedOwner }] = await db
      .select({ userId: s.listings.userId })
      .from(s.listings)
      .where(eq(s.listings.id, ids.paused));
    expect(await listingForViewer(db, ids.paused, viewer)).toBeNull();
    expect((await listingForViewer(db, ids.paused, pausedOwner))?.status).toBe("paused");
    expect((await listingForViewer(db, ids.near, viewer))?.id).toBe(ids.near);
  });

  it("opens paused and hidden listings for the admin pages only when asked", async () => {
    expect(await listingForViewer(db, ids.old, viewer)).toBeNull();
    expect((await listingForViewer(db, ids.old, viewer, { anyVisibility: true }))?.id).toBe(ids.old);
    expect((await listingForViewer(db, ids.paused, viewer, { anyVisibility: true }))?.status).toBe("paused");
    expect(await listingForViewer(db, 999_999, viewer, { anyVisibility: true })).toBeNull();
  });
});

describe("bounds, semesters, contact details", () => {
  it("derives slider bounds from visible listings only", async () => {
    expect(await filterBounds(db)).toEqual({ minPrice: 700, maxPrice: 1250, maxDistance: 1.5 });
    expect(await anyListingExists(db)).toBe(true);
  });

  it("lists board semesters and the empty active ones", async () => {
    expect((await boardSemesters(db)).map((x) => x.code)).toEqual(["spring27", "summer27", "fall27"]);
    expect(await emptyActiveSemesters(db)).toEqual([]);
  });

  it("gives contact details only for visible listings, falling back to the account email", async () => {
    expect(await contactDetails(db, ids.near, viewer, false)).toEqual({ email: "poster@uvm.edu", phone: "802-555-0100", posterName: "Pat Poster" });
    expect(await contactDetails(db, ids.down, viewer, false)).toMatchObject({ email: "me@example.com", phone: null });
    expect(await contactDetails(db, ids.paused, viewer, false)).toBeNull();
    expect(await contactDetails(db, ids.paused, viewer, true)).not.toBeNull();
  });
});
