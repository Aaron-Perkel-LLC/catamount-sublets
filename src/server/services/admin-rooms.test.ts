import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { adminSetRooms, archivePlan } from "./admin";

/**
 * The admin's Rooms editor: the post form's size rules, the same
 * normalisation (one room is per room; no roommates clears the roommate
 * gender and preference), and never the price.
 */
let db: Db;
let close: () => Promise<void>;
let id: number;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db.insert(s.user).values({ email: "house@uvm.edu", name: "house" }).returning({ id: s.user.id });
  // A whole house posted before rooms existed: one room, its total as the price, roommate fields filled in.
  const [l] = await db
    .insert(s.listings)
    .values({ userId: u.id, price: 3200, address: "1 House St", lat: 44.47, lon: -73.2, bedrooms: 4, roommates: null, roommateGender: "mixed", roommatePreference: "women" })
    .returning({ id: s.listings.id });
  id = l.id;
});
afterAll(() => close());

const row = async () => (await db.select().from(s.listings).where(eq(s.listings.id, id)))[0];

describe("adminSetRooms", () => {
  it("refuses what the post form refuses, changing nothing", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await adminSetRooms(db, { listingId: id, roomsAvailable: 4, bedrooms: 3, roommates: 0, priceBasis: "total" })).toEqual({
      ok: false,
      error: "You're subletting 4 rooms, so the place has at least 4 bedrooms.",
    });
    expect(await adminSetRooms(db, { listingId: id, roomsAvailable: 4, bedrooms: 4, roommates: null, priceBasis: null })).toMatchObject({ ok: false, error: expect.stringMatching(/roommates are staying.*per room or for the whole place/) });
    expect(await adminSetRooms(db, { listingId: id, roomsAvailable: 4, bedrooms: 4, roommates: 0, priceBasis: "total", price: 1 })).toMatchObject({ ok: false });
    expect(await adminSetRooms(db, { listingId: 999_999, roomsAvailable: 1, bedrooms: 4, roommates: 0, priceBasis: null })).toEqual({ ok: false, error: "No such listing." });
    expect(await row()).toMatchObject({ roomsAvailable: 1, priceBasis: "room", pricePerRoom: 3200, roommateGender: "mixed" });
  });

  it("sets a whole house, keeps the price as typed, and clears roommate details when nobody stays", async () => {
    expect(await adminSetRooms(db, { listingId: id, roomsAvailable: 4, bedrooms: 4, roommates: 0, priceBasis: "total" })).toEqual({ ok: true, data: { priceText: "$3,200 total · $800/room" } });
    expect(await row()).toMatchObject({ price: 3200, roomsAvailable: 4, bedrooms: 4, roommates: 0, priceBasis: "total", pricePerRoom: 800, roommateGender: "", roommatePreference: "" });
  });

  it("prices one room per room whatever basis is sent", async () => {
    expect(await adminSetRooms(db, { listingId: id, roomsAvailable: 1, bedrooms: 4, roommates: 2, priceBasis: "total" })).toEqual({ ok: true, data: { priceText: "$3,200/mo" } });
    expect(await row()).toMatchObject({ roomsAvailable: 1, priceBasis: "room", pricePerRoom: 3200, roommates: 2 });
  });

  it("archives a whole house at its per-room price, and lists it as it reads", async () => {
    await adminSetRooms(db, { listingId: id, roomsAvailable: 4, bedrooms: 4, roommates: 0, priceBasis: "total" });
    await db.insert(s.semesters).values({ code: "fall26", name: "Fall 2026", active: false });
    await db.insert(s.listingSemesters).values({ listingId: id, semesterCode: "fall26", position: 0 });
    const plan = await archivePlan(db, "fall26");
    expect(plan.totals).toMatchObject({ listings: 1, priceMedian: 800, priceMin: 800, priceMax: 800 });
    expect(plan.going[0]).toMatchObject({ price: 800, priceText: "$3,200 total · $800/room" });
  });
});
