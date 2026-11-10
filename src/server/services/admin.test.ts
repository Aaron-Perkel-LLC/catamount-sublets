import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const uploadsDir = await mkdtemp(path.join(tmpdir(), "cs-admin-"));
process.env.UPLOADS_DIR = uploadsDir;

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const { sentInTests } = await import("@/server/email/send");
const { verifySurveyToken } = await import("@/server/survey-token");
const { saveRawUploadLocal, putMedia } = await import("@/server/storage");
const { attachPhotoFor } = await import("@/server/services/listing");
const admin = await import("@/server/services/admin");
const { recordEvent } = await import("@/server/data/events");
const { browseListings } = await import("@/server/data/listings");
const { parseListingQuery } = await import("@/lib/listing-filters");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
const people: Record<string, { id: string; email: string; role: "user" | "admin" }> = {};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([
    { code: "fall26", name: "Fall 2026", active: false, sortOrder: 1 },
    { code: "spring27", name: "Spring 2027", sortOrder: 2 },
  ]);
  for (const [key, email, role] of [
    ["admin", "aaron@catamountsublets.com", "admin"],
    ["a", "a@uvm.edu", "user"],
    ["b", "b@uvm.edu", "user"],
    ["c", "c@uvm.edu", "user"],
    ["viewer", "v@uvm.edu", "user"],
  ] as const) {
    const [u] = await db.insert(s.user).values({ email, name: key, role }).returning({ id: s.user.id });
    people[key] = { id: u.id, email, role };
  }
  const mk = async (who: string, sems: string[], extra: Partial<typeof s.listings.$inferInsert> = {}) => {
    const [l] = await db.insert(s.listings).values({ userId: people[who].id, price: 800, address: `${who} st, Burlington, Vermont`, lat: 44.47, lon: -73.2, ...extra }).returning({ id: s.listings.id });
    await db.insert(s.listingSemesters).values(sems.map((code, position) => ({ listingId: l.id, semesterCode: code, position })));
    const ref = await saveRawUploadLocal(await sharp({ create: { width: 800, height: 600, channels: 3, background: "#1D4F73" } }).jpeg().toBuffer());
    const r = await attachPhotoFor(db, people[who], ref);
    if (!r.ok) throw new Error(r.error);
    return l.id;
  };
  // a: fall26 only (goes). b: fall26 + spring27 (stays). c: spring27 only, taken.
  await mk("a", ["fall26"], { status: "taken", price: 700 });
  await mk("b", ["fall26", "spring27"], { price: 900 });
  await mk("c", ["spring27"]);
});
afterAll(async () => {
  await close();
  await rm(uploadsDir, { recursive: true, force: true });
});

const files = async () => (await readdir(path.join(uploadsDir, "media"), { recursive: true })).filter((f) => f.includes(".")).length;

describe("semesters", () => {
  it("adds, refuses duplicates and bad codes, toggles, and refuses deleting one in use", async () => {
    expect(await admin.addSemester(db, { code: "summer27", name: "Summer 2027" })).toEqual({ ok: true, data: undefined });
    expect((await admin.addSemester(db, { code: "summer27", name: "x" })).ok).toBe(false);
    expect((await admin.addSemester(db, { code: "Summer 27", name: "x" })).ok).toBe(false);
    expect(await admin.toggleSemester(db, "summer27")).toEqual({ ok: true, data: { active: false } });
    expect((await admin.deleteSemester(db, "spring27")).ok).toBe(false);
    expect((await admin.deleteSemester(db, "summer27")).ok).toBe(true);
  });
});

describe("archive", () => {
  it("plans: a listing that runs on into an unarchived semester stays", async () => {
    const plan = await admin.archivePlan(db, "fall26");
    expect(plan.blocking).toEqual([]);
    expect(plan.going.map((g) => g.ownerEmail)).toEqual(["a@uvm.edu"]);
    expect(plan.staying.map((g) => [g.ownerEmail, g.nextSemester])).toEqual([["b@uvm.edu", "Spring 2027"]]);
    expect(plan.totals).toMatchObject({ listings: 1, taken: 1, photos: 1, priceMedian: 700, priceMin: 700, priceMax: 700 });
    expect((await admin.archivePlan(db, "spring27")).blocking[0]).toMatch(/still active/);
  });

  it("commits: totals row, staying listing re-tagged, going listing and files gone", async () => {
    const [bListing] = await db.select({ id: s.listings.id }).from(s.listings).where(eq(s.listings.userId, people.b.id));
    expect(await recordEvent(db, people.viewer, { listingId: bListing.id, type: "listing_open", source: "browse" })).toBe("stored");
    const before = await files();
    expect((await admin.archiveCommit(db, "fall26", "wrong")).ok).toBe(false);
    const r = await admin.archiveCommit(db, "fall26", "fall26");
    expect(r).toEqual({ ok: true, data: { listings: 1, filesDeleted: 3 } });
    expect(await files()).toBe(before - 3);
    const [row] = await db.select().from(s.semesterArchives);
    expect(row).toMatchObject({ semesterCode: "fall26", listings: 1, taken: 1, photos: 1 });
    expect(Object.keys(row.manifest.listings ?? {})).toHaveLength(1);
    expect((await db.select().from(s.listings).where(eq(s.listings.userId, people.a.id))).length).toBe(0);
    const bSems = await db.select().from(s.listingSemesters).where(eq(s.listingSemesters.listingId, bListing.id));
    expect(bSems).toEqual([{ listingId: bListing.id, semesterCode: "spring27", position: 0 }]);
    const [ev] = await db.select({ sem: s.listingEvents.semesterCode }).from(s.listingEvents).where(eq(s.listingEvents.listingId, bListing.id));
    expect(ev.sem).toBe("spring27");
    expect((await db.select().from(s.semesters).where(eq(s.semesters.code, "fall26")))[0].archivedAt).not.toBeNull();
    expect((await admin.archiveCommit(db, "fall26", "fall26")).ok).toBe(false);
  });
});

describe("posts and people", () => {
  it("names people by their shown name, never a login", async () => {
    await db.update(s.user).set({ firstName: "Ada", lastName: "Lovelace" }).where(eq(s.user.id, people.a.id));
    const byEmail = new Map((await admin.listPeople(db)).map((p) => [p.email, p.name]));
    expect(byEmail.get("a@uvm.edu")).toBe("Ada Lovelace");
    expect(byEmail.get("b@uvm.edu")).toBeNull(); // account name "b" is the email's local part
    expect(byEmail.get("v@uvm.edu")).toBe("viewer");
    await db.update(s.user).set({ firstName: null, lastName: null }).where(eq(s.user.id, people.a.id));
  });

  it("sets status with a notice, bans with session revocation, and deletes a person with their files", async () => {
    const [cListing] = await db.select({ id: s.listings.id }).from(s.listings).where(eq(s.listings.userId, people.c.id));
    expect(await admin.adminSetStatus(db, cListing.id, "paused")).toEqual({ ok: true, data: undefined });
    expect(sentInTests.at(-1)?.subject).toMatch(/paused/);
    expect(sentInTests.at(-1)?.text).toContain("The admin paused the listing by c@uvm.edu.");
    expect((await admin.adminSetStatus(db, cListing.id, "sold" as never)).ok).toBe(false);

    await db.insert(s.session).values({ userId: people.c.id, token: "t1", expiresAt: new Date(Date.now() + 1e6), updatedAt: new Date() });
    expect((await admin.setBanned(db, people.admin.id, true, null, people.admin.id)).ok).toBe(false);
    expect(await admin.setBanned(db, people.c.id, true, "spam", people.admin.id)).toEqual({ ok: true, data: undefined });
    expect(await db.select().from(s.session).where(eq(s.session.userId, people.c.id))).toHaveLength(0);
    expect((await db.select({ b: s.user.banned, r: s.user.banReason }).from(s.user).where(eq(s.user.id, people.c.id)))[0]).toEqual({ b: true, r: "spam" });

    const dry = await admin.deletePerson(db, people.c.id, people.admin.id, true);
    expect(dry).toMatchObject({ ok: true, data: { email: "c@uvm.edu", photos: 1, files: 3 } });
    const before = await files();
    expect((await admin.deletePerson(db, people.c.id, people.admin.id)).ok).toBe(true);
    expect(await files()).toBe(before - 3);
    expect(await db.select().from(s.user).where(eq(s.user.id, people.c.id))).toHaveLength(0);
    expect((await admin.deletePerson(db, people.admin.id, people.admin.id)).ok).toBe(false);
  });

  it("deletes a listing from the admin side with a notice", async () => {
    const [bListing] = await db.select({ id: s.listings.id }).from(s.listings).where(eq(s.listings.userId, people.b.id));
    expect((await browseListings(db, parseListingQuery({}), people.viewer.id)).listings.map((l) => l.id)).toEqual([bListing.id]);
    expect(await admin.adminDeleteListing(db, bListing.id)).toEqual({ ok: true, data: undefined });
    expect(sentInTests.at(-1)?.subject).toMatch(/deleted/);
    expect((await admin.adminDeleteListing(db, bListing.id)).ok).toBe(false);
    expect(await files()).toBe(0);
  });
});

describe("orphans and broadcast", () => {
  it("finds files no row names and deletes only with the right count", async () => {
    await putMedia("listings/999/" + "f".repeat(32) + "_thumb.webp", Buffer.from("x"), "image/webp");
    const report = await admin.orphanReport(db, true);
    expect(report.media).toHaveLength(1);
    expect((await admin.deleteOrphans(db, report.media.map((m) => m.url), 2)).ok).toBe(false);
    expect(await admin.deleteOrphans(db, report.media.map((m) => m.url), 1)).toEqual({ ok: true, data: { deleted: 1 } });
    expect((await admin.orphanReport(db)).media).toHaveLength(0);
  });

  it("addresses a broadcast to the right people and sends one message each plus a copy", async () => {
    // Fresh listing for a (a's old one was archived) so "all" has someone.
    const [l] = await db.insert(s.listings).values({ userId: people.a.id, price: 500, address: "x", lat: 44.47, lon: -73.2 }).returning({ id: s.listings.id });
    await db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: "spring27", position: 0 });
    expect(await admin.broadcastRecipients(db, { kind: "all" })).toEqual([]); // no photo yet: not on the board
    const ref = await saveRawUploadLocal(await sharp({ create: { width: 400, height: 300, channels: 3, background: "#000" } }).jpeg().toBuffer());
    expect((await attachPhotoFor(db, people.a, ref)).ok).toBe(true);
    expect(await admin.broadcastRecipients(db, { kind: "all" })).toEqual([{ id: people.a.id, email: "a@uvm.edu", name: null, posted: true }]);
    expect(await admin.broadcastRecipients(db, { kind: "semester", code: "spring27" })).toEqual([{ id: people.a.id, email: "a@uvm.edu", name: null, posted: true }]);
    // First names greet; without one, the account name does unless it is the login.
    await db.update(s.user).set({ firstName: "Avery", lastName: "Ames" }).where(eq(s.user.id, people.a.id));
    expect(await admin.broadcastRecipients(db, { kind: "all" })).toEqual([{ id: people.a.id, email: "a@uvm.edu", name: "Avery", posted: true }]);
    const n = sentInTests.length;
    const r = await admin.sendBroadcastTo(db, { kind: "individual", userIds: [people.a.id, people.viewer.id] }, { subject: "Hello", body: "Hi {name}, spring is coming.\n\nSee you." });
    expect(r).toEqual({ ok: true, data: { sent: 2, failed: 0 } });
    expect(sentInTests.length - n).toBe(3);
    expect(sentInTests[n].text).toContain("Hi Avery, spring is coming.");
    expect(sentInTests[n].text).toContain("because you posted a listing");
    expect(sentInTests[n + 1].text).toContain("Hi viewer, spring is coming."); // the account name, which is not the login
    expect(sentInTests[n + 1].text).toContain("because you have an account");
    expect(sentInTests[n + 2]).toMatchObject({ to: "aaron@catamountsublets.com", subject: "[Copy] Hello" });
    expect((await admin.sendBroadcastTo(db, { kind: "individual", userIds: [] }, { subject: "x", body: "y" })).ok).toBe(false);
    expect((await admin.sendBroadcastTo(db, { kind: "nobody" } as never, { subject: "x", body: "y" })).ok).toBe(false);
  });

  it("reaches every account, posters or not, and never a banned one", async () => {
    const everyone = await admin.broadcastRecipients(db, { kind: "accounts" });
    expect(everyone).toContainEqual({ id: people.viewer.id, email: "v@uvm.edu", name: "viewer", posted: false });
    expect(everyone).toContainEqual({ id: people.a.id, email: "a@uvm.edu", name: "Avery", posted: true });
    await db.update(s.user).set({ banned: true }).where(eq(s.user.id, people.viewer.id));
    expect((await admin.broadcastRecipients(db, { kind: "accounts" })).map((r) => r.email)).not.toContain("v@uvm.edu");
    expect(await admin.broadcastRecipients(db, { kind: "individual", userIds: [people.viewer.id] })).toEqual([]);
    await db.update(s.user).set({ banned: true }).where(eq(s.user.id, people.a.id));
    expect(await admin.broadcastRecipients(db, { kind: "all" })).toEqual([]);
    expect(await admin.broadcastRecipients(db, { kind: "semester", code: "spring27" })).toEqual([]);
    await db.update(s.user).set({ banned: false }).where(inArray(s.user.id, [people.a.id, people.viewer.id]));
  });

  it("sends the survey to those who have not answered, each with their own link", async () => {
    await db.insert(s.surveyResponses).values({ userId: people.b.id, used: "both", overall: 4 });
    // Admins are never in the survey audience; b has answered.
    expect((await admin.broadcastRecipients(db, { kind: "survey" })).map((r) => r.email)).toEqual(["a@uvm.edu", "v@uvm.edu"]);
    const n = sentInTests.length;
    const missing = await admin.sendBroadcastTo(db, { kind: "survey" }, { subject: "A quick question", body: "Could you spare two minutes?" });
    expect(missing).toMatchObject({ ok: false, error: expect.stringContaining("{survey}") });
    expect(sentInTests.length).toBe(n);

    const r = await admin.sendBroadcastTo(db, { kind: "survey" }, { subject: "A quick question", body: "Could you spare two minutes?\n\n{survey}" });
    expect(r).toEqual({ ok: true, data: { sent: 2, failed: 0 } });
    expect(sentInTests.length - n).toBe(3);
    for (const [i, who] of [people.a, people.viewer].entries()) {
      const mail = sentInTests[n + i];
      expect(mail.to).toBe(who.email);
      const token = /\/survey\?t=([0-9a-f.-]+)/.exec(mail.text)?.[1];
      expect(verifySurveyToken(token ?? "")).toEqual({ userId: who.id });
      expect(mail.text).not.toContain("{survey}");
    }
    expect(sentInTests[n + 2]).toMatchObject({ subject: "[Copy] A quick question" });
    expect(sentInTests[n + 2].text).toContain("{survey}");

    // The link also works for named people, which is how a message is tried on one inbox first.
    const one = await admin.sendBroadcastTo(db, { kind: "individual", userIds: [people.admin.id] }, { subject: "Try", body: "{survey}" });
    expect(one).toEqual({ ok: true, data: { sent: 1, failed: 0 } });
    expect(verifySurveyToken(/\/survey\?t=([0-9a-f.-]+)/.exec(sentInTests.at(-2)?.text ?? "")?.[1] ?? "")).toEqual({ userId: people.admin.id });
    await db.delete(s.surveyResponses);
  });

  it("leaves out anyone marked no email, from every audience, until they are let back in", async () => {
    expect(await admin.setNoEmail(db, people.viewer.id, true)).toEqual({ ok: true, data: undefined });
    expect((await admin.listPeople(db)).find((p) => p.id === people.viewer.id)?.noEmail).toBe(true);
    expect((await admin.broadcastRecipients(db, { kind: "accounts" })).map((r) => r.email)).not.toContain("v@uvm.edu");
    expect((await admin.broadcastRecipients(db, { kind: "survey" })).map((r) => r.email)).not.toContain("v@uvm.edu");
    expect(await admin.broadcastRecipients(db, { kind: "individual", userIds: [people.viewer.id] })).toEqual([]);
    await admin.setNoEmail(db, people.a.id, true);
    expect(await admin.broadcastRecipients(db, { kind: "all" })).toEqual([]);
    expect(await admin.broadcastRecipients(db, { kind: "semester", code: "spring27" })).toEqual([]);
    await admin.setNoEmail(db, people.a.id, false);
    expect(await admin.setNoEmail(db, people.viewer.id, false)).toEqual({ ok: true, data: undefined });
    expect((await admin.broadcastRecipients(db, { kind: "accounts" })).map((r) => r.email)).toContain("v@uvm.edu");
    expect((await admin.setNoEmail(db, "00000000-0000-4000-8000-000000000000", true)).ok).toBe(false);
  });
});
