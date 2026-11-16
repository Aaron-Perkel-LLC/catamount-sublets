import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { askedCount, askRecipients, claimAsk, outcomeFor, outcomeSummary, recordOutcome, releaseAsk } from "./listing-outcomes";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

async function person(email: string, extra: Partial<typeof s.user.$inferInsert> = {}): Promise<string> {
  const [u] = await db.insert(s.user).values({ email, name: email.split("@")[0], ...extra }).returning({ id: s.user.id });
  return u.id;
}

async function listing(userId: string, semesterCodes: string[], extra: Partial<typeof s.listings.$inferInsert> = {}): Promise<number> {
  const [l] = await db.insert(s.listings).values({ userId, price: 700, address: "52 North Willard Street, Burlington", lat: 44.48, lon: -73.2, ...extra }).returning({ id: s.listings.id });
  if (semesterCodes.length) await db.insert(s.listingSemesters).values(semesterCodes.map((code, position) => ({ listingId: l.id, semesterCode: code, position })));
  return l.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(s.listingOutcomes);
  await db.delete(s.listingOutcomeAsks);
  await db.delete(s.listings);
  await db.delete(s.user);
  await db.delete(s.semesters);
  await db.insert(s.semesters).values([
    { code: "spring27", name: "Spring 2027", sortOrder: 1 },
    { code: "summer27", name: "Summer 2027", sortOrder: 2 },
    { code: "fall26", name: "Fall 2026", sortOrder: 0, active: false, archivedAt: new Date("2026-12-20") },
  ]);
});

describe("recordOutcome", () => {
  it("stores one row per listing, the latest answer winning", async () => {
    const first = await recordOutcome(db, { listingId: 7, outcome: "still_available", source: "email" });
    expect(first).toMatchObject({ stored: true, replaced: false });
    const second = await recordOutcome(db, { listingId: 7, outcome: "through_site", source: "delete" });
    expect(second).toMatchObject({ id: first.id, stored: true, replaced: true });
    expect(await db.select().from(s.listingOutcomes)).toHaveLength(1);
    expect(await outcomeFor(db, 7)).toMatchObject({ outcome: "through_site", source: "delete" });
  });

  it("keeps a Skip, but never lets one replace an answer", async () => {
    expect(await recordOutcome(db, { listingId: 8, outcome: "skipped", source: "delete" })).toMatchObject({ stored: true });
    await recordOutcome(db, { listingId: 9, outcome: "elsewhere", source: "email" });
    expect(await recordOutcome(db, { listingId: 9, outcome: "skipped", source: "delete" })).toEqual({ id: null, stored: false, replaced: false });
    expect(await outcomeFor(db, 9)).toMatchObject({ outcome: "elsewhere", source: "email" });
    // …while a real answer does replace a Skip.
    await recordOutcome(db, { listingId: 8, outcome: "not_filled", source: "email" });
    expect(await outcomeFor(db, 8)).toMatchObject({ outcome: "not_filled" });
  });

  it("outlives the listing and the account, holding nothing but the listing id", async () => {
    const id = await person("poster@uvm.edu");
    const listingId = await listing(id, ["spring27"]);
    await recordOutcome(db, { listingId, outcome: "through_site", source: "email" });
    await db.delete(s.listings);
    await db.delete(s.user);
    const rows = await db.select().from(s.listingOutcomes);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["createdAt", "id", "listingId", "outcome", "source", "updatedAt"]);
  });

  // Drizzle wraps the database error; the constraint name is on the cause.
  const refused = (p: Promise<unknown>, constraint: RegExp) =>
    p.then(
      () => {
        throw new Error("the insert was accepted");
      },
      (e: Error & { cause?: Error }) => expect(`${e.message} ${e.cause?.message ?? ""}`).toMatch(constraint),
    );

  it("is held to the vocabulary by the database", async () => {
    await refused(db.insert(s.listingOutcomes).values({ listingId: 1, outcome: "maybe", source: "email" }), /listing_outcomes_outcome_check/);
    await refused(db.insert(s.listingOutcomes).values({ listingId: 1, outcome: "elsewhere", source: "admin" }), /listing_outcomes_source_check/);
    await refused(db.insert(s.listingOutcomes).values({ listingId: 1, outcome: "still_available", source: "delete" }), /listing_outcomes_source_outcome_check/);
    await refused(db.insert(s.listingOutcomes).values({ listingId: 1, outcome: "skipped", source: "email" }), /listing_outcomes_source_outcome_check/);
  });
});

describe("outcomeSummary", () => {
  it("counts each outcome and takes 'filled through us' over the answers that say how it ended", async () => {
    expect(await outcomeSummary(db)).toMatchObject({ answered: 0, throughSitePct: null, asked: 0, askedAnswered: 0 });
    const answers = [
      [1, "through_site", "delete"],
      [2, "through_site", "email"],
      [3, "elsewhere", "delete"],
      [4, "not_filled", "delete"],
      [5, "still_available", "email"],
      [6, "skipped", "delete"],
      [7, "skipped", "delete"],
    ] as const;
    for (const [listingId, outcome, source] of answers) await recordOutcome(db, { listingId, outcome, source });
    await db.insert(s.listingOutcomeAsks).values([
      { semesterCode: "spring27", listingId: 2 },
      { semesterCode: "spring27", listingId: 5 },
      { semesterCode: "spring27", listingId: 8 },
      { semesterCode: "summer27", listingId: 2 },
    ]);
    const sum = await outcomeSummary(db);
    expect(sum.counts).toEqual({ through_site: 2, elsewhere: 1, not_filled: 1, still_available: 1, skipped: 2 });
    expect(sum.answered).toBe(4);
    expect(sum.throughSitePct).toBe(50);
    // Three listings asked (2 twice); only 2 has said how it ended.
    expect(sum.asked).toBe(3);
    expect(sum.askedAnswered).toBe(1);
  });
});

describe("askRecipients", () => {
  it("lists the semester's listings that archiving would remove, and leaves out everyone it should", async () => {
    const goes = await listing(await person("sam@uvm.edu", { firstName: "Sam", lastName: "Lee" }), ["spring27"]);
    const taken = await listing(await person("taken@uvm.edu"), ["spring27"], { status: "taken" });
    const withArchived = await listing(await person("old@uvm.edu"), ["fall26", "spring27"]);
    await listing(await person("stays@uvm.edu"), ["spring27", "summer27"]);
    await listing(await person("other@uvm.edu"), ["summer27"]);
    await listing(await person("banned@uvm.edu", { banned: true }), ["spring27"]);
    await listing(await person("quiet@uvm.edu", { noEmail: true }), ["spring27"]);
    const answered = await listing(await person("answered@uvm.edu"), ["spring27"]);
    await recordOutcome(db, { listingId: answered, outcome: "elsewhere", source: "email" });
    const stillAvailable = await listing(await person("still@uvm.edu"), ["spring27"]);
    await recordOutcome(db, { listingId: stillAvailable, outcome: "still_available", source: "email" });
    const asked = await listing(await person("asked@uvm.edu"), ["spring27"]);
    await db.insert(s.listingOutcomeAsks).values({ semesterCode: "spring27", listingId: asked });

    const rows = await askRecipients(db, "spring27");
    expect(rows.map((r) => r.listingId).sort((a, b) => a - b)).toEqual([goes, taken, withArchived, stillAvailable].sort((a, b) => a - b));
    expect(rows.find((r) => r.listingId === goes)).toMatchObject({ email: "sam@uvm.edu", name: "Sam", status: "open" });
    // Never greeted by a login.
    expect(rows.find((r) => r.listingId === taken)?.name).toBeNull();
  });

  it("claims each listing once per semester, and gives a claim back after a failed send", async () => {
    expect(await claimAsk(db, "spring27", 11)).toBe(true);
    expect(await claimAsk(db, "spring27", 11)).toBe(false);
    expect(await claimAsk(db, "summer27", 11)).toBe(true);
    expect(await askedCount(db, "spring27")).toBe(1);
    await releaseAsk(db, "spring27", 11);
    expect(await askedCount(db, "spring27")).toBe(0);
    expect(await askedCount(db, "summer27")).toBe(1);
    expect(await claimAsk(db, "spring27", 11)).toBe(true);
  });
});
