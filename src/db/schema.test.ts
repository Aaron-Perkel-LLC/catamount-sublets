import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./index";
import * as s from "./schema";
import { createTestDb } from "./test-db";

/**
 * The real migrations on an in-memory Postgres: the constraints the plan
 * promises actually exist.
 */
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([
    { code: "spring27", name: "Spring 2027", sortOrder: 6 },
    { code: "summer27", name: "Summer 2027", sortOrder: 7 },
  ]);
});
afterAll(async () => {
  await close();
});

/** Drizzle wraps database errors; the constraint name is on the cause. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toSatisfy((e: unknown) => {
    const err = e as { message?: string; cause?: { message?: string } };
    const deep = (err.cause as { cause?: { message?: string } } | undefined)?.cause?.message ?? "";
    return pattern.test(`${err.message ?? ""} ${err.cause?.message ?? ""} ${deep}`);
  });
}

async function makeUser(email: string, extra: Partial<typeof s.user.$inferInsert> = {}) {
  const [u] = await db
    .insert(s.user)
    .values({ email, name: email.split("@")[0], ...extra })
    .returning();
  return u;
}

async function makeListing(userId: string, extra: Partial<typeof s.listings.$inferInsert> = {}) {
  const [l] = await db
    .insert(s.listings)
    .values({ userId, price: 1200, address: "62 King St, Burlington", lat: 44.4759, lon: -73.2121, ...extra })
    .returning();
  return l;
}

describe("users", () => {
  it("rejects an email that is not lowercase and a duplicate legacy netid", async () => {
    await expectDbError(makeUser("Mixed@uvm.edu"), /user_email_lowercase_check/);
    await makeUser("one@uvm.edu", { legacyNetid: "one" });
    await expectDbError(makeUser("two@uvm.edu", { legacyNetid: "one" }), /user_legacy_netid_key/);
  });
});

describe("listings", () => {
  it("allows one listing per user and keeps legacy ids", async () => {
    const u = await makeUser("poster@uvm.edu");
    const l = await makeListing(u.id, { id: 187, legacyImport: true });
    expect(l.id).toBe(187);
    expect(l.status).toBe("open");
    expect(l.price).toBe(1200);
    await expectDbError(makeListing(u.id), /listings_user_id_key/);
  });

  it("enforces the vocabularies and ranges", async () => {
    const u = await makeUser("ranges@uvm.edu");
    await expectDbError(makeListing(u.id, { status: "sold" }), /listings_status_check/);
    await expectDbError(makeListing(u.id, { utilityGas: "maybe" }), /listings_utility_gas_check/);
    await expectDbError(makeListing(u.id, { roommatePreference: "cats" }), /listings_roommate_preference_check/);
    await expectDbError(makeListing(u.id, { price: -1 }), /listings_price_check/);
    await expectDbError(makeListing(u.id, { bathrooms: 0.3 }), /listings_bathrooms_check/);
    await expectDbError(makeListing(u.id, { lat: 91 }), /listings_lat_check/);
    const ok = await makeListing(u.id, { bathrooms: 1.5, bedrooms: 3, roommates: 0, roommatePreference: "women" });
    expect(ok.bathrooms).toBe(1.5);
  });

  it("numbers semesters uniquely per listing and refuses deleting a semester in use", async () => {
    const u = await makeUser("sem@uvm.edu");
    const l = await makeListing(u.id);
    await db.insert(s.listingSemesters).values([
      { listingId: l.id, semesterCode: "spring27", position: 0 },
      { listingId: l.id, semesterCode: "summer27", position: 1 },
    ]);
    await expectDbError(
      db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: "spring27", position: 5 }),
      /listing_semesters_listing_id_semester_code_pk/,
    );
    await expectDbError(db.delete(s.semesters).where(eq(s.semesters.code, "spring27")), /foreign key|semesters_code_fk/i);
  });

  it("cascades photos, semesters and events when a listing or its user goes", async () => {
    const u = await makeUser("cascade@uvm.edu");
    const l = await makeListing(u.id);
    await db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: "spring27", position: 0 });
    await db.insert(s.listingPhotos).values({
      listingId: l.id,
      sortOrder: 0,
      stem: "a".repeat(32),
      displayUrl: "d",
      thumbUrl: "t",
      cardUrl: "c",
      sha256: "f".repeat(64),
    });
    await db.insert(s.listingEvents).values({
      listingId: l.id,
      actorKey: "0123456789abcdef",
      type: "listing_open",
      source: "browse",
      dedupeKey: `listing_open:${l.id}:0123456789abcdef:2026-10-08`,
    });
    await expectDbError(
      db.insert(s.listingEvents).values({ listingId: l.id, actorKey: "0123456789abcdef", type: "bogus" }),
      /listing_events_type_check/,
    );

    await db.delete(s.user).where(eq(s.user.id, u.id));
    expect(await db.select().from(s.listings).where(eq(s.listings.id, l.id))).toHaveLength(0);
    expect(await db.select().from(s.listingPhotos).where(eq(s.listingPhotos.listingId, l.id))).toHaveLength(0);
    expect(await db.select().from(s.listingSemesters).where(eq(s.listingSemesters.listingId, l.id))).toHaveLength(0);
    expect(await db.select().from(s.listingEvents).where(eq(s.listingEvents.listingId, l.id))).toHaveLength(0);
  });

  it("stores timestamps with their instant intact", async () => {
    const u = await makeUser("tz@uvm.edu");
    const posted = new Date("2026-03-21T23:07:23Z");
    const l = await makeListing(u.id, { postedAt: posted });
    expect(l.postedAt.toISOString()).toBe(posted.toISOString());
  });
});

describe("site settings and archives", () => {
  it("round-trip JSON", async () => {
    await db.insert(s.siteSettings).values({ key: "announcement", value: { active: false, message: "", style: "info" } });
    const [row] = await db.select().from(s.siteSettings).where(eq(s.siteSettings.key, "announcement"));
    expect(row.value).toEqual({ active: false, message: "", style: "info" });
    const [a] = await db
      .insert(s.semesterArchives)
      .values({ semesterCode: "summer26", semesterName: "Summer 2026", listings: 11, priceMedian: 1000, manifest: { legacyTarball: "x.tar.gz" } })
      .returning();
    expect(a.priceMedian).toBe(1000);
    expect(a.manifest.legacyTarball).toBe("x.tar.gz");
  });
});
