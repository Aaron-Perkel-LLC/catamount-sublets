import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { GO_PUBLIC_AT, GO_PUBLIC_CRON_UNTIL, PUBLIC_BY_DEFAULT_SINCE } from "@/lib/visibility-rollout";
import { goPublic } from "@/server/data/go-public";
import { fillMissingAreas } from "@/server/data/my-listing";
import { adminSetVisibility } from "@/server/services/admin";
import { goPublicSummary, runScheduledGoPublic } from "@/server/services/go-public";
import { saveListingFor, setVisibilityFor, VISIBILITY_LOCKED_ERROR } from "@/server/services/listing";

/**
 * The 17 Nov change of plan (src/lib/visibility-rollout.ts): posters from
 * before 0010 keep the switch and their call is recorded; posters since get
 * no switch and the server refuses one; an admin can set any listing and
 * records nothing; go-public flips exactly the never-chosen signed-in ones.
 */
type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

const BEFORE = new Date(PUBLIC_BY_DEFAULT_SINCE.getTime() - 86_400_000);
const AFTER = new Date(PUBLIC_BY_DEFAULT_SINCE.getTime() + 3_600_000);

let n = 0;
async function poster() {
  n += 1;
  const email = `p${n}@uvm.edu`;
  const [u] = await db.insert(s.user).values({ email, name: `p${n}` }).returning({ id: s.user.id });
  return { id: u.id, email, role: "user" as const, tier: "student" as const };
}
async function listing(userId: string, cols: Partial<typeof s.listings.$inferInsert>) {
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
    roommateGender: "",
    roommatePreference: "",
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

describe("a listing posted since the cutoff", () => {
  it("is created public even when the form sends signedInOnly", async () => {
    const u = await poster();
    const r = await saveListingFor(db, u, form({ signedInOnly: "on" }));
    expect(r.ok).toBe(true);
    const saved = await row(r.listingId!);
    expect(saved.signedInOnly).toBe(false);
    expect(saved.visibilityChosenAt).toBeNull();
  });

  it("refuses the poster's switch either way, on the server, and changes nothing", async () => {
    const u = await poster();
    const id = await listing(u.id, { postedAt: AFTER });
    const before = await row(id);
    expect(await setVisibilityFor(db, u, true)).toEqual({ ok: false, error: VISIBILITY_LOCKED_ERROR });
    expect(await setVisibilityFor(db, u, false)).toEqual({ ok: false, error: VISIBILITY_LOCKED_ERROR });
    expect(await row(id)).toEqual(before);
  });

  it("can be set by an admin, which records no choice", async () => {
    const u = await poster();
    const id = await listing(u.id, { postedAt: AFTER });
    expect(await adminSetVisibility(db, id, true)).toEqual({ ok: true, data: undefined });
    const after = await row(id);
    expect(after.signedInOnly).toBe(true);
    expect(after.visibilityChosenAt).toBeNull();
    expect(after.areaLat).not.toBeNull();
    expect(await adminSetVisibility(db, 999_999, true)).toMatchObject({ ok: false });
  });
});

describe("a listing posted before the cutoff", () => {
  it("records the pending notice's 'Only show to signed-in students' as a choice without changing the setting", async () => {
    const u = await poster();
    const id = await listing(u.id, { postedAt: BEFORE, signedInOnly: true });
    expect(await setVisibilityFor(db, u, true)).toEqual({ ok: true });
    const after = await row(id);
    expect(after.signedInOnly).toBe(true);
    expect(after.visibilityChosenAt).toBeInstanceOf(Date);
  });

  it("records 'Make it public now' and works out the area", async () => {
    const u = await poster();
    const id = await listing(u.id, { postedAt: BEFORE, signedInOnly: true });
    expect(await setVisibilityFor(db, u, false)).toEqual({ ok: true });
    const after = await row(id);
    expect(after.signedInOnly).toBe(false);
    expect(after.visibilityChosenAt).toBeInstanceOf(Date);
    expect(after.areaLat).not.toBeNull();
  });

  it("is not changed by saving the form, whatever it sends", async () => {
    const u = await poster();
    const id = await listing(u.id, { postedAt: BEFORE, signedInOnly: true });
    await db.insert(s.listingSemesters).values({ listingId: id, semesterCode: "spring27", position: 0 });
    expect((await saveListingFor(db, u, form())).ok).toBe(true);
    expect((await saveListingFor(db, u, form({ signedInOnly: "" }))).ok).toBe(true);
    const after = await row(id);
    expect(after.signedInOnly).toBe(true);
    expect(after.visibilityChosenAt).toBeNull();
  });

  it("is not stamped as chosen when an admin changes it", async () => {
    const u = await poster();
    const id = await listing(u.id, { postedAt: BEFORE, signedInOnly: true });
    await adminSetVisibility(db, id, false);
    await adminSetVisibility(db, id, true);
    expect((await row(id)).visibilityChosenAt).toBeNull();
  });
});

describe("go-public", () => {
  it("makes public exactly the signed-in-only listings nobody chose, once", async () => {
    await db.delete(s.listings);
    const ids = {
      neverChose: await listing((await poster()).id, { postedAt: BEFORE, signedInOnly: true }),
      neverChoseNoArea: await listing((await poster()).id, { postedAt: BEFORE, signedInOnly: true }),
      keptSignedIn: await listing((await poster()).id, { postedAt: BEFORE, signedInOnly: true, visibilityChosenAt: BEFORE }),
      chosePublic: await listing((await poster()).id, { postedAt: BEFORE, signedInOnly: false, visibilityChosenAt: BEFORE }),
      newPublic: await listing((await poster()).id, { postedAt: AFTER }),
      adminKeptNew: await listing((await poster()).id, { postedAt: AFTER, signedInOnly: true }),
    };
    await db.update(s.listings).set({ areaLat: 44.5, areaLon: -73.2 }).where(sql`${s.listings.id} <> ${ids.neverChoseNoArea}`);
    const snapshot = async () => db.select().from(s.listings).orderBy(s.listings.id);
    const untouched = await snapshot();

    const dry = await goPublic(db, { apply: false });
    expect(dry).toEqual({ ids: [ids.neverChose, ids.neverChoseNoArea, ids.adminKeptNew], withoutArea: [ids.neverChoseNoArea], applied: false });
    expect(await snapshot()).toEqual(untouched);

    const applied = await goPublic(db, { apply: true });
    expect(applied).toEqual({ ...dry, applied: true });
    const after = new Map((await snapshot()).map((r) => [r.id, r]));
    for (const id of dry.ids) {
      expect(after.get(id)).toMatchObject({ signedInOnly: false, visibilityChosenAt: null });
    }
    // Everything else exactly as it was.
    for (const before of untouched.filter((r) => !dry.ids.includes(r.id))) expect(after.get(before.id)).toEqual(before);

    expect(await goPublic(db, { apply: true })).toEqual({ ids: [], withoutArea: [], applied: false });
    expect(await goPublic(db, { apply: false })).toEqual({ ids: [], withoutArea: [], applied: false });
  });
});

describe("fillMissingAreas", () => {
  it("fills only the listings without an area and leaves updated_at alone", async () => {
    await db.delete(s.listings);
    const missing = await listing((await poster()).id, { postedAt: BEFORE, signedInOnly: true, updatedAt: BEFORE });
    const has = await listing((await poster()).id, { areaLat: 44.5, areaLon: -73.2 });
    expect(await fillMissingAreas(db)).toBe(1);
    const filled = await row(missing);
    expect(filled.areaLat).not.toBeNull();
    expect(filled.areaLon).not.toBeNull();
    expect(filled.updatedAt).toEqual(BEFORE);
    expect(await row(has)).toMatchObject({ areaLat: 44.5, areaLon: -73.2 });
    expect(await fillMissingAreas(db)).toBe(0);
  });
});

describe("the one-off go-public cron", () => {
  it("is scheduled at 00:05 Eastern on 21 Nov 2026, inside its window", () => {
    const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
    const [min, hour, day, month, weekday] = crons.find((c) => c.path === "/api/cron/go-public")!.schedule.split(" ");
    expect(weekday).toBe("*");
    const fires = new Date(Date.UTC(2026, Number(month) - 1, Number(day), Number(hour), Number(min))); // Vercel schedules in UTC
    expect(fires.toISOString()).toBe(new Date(GO_PUBLIC_AT.getTime() + 5 * 60_000).toISOString());
    expect(fires.getTime()).toBeLessThan(GO_PUBLIC_CRON_UNTIL.getTime());
  });

  it("acts once inside its window and does nothing before, after, or with nothing to flip", async () => {
    await db.delete(s.listings);
    const id = await listing((await poster()).id, { postedAt: BEFORE, signedInOnly: true });
    const at = new Date(GO_PUBLIC_AT.getTime() + 5 * 60_000);

    expect(await runScheduledGoPublic(db, new Date(GO_PUBLIC_AT.getTime() - 1))).toEqual({ acted: false, reason: "too_early" });
    expect(await runScheduledGoPublic(db, GO_PUBLIC_CRON_UNTIL)).toEqual({ acted: false, reason: "too_late" });
    expect(await runScheduledGoPublic(db, new Date("2027-11-21T05:05:00Z"))).toEqual({ acted: false, reason: "too_late" });
    expect((await row(id)).signedInOnly).toBe(true);

    expect(await runScheduledGoPublic(db, at)).toEqual({ acted: true, report: { ids: [id], withoutArea: [id], applied: true } });
    expect((await row(id)).signedInOnly).toBe(false);
    expect(await runScheduledGoPublic(db, new Date(at.getTime() + 3_600_000))).toEqual({ acted: false, reason: "nothing_to_flip" });
  });

  it("summarises with counts and ids only", () => {
    expect(goPublicSummary({ ids: [3, 7], withoutArea: [7], applied: true })).toEqual({ count: 2, ids: "3,7", withoutArea: 1, withoutAreaIds: "7" });
  });
});
