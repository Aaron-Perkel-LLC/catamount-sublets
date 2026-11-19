import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { resolveRange } from "@/lib/admin-range";
import { trendRange } from "@/lib/admin-trend";
import { CONTACT_EVENT_TYPES } from "@/lib/options";
import { accountMetrics, activitySeries, demandBySemester, digestWeeks, listingNumbers, noticeNumbers, overviewMetrics, sourcesAndTargets, tableCounts } from "./admin-metrics";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

// Wednesday 18 Nov 2026, 9 pm Eastern.
const NOW = new Date("2026-11-19T02:00:00Z");
const r7 = resolveRange({ range: "7d" }, NOW); // 12–18 Nov, previous 5–11 Nov

let poster: string;
let open: number;
let gone: number;

async function ev(listingId: number, actor: string, type: string, at: string, extra: Partial<typeof s.listingEvents.$inferInsert> = {}) {
  await db.insert(s.listingEvents).values({ listingId, actorKey: actor.padEnd(16, "0"), type, createdAt: new Date(at), semesterCode: "spring27", ...extra });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([{ code: "spring27", name: "Spring 2027", sortOrder: 1 }]);
  const [p, seeker, migrated] = await db
    .insert(s.user)
    .values([
      { email: "p@uvm.edu", name: "p", createdAt: new Date("2026-11-13T15:00:00Z") },
      { email: "s@uvm.edu", name: "s", createdAt: new Date("2026-11-06T15:00:00Z"), lastLoginAt: new Date("2026-11-17T12:00:00Z") },
      { email: "m@uvm.edu", name: "m", legacyNetid: "m", createdAt: new Date("2026-11-14T15:00:00Z") },
    ])
    .returning({ id: s.user.id });
  void seeker;
  void migrated;
  poster = p.id;
  const [l] = await db
    .insert(s.listings)
    .values({ userId: poster, price: 700, address: "1 Main St, Burlington", lat: 44.48, lon: -73.2, postedAt: new Date("2026-11-13T15:00:00Z"), signedInOnly: true, visibilityChosenAt: new Date("2026-11-14T00:00:00Z") })
    .returning({ id: s.listings.id });
  open = l.id;
  await db.insert(s.listingSemesters).values({ listingId: open, semesterCode: "spring27", position: 0 });
  await db.insert(s.listingPhotos).values({ listingId: open, sortOrder: 0, stem: "a".repeat(32), displayUrl: "d", thumbUrl: "t", cardUrl: "c", sha256: "f".repeat(64) });
  gone = 9001; // a deleted listing: events, no row

  // 11:30 pm Eastern on the 17th is 04:30 UTC on the 18th: it belongs to the 17th.
  await ev(open, "a", "listing_open", "2026-11-18T04:30:00Z", { dedupeKey: "1" });
  await ev(open, "b", "listing_open", "2026-11-18T05:30:00Z", { dedupeKey: "2", source: "map" }); // 12:30 am on the 18th
  await ev(open, "c", "listing_open", "2026-11-16T15:00:00Z", { dedupeKey: "3", signedOut: true });
  await ev(open, "a", "copy_email", "2026-11-18T04:31:00Z");
  await ev(open, "a", "dial", "2026-11-18T04:32:00Z");
  await ev(open, "a", "share_target", "2026-11-18T04:33:00Z", { target: "copy" });
  await ev(open, "d", "share_arrival", "2026-11-18T12:00:00Z", { dedupeKey: "4", signedOut: true, source: "share-link" });
  await ev(gone, "e", "listing_open", "2026-11-15T15:00:00Z", { dedupeKey: "5" });
  await ev(gone, "e", "text", "2026-11-15T15:01:00Z");
  // The previous week.
  await ev(open, "f", "listing_open", "2026-11-08T15:00:00Z", { dedupeKey: "6" });
  await ev(open, "f", "copy_phone", "2026-11-08T15:01:00Z");

  await db.insert(s.listingOutcomes).values({ listingId: gone, outcome: "through_site", source: "delete", updatedAt: new Date("2026-11-15T15:02:00Z") });
  await db.insert(s.savedSearches).values({ userId: poster, name: "x", query: "price=800", createdAt: new Date("2026-11-14T15:00:00Z") });
  await db.insert(s.digestSubscriptions).values({ userId: poster, enabled: false, enabledAt: new Date("2026-11-09T15:00:00Z"), disabledVia: "link", updatedAt: new Date("2026-11-16T15:00:00Z") });
  await db.insert(s.digestSends).values({ userId: poster, week: "2026-11-16", status: "sent", windowStart: new Date("2026-11-09T13:00:00Z"), windowEnd: new Date("2026-11-16T13:00:00Z") });
  const [n] = await db.insert(s.siteNotices).values({ title: "Hello", bodyMd: "Hi", audience: "everyone", active: true }).returning({ id: s.siteNotices.id });
  await db.insert(s.noticeEvents).values([
    { noticeId: n.id, type: "view", actorKey: "a".repeat(16), createdAt: new Date("2026-11-17T15:00:00Z") },
    { noticeId: n.id, type: "cta", actorKey: "a".repeat(16), createdAt: new Date("2026-11-17T15:01:00Z") },
    { noticeId: n.id, type: "view", actorKey: "b".repeat(16), createdAt: new Date("2026-10-01T15:00:00Z") },
  ]);
});
afterAll(() => close());

describe("overviewMetrics", () => {
  it("counts the range and the previous equal period, split by viewer, deleted listings included", async () => {
    const o = await overviewMetrics(db, r7);
    expect(o.board).toEqual({ open: 1, public: 0, studentsOnly: 1 });
    expect(o.newListings).toEqual({ cur: 1, prev: 0 });
    expect(o.newAccounts).toEqual({ cur: 1, prev: 1 }); // the migrated account is not new
    expect(o.views).toEqual({ signed_in: { cur: 3, prev: 1 }, signed_out: { cur: 1, prev: 0 } });
    expect(o.contacts).toEqual({ cur: 2, prev: 1 }); // a on open, e on the deleted one
    expect(o.taps).toEqual({ cur: 3, prev: 1 });
    expect(o.signedInViewers).toEqual({ cur: 3, prev: 1 });
    expect(o.shareArrivals.signed_out).toEqual({ cur: 1, prev: 0 });
    expect(o.savedSearches).toEqual({ total: 1, added: { cur: 1, prev: 0 } });
    expect(o.digest).toEqual({ subscribed: 0, joined: { cur: 0, prev: 0 }, left: { cur: 1, prev: 0 } });
    expect(o.outcomes).toEqual({ answered: { cur: 1, prev: 0 }, throughSite: { cur: 1, prev: 0 } });
  });

  it("has no previous period since cutover", async () => {
    const o = await overviewMetrics(db, resolveRange({ range: "cutover" }, NOW));
    expect(o.newListings.prev).toBeNull();
    expect(o.views.signed_in.cur).toBe(4);
  });
});

describe("series and breakdowns", () => {
  it("buckets by Eastern day: 11:30 pm on the 17th is the 17th", async () => {
    const days = await activitySeries(db, r7);
    expect(days.map((d) => d.day)).toEqual(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]);
    const by = Object.fromEntries(days.map((d) => [d.day, d]));
    expect(by["2026-11-17"]).toMatchObject({ views: { signed_in: 1, signed_out: 0 }, contacts: 1 });
    expect(by["2026-11-18"]).toMatchObject({ views: { signed_in: 1, signed_out: 0 }, contacts: 0 });
    expect(by["2026-11-16"].views.signed_out).toBe(1);
    expect(by["2026-11-15"]).toMatchObject({ views: { signed_in: 1 }, contacts: 1 });
  });

  it("weekly buckets start on Monday", async () => {
    const weeks = await activitySeries(db, resolveRange({ range: "custom", from: "2026-10-09", to: "2026-12-31" }, new Date("2027-01-02T17:00:00Z")));
    const w = weeks.find((x) => x.day === "2026-11-16")!;
    expect(w.views.signed_in + w.views.signed_out).toBe(3); // 16–18 Nov; the 15th is the Sunday before
  });

  it("sources, targets, per-listing numbers and semesters", async () => {
    const st = await sourcesAndTargets(db, r7);
    expect(st.sources).toEqual(expect.arrayContaining([{ key: "map", n: 1 }]));
    expect(st.targets).toEqual([{ key: "copy", n: 1 }]);
    const per = await listingNumbers(db, r7);
    expect(per.get(open)).toMatchObject({ views: 3, contacts: 1, converted: 1, shares: 1, arrivals: 1 });
    expect(per.get(gone)).toMatchObject({ views: 1, contacts: 1, converted: 1 });
    expect(await demandBySemester(db, r7)).toEqual([{ code: "spring27", views: 4, contacts: 2, listingsContacted: 2 }]);
  });
});

describe("accounts, comms and system", () => {
  it("accounts by day, posters and seekers, last seen, visibility", async () => {
    const a = await accountMetrics(db, r7);
    expect(a.weekly.find((d) => d.day === "2026-11-13")).toEqual({ day: "2026-11-13", posters: 1, seekers: 0 });
    expect(a.active.total).toBe(3);
    expect(a.visibility).toEqual({ listings: 1, studentsOnly: 1, chose: 1, choseStudentsOnly: 1 });
  });

  it("notices, digest weeks and table counts", async () => {
    expect(await noticeNumbers(db, r7)).toEqual([expect.objectContaining({ title: "Hello", views: 1, dismissals: 0, ctas: 1 })]);
    expect(await digestWeeks(db, r7)).toEqual([{ week: "2026-11-16", sent: 1, empty: 0, failed: 0, pending: 0, leftByLink: 1, leftFromAccount: 0 }]);
    const t = await tableCounts(db);
    expect(t.rows.find((x) => x.table === "listing_events")?.n).toBe(11);
  });
});

describe("activitySeries over a trailing window", () => {
  let wdb: Db;
  let wclose: () => Promise<void>;
  const r30 = trendRange(resolveRange({ range: "30d" }, NOW)); // 20 Oct–18 Nov, asked for from 14 Oct
  const contact = (listingId: number, actor: string, at: string, type: string = CONTACT_EVENT_TYPES[0]) =>
    wdb.insert(s.listingEvents).values({ listingId, actorKey: actor.padEnd(16, "0"), type, createdAt: new Date(at), semesterCode: "spring27" });

  beforeAll(async () => {
    ({ db: wdb, close: wclose } = await createTestDb());
    await contact(1, "a", "2026-11-10T15:00:00Z");
    await contact(1, "a", "2026-11-10T15:05:00Z", CONTACT_EVENT_TYPES[1]); // a second tap the same day
    await contact(1, "a", "2026-11-12T15:00:00Z"); // the same person, the same listing, two days later
    await contact(2, "a", "2026-11-12T16:00:00Z"); // the same person, another listing
    await contact(1, "b", "2026-11-11T15:00:00Z"); // someone else, the first listing
    await contact(3, "c", "2026-11-04T04:30:00Z"); // 11:30 pm Eastern on the 3rd
    await contact(4, "d", "2026-10-15T15:00:00Z"); // before the range, inside the first window
  });
  afterAll(async () => {
    await wclose();
  });

  it("counts a person once per listing across a window, however many of its days they got in touch", async () => {
    const by = Object.fromEntries((await activitySeries(wdb, r30, 7)).map((d) => [d.day, d]));
    expect(by["2026-11-10"]).toMatchObject({ contacts: 1, contactsWindow: 1 });
    expect(by["2026-11-12"]).toMatchObject({ contacts: 2, contactsWindow: 3 }); // a:1 once, b:1, a:2
    expect(by["2026-11-12"].contactsWindow).toBeLessThan(by["2026-11-10"].contacts + by["2026-11-11"].contacts + by["2026-11-12"].contacts);
    expect(by["2026-11-16"].contactsWindow).toBe(3); // 10–16 Nov still holds all three
    expect(by["2026-11-17"].contactsWindow).toBe(3); // 11–17 Nov: a:1 from the 12th, b:1, a:2
    expect(by["2026-11-18"].contactsWindow).toBe(2); // 12–18 Nov: b:1 has left
  });

  it("windows are Eastern days and reach back before the range's first day", async () => {
    const by = Object.fromEntries((await activitySeries(wdb, r30, 7)).map((d) => [d.day, d]));
    expect(by["2026-11-03"].contacts).toBe(1);
    expect(by["2026-11-09"].contactsWindow).toBe(1); // 3–9 Nov
    expect(by["2026-11-10"].contactsWindow).toBe(1); // 4–10 Nov: only a:1 now
    expect(by["2026-10-20"]).toMatchObject({ contacts: 0, contactsWindow: 1 }); // 14–20 Oct holds the 15th
    expect(by["2026-10-22"].contactsWindow).toBe(0);
  });

  it("is the day's own count with no window, and with weekly buckets", async () => {
    for (const d of await activitySeries(wdb, r30)) expect(d.contactsWindow).toBe(d.contacts);
    const weekly = await activitySeries(wdb, resolveRange({ range: "custom", from: "2026-10-09", to: "2026-12-31" }, new Date("2027-01-02T17:00:00Z")), 7);
    for (const w of weekly) expect(w.contactsWindow).toBe(w.contacts);
    expect(weekly.find((w) => w.day === "2026-11-09")?.contacts).toBe(3); // a week's own count is already once per person and listing
  });
});
