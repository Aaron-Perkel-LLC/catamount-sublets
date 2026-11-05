import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { dailyActivity, listingActivity, posterStats, recordEvent, shareTargetCounts, viewSourceCounts } from "./events";

let db: Db;
let close: () => Promise<void>;
let listingId: number;
const poster = { id: "", role: "user" as const };
const viewer = { id: "", role: "user" as const };
const other = { id: "", role: "user" as const };
const admin = { id: "", role: "admin" as const };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([{ code: "spring27", name: "Spring 2027" }, { code: "fall26", name: "Fall 2026", active: false }]);
  const mk = async (email: string, role = "user") =>
    (await db.insert(s.user).values({ email, name: email, role }).returning({ id: s.user.id }))[0].id;
  poster.id = await mk("poster@uvm.edu");
  viewer.id = await mk("viewer@uvm.edu");
  other.id = await mk("other@uvm.edu");
  admin.id = await mk("admin@example.com", "admin");
  const [l] = await db.insert(s.listings).values({ userId: poster.id, price: 900, address: "x", lat: 44.47, lon: -73.2 }).returning({ id: s.listings.id });
  listingId = l.id;
  await db.insert(s.listingSemesters).values({ listingId, semesterCode: "spring27", position: 0 });
});
afterAll(async () => {
  await close();
});

describe("recordEvent", () => {
  it("stores, deduplicates per day, and excludes the admin and the poster's own views", async () => {
    expect(await recordEvent(db, viewer, { listingId, type: "listing_open", source: "browse" })).toBe("stored");
    expect(await recordEvent(db, viewer, { listingId, type: "listing_open", source: "map" })).toBe("duplicate");
    expect(await recordEvent(db, viewer, { listingId, type: "email_click", source: "browse" })).toBe("stored");
    expect(await recordEvent(db, viewer, { listingId, type: "email_click", source: "browse" })).toBe("stored");
    expect(await recordEvent(db, admin, { listingId, type: "listing_open" })).toBe("excluded");
    expect(await recordEvent(db, poster, { listingId, type: "listing_open" })).toBe("excluded");
    expect(await recordEvent(db, poster, { listingId, type: "share_target", target: "instagram", source: "post" })).toBe("stored");
    expect(await recordEvent(db, viewer, { listingId, type: "share_target", target: "fax" })).toBe("invalid");
    expect(await recordEvent(db, viewer, { listingId, type: "teleport" })).toBe("invalid");
    expect(await recordEvent(db, viewer, { listingId: 999, type: "listing_open" })).toBe("invalid");
    expect(await recordEvent(db, viewer, { listingId, type: "share_arrival", source: "share-link" })).toBe("stored");
    expect(await recordEvent(db, other, { listingId, type: "listing_open", source: "share-link" })).toBe("stored");
  });

  it("stores no user id, only the keyed hash, and the listing's first semester", async () => {
    const rows = await db.select().from(s.listingEvents);
    expect(rows.every((r) => r.actorKey.length === 16 && r.semesterCode === "spring27")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(viewer.id);
  });

  it("rate-limits one person to sixty stored events a minute", async () => {
    for (let i = 0; i < 70; i++) {
      const r = await recordEvent(db, other, { listingId, type: "copy_email" });
      if (i < 58) expect(r).toBe("stored");
      else if (i >= 59) expect(r).toBe("limited");
    }
  });
});

describe("readers", () => {
  it("count distinct people and conversions per listing", async () => {
    const a = (await listingActivity(db, "all")).get(listingId)!;
    // Both viewers opened the listing and then got in touch, so both converted.
    expect(a).toEqual({ views: 2, contacts: 2, converted: 2, shares: 1, arrivals: 1 });
    expect((await listingActivity(db, "open")).get(listingId)).toEqual(a);
    expect((await listingActivity(db, "30d")).get(listingId)).toEqual(a);
    expect(await shareTargetCounts(db, "all")).toEqual([{ target: "instagram", n: 1 }]);
    expect(await viewSourceCounts(db, "all")).toEqual(expect.arrayContaining([{ source: "browse", n: 1 }, { source: "share-link", n: 1 }]));
    const days = await dailyActivity(db, 7);
    expect(days).toHaveLength(7);
    expect(days[6].views).toBe(2);
    expect(await posterStats(db, listingId, new Date(0))).toEqual({ views: 2, contacts: 2, shares: 1 });
  });

  it("drops out of the open window once the semester is inactive", async () => {
    await db.execute(sql`update semesters set active = false where code = 'spring27'`);
    expect((await listingActivity(db, "open")).get(listingId)).toBeUndefined();
    expect((await listingActivity(db, "all")).get(listingId)?.views).toBe(2);
  });
});
