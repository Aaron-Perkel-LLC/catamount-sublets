import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { parseListingQuery } from "@/lib/listing-filters";
import { browseListings, filterBounds, newBoardListings } from "./listings";
import { setListingVisibility } from "./my-listing";
import { publicBoardListings } from "./public-listings";
import { setListingSemesters } from "./semesters";

/**
 * Rooms available and the per-room price on the board: every price filter,
 * sort, slider bound and saved-search match compares price_per_room, signed
 * in and out, and the Rooms and No roommates filters narrow both boards.
 */
let db: Db;
let close: () => Promise<void>;
let viewer: string;
const ids: Record<string, number> = {};
const admin = { userId: "", isAdmin: true };
const since = new Date("2000-01-01T00:00:00Z");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", active: true });
  const mk = async (email: string) => (await db.insert(s.user).values({ email, name: email.split("@")[0] }).returning({ id: s.user.id }))[0].id;
  viewer = await mk("viewer@uvm.edu");
  const add = async (key: string, v: Partial<typeof s.listings.$inferInsert> & { price: number }) => {
    const [l] = await db
      .insert(s.listings)
      .values({ userId: await mk(`${key}@uvm.edu`), address: `${key} St, Burlington`, lat: 44.4778, lon: -73.1965, ...v })
      .returning({ id: s.listings.id });
    await setListingSemesters(db, l.id, [{ code: "spring27", position: 0 }]);
    await db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: key.padEnd(32, "0"), displayUrl: `${key}-d`, thumbUrl: `${key}-t`, cardUrl: "c", sha256: "0".repeat(64) });
    await setListingVisibility(db, l.id, admin, false); // public, with its area
    ids[key] = l.id;
  };
  // One room, as every listing was before.
  await add("room", { price: 850, bedrooms: 3, roommates: 2 });
  // A whole house typed as its total: $800 a room.
  await add("house", { price: 3200, priceBasis: "total", roomsAvailable: 4, bedrooms: 4, roommates: 0 });
  // Three of five rooms, typed per room, two roommates staying.
  await add("three", { price: 700, roomsAvailable: 3, bedrooms: 5, roommates: 2 });
  // A studio to oneself: one room, no roommates.
  await add("studio", { price: 1100, bedrooms: 0, roommates: 0 });
  // Size left blank.
  await add("blank", { price: 950 });
});
afterAll(() => close());

const signedIn = async (p: Record<string, string> = {}) => (await browseListings(db, parseListingQuery(p), viewer)).listings.map((l) => l.id);
const signedOut = async (p: Record<string, string> = {}) => (await publicBoardListings(db, parseListingQuery(p))).listings.map((l) => l.id);
const digest = async (p: Record<string, string> = {}) =>
  (await newBoardListings(db, parseListingQuery(p), { recipientId: viewer, since, until: new Date(Date.now() + 60_000) })).map((l) => l.id);

describe.each([
  ["signed in", signedIn],
  ["signed out", signedOut],
  ["a saved search's digest", digest],
])("the per-room price, %s", (_, board) => {
  it("puts a whole house inside a per-room price range", async () => {
    expect((await board({ min_price: "0", max_price: "900", sort: "price_asc" })).sort()).toEqual([ids.three, ids.house, ids.room].sort());
    expect(await board({ min_price: "1000", max_price: "4000" })).toEqual([ids.studio]);
  });

  it("filters by rooms and by no roommates (blank roommates don't count)", async () => {
    expect((await board({ rooms: "2" })).sort()).toEqual([ids.house, ids.three].sort());
    expect((await board({ rooms: "3" })).sort()).toEqual([ids.house, ids.three].sort());
    expect(await board({ rooms: "4" })).toEqual([ids.house]);
    expect((await board({ no_roommates: "1" })).sort()).toEqual([ids.house, ids.studio].sort());
    expect(await board({ rooms: "2", no_roommates: "1" })).toEqual([ids.house]);
  });
});

describe("sorting and bounds", () => {
  it("sorts by the per-room price both ways, signed in and out", async () => {
    const asc = [ids.three, ids.house, ids.room, ids.blank, ids.studio];
    expect(await signedIn({ sort: "price_asc" })).toEqual(asc);
    expect(await signedIn({ sort: "price_desc" })).toEqual([...asc].reverse());
    expect(await signedOut({ sort: "price_asc" })).toEqual(asc);
    expect(await signedOut({ sort: "price_desc" })).toEqual([...asc].reverse());
  });

  it("sets the price slider from per-room prices", async () => {
    expect(await filterBounds(db)).toMatchObject({ minPrice: 700, maxPrice: 1100 });
    expect(await filterBounds(db, "signed-out")).toMatchObject({ minPrice: 700, maxPrice: 1100 });
  });

  it("carries the price as typed, the per-room price, the basis and the chip, signed in and out", async () => {
    const mine = (await browseListings(db, parseListingQuery({}), viewer)).listings.find((l) => l.id === ids.house)!;
    const pub = (await publicBoardListings(db, parseListingQuery({}))).listings.find((l) => l.id === ids.house)!;
    for (const l of [mine, pub]) {
      expect(l).toMatchObject({ price: 3200, pricePerRoom: 800, priceBasis: "total", roomsAvailable: 4 });
      expect(l.tags[0]).toEqual({ label: "Whole place · 4 BR", kind: "rooms" });
    }
    const room = (await publicBoardListings(db, parseListingQuery({}))).listings.find((l) => l.id === ids.room)!;
    expect(room).toMatchObject({ price: 850, pricePerRoom: 850, priceBasis: "room", roomsAvailable: 1 });
    expect(room.tags.some((t) => t.kind === "rooms")).toBe(false);
  });
});
