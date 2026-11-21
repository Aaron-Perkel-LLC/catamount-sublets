import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { fillMissingAreas } from "@/server/data/my-listing";
import { adminSetVisibility } from "@/server/services/admin";
import { saveListingFor } from "@/server/services/listing";

/**
 * Who sees a listing: every listing is public, posters have no switch (the
 * form never sets it, whatever it sends), and only the admin can keep one to
 * signed-in students. The daily sweep's area backfill is here too.
 */
type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

let n = 0;
async function poster() {
  n += 1;
  const email = `p${n}@uvm.edu`;
  const [u] = await db.insert(s.user).values({ email, name: `p${n}` }).returning({ id: s.user.id });
  return { id: u.id, email, role: "user" as const };
}
async function listing(userId: string, cols: Partial<typeof s.listings.$inferInsert> = {}) {
  const [row] = await db
    .insert(s.listings)
    .values({ userId, price: 800, address: `${n} Test St`, lat: 44.476 + n * 0.001, lon: -73.21, ...cols })
    .returning({ id: s.listings.id });
  return row.id;
}
const row = async (id: number) => (await db.select().from(s.listings).where(eq(s.listings.id, id)))[0];

function form(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    price: "900",
    search_place: "62 King Street, Burlington, Vermont, United States",
    lat: "44.4762",
    lon: "-73.2106",
    semesters: "spring27",
    description: "",
    search_reach: "",
    search_text: "",
    utilityElectric: "",
    utilityGas: "",
    utilityWater: "",
    utilityInternet: "",
    utilityCost: "",
    bedrooms: "",
    bathrooms: "",
    roommates: "",
    roommatePreference: "",
    roommateGender: "",
    ...extra,
  };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027" });
});
afterAll(() => close());

describe("who sees a listing", () => {
  it("is public when created, even when the form sends signedInOnly", async () => {
    const r = await saveListingFor(db, await poster(), form({ signedInOnly: "on" }));
    expect(r.ok).toBe(true);
    expect((await row(r.listingId!)).signedInOnly).toBe(false);
  });

  it("is not changed by saving the form, whatever it sends", async () => {
    const u = await poster();
    const id = await listing(u.id, { signedInOnly: true });
    await db.insert(s.listingSemesters).values({ listingId: id, semesterCode: "spring27", position: 0 });
    expect((await saveListingFor(db, u, form())).ok).toBe(true);
    expect((await saveListingFor(db, u, form({ signedInOnly: "" }))).ok).toBe(true);
    expect((await row(id)).signedInOnly).toBe(true);
  });

  it("can be set either way by the admin, which works out the area", async () => {
    const id = await listing((await poster()).id);
    expect(await adminSetVisibility(db, id, true)).toEqual({ ok: true, data: undefined });
    const kept = await row(id);
    expect(kept.signedInOnly).toBe(true);
    expect(kept.areaLat).not.toBeNull();
    expect(await adminSetVisibility(db, id, false)).toEqual({ ok: true, data: undefined });
    expect((await row(id)).signedInOnly).toBe(false);
    expect(await adminSetVisibility(db, 999_999, true)).toMatchObject({ ok: false });
  });
});

describe("fillMissingAreas", () => {
  it("fills only the listings without an area and leaves updated_at alone", async () => {
    await db.delete(s.listings);
    const then = new Date("2026-11-01T12:00:00Z");
    const missing = await listing((await poster()).id, { updatedAt: then });
    const has = await listing((await poster()).id, { areaLat: 44.5, areaLon: -73.2 });
    expect(await fillMissingAreas(db)).toBe(1);
    const filled = await row(missing);
    expect(filled.areaLat).not.toBeNull();
    expect(filled.areaLon).not.toBeNull();
    expect(filled.updatedAt).toEqual(then);
    expect(await row(has)).toMatchObject({ areaLat: 44.5, areaLon: -73.2 });
    expect(await fillMissingAreas(db)).toBe(0);
  });
});
