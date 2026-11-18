import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Local storage root must be set before the storage module loads.
process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "cs-outcome-"));

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq, sql } = await import("drizzle-orm");
const { listingForViewer } = await import("@/server/data/listings");
const { shortDate } = await import("@/lib/dates");
const { sentInTests } = await import("@/server/email/send");
const { deleteListingFor } = await import("@/server/services/listing");
const { answerFromLink, answerLinks, askPreview, outcomePageState, sendAsks, sendAskTest } = await import("@/server/services/listing-outcome");
const { signOutcomeToken, verifyOutcomeToken } = await import("@/server/outcome-token");
const { vi } = await import("vitest");
const { outcomeFor } = await import("@/server/data/listing-outcomes");
const { setSetting } = await import("@/server/data/settings");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
let ip = 0;
const nextIp = () => `203.0.113.${++ip}`;

async function poster(email: string, firstName: string | null = null) {
  const [u] = await db.insert(s.user).values({ email, name: email.split("@")[0], firstName, lastName: firstName ? "Lee" : null }).returning({ id: s.user.id });
  const [l] = await db.insert(s.listings).values({ userId: u.id, price: 650, address: "52 North Willard Street, Burlington, Vermont", lat: 44.48, lon: -73.2 }).returning({ id: s.listings.id });
  await db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: "spring27", position: 0 });
  return { user: { id: u.id, email, role: "user" as const, tier: "student" as const }, listingId: l.id };
}

async function listingRow(id: number) {
  const [row] = await db.select({ status: s.listings.status, confirmedAvailableAt: s.listings.confirmedAvailableAt }).from(s.listings).where(eq(s.listings.id, id));
  return row;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  sentInTests.length = 0;
  await db.delete(s.listingOutcomes);
  await db.delete(s.listingOutcomeAsks);
  await db.delete(s.listings);
  await db.delete(s.user);
  await db.delete(s.semesters);
  await db.delete(s.rateLimitBuckets);
  await db.delete(s.siteSettings);
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027" });
});

describe("the question on delete", () => {
  it("records the answer under the deleted listing's id, with source delete", async () => {
    const p = await poster("poster@uvm.edu");
    expect(await deleteListingFor(db, p.user, "through_site")).toEqual({ ok: true });
    expect(await db.select().from(s.listings)).toHaveLength(0);
    expect(await outcomeFor(db, p.listingId)).toMatchObject({ outcome: "through_site", source: "delete" });
  });

  it("records Skip as skipped", async () => {
    const p = await poster("poster@uvm.edu");
    await deleteListingFor(db, p.user, "skipped");
    expect(await outcomeFor(db, p.listingId)).toMatchObject({ outcome: "skipped" });
  });

  it("deletes without recording when there is no answer, or one that is not in the vocabulary", async () => {
    for (const answer of [undefined, "still_available", "nonsense", 7]) {
      const p = await poster(`p${String(answer)}@uvm.edu`);
      expect(await deleteListingFor(db, p.user, answer)).toEqual({ ok: true });
      expect(await outcomeFor(db, p.listingId)).toBeNull();
    }
    expect(await db.select().from(s.listings)).toHaveLength(0);
  });

  it("only ever answers for the poster's own listing", async () => {
    const mine = await poster("poster@uvm.edu");
    const theirs = await poster("other@uvm.edu");
    await deleteListingFor(db, mine.user, "elsewhere");
    expect(await outcomeFor(db, theirs.listingId)).toBeNull();
    expect(await db.select({ id: s.listings.id }).from(s.listings)).toEqual([{ id: theirs.listingId }]);
  });

  it("still deletes when the answer cannot be saved", async () => {
    const { db: broken, close: closeBroken } = await createTestDb();
    try {
      await broken.insert(s.semesters).values({ code: "spring27", name: "Spring 2027" });
      const [u] = await broken.insert(s.user).values({ email: "poster@uvm.edu", name: "poster" }).returning({ id: s.user.id });
      await broken.insert(s.listings).values({ userId: u.id, price: 650, address: "1 Main St", lat: 44.48, lon: -73.2 });
      await broken.execute(sql`drop table listing_outcomes`);
      expect(await deleteListingFor(broken, { id: u.id, email: "poster@uvm.edu", role: "user", tier: "student" }, "through_site")).toEqual({ ok: true });
      expect(await broken.select().from(s.listings)).toHaveLength(0);
    } finally {
      await closeBroken();
    }
  });
});

describe("answers through the email's links", () => {
  it("Filled through us marks the listing taken, and tells the admin", async () => {
    const p = await poster("poster@uvm.edu");
    expect(await answerFromLink(db, { t: signOutcomeToken(p.listingId), a: "through_site" }, nextIp())).toEqual({ ok: true, outcome: "through_site", effect: "taken" });
    expect(await listingRow(p.listingId)).toMatchObject({ status: "taken", confirmedAvailableAt: null });
    expect(await outcomeFor(db, p.listingId)).toMatchObject({ outcome: "through_site", source: "email" });
    expect(sentInTests.filter((m) => m.kind === "admin_notice")).toHaveLength(1);
  });

  it("Filled elsewhere marks it taken too; a repeat tap changes nothing", async () => {
    const p = await poster("poster@uvm.edu");
    const t = signOutcomeToken(p.listingId);
    expect(await answerFromLink(db, { t, a: "elsewhere" }, nextIp())).toMatchObject({ effect: "taken" });
    expect(await answerFromLink(db, { t, a: "elsewhere" }, nextIp())).toMatchObject({ effect: "unchanged" });
    expect(await listingRow(p.listingId)).toMatchObject({ status: "taken" });
    expect(sentInTests.filter((m) => m.kind === "admin_notice")).toHaveLength(1);
  });

  it("Still available stamps the date, which the card and listing view show", async () => {
    const p = await poster("poster@uvm.edu");
    const before = Date.now();
    expect(await answerFromLink(db, { t: signOutcomeToken(p.listingId), a: "still_available" }, nextIp())).toMatchObject({ effect: "confirmed" });
    const row = await listingRow(p.listingId);
    expect(row.status).toBe("open");
    expect(row.confirmedAvailableAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const dto = await listingForViewer(db, p.listingId, null, { anyVisibility: true });
    expect(dto?.confirmedAvailable).toBe(shortDate(row.confirmedAvailableAt!));
  });

  it("Taking it down only records the answer", async () => {
    const p = await poster("poster@uvm.edu");
    expect(await answerFromLink(db, { t: signOutcomeToken(p.listingId), a: "not_filled" }, nextIp())).toMatchObject({ effect: "unchanged" });
    expect(await listingRow(p.listingId)).toMatchObject({ status: "open", confirmedAvailableAt: null });
    expect(await outcomeFor(db, p.listingId)).toMatchObject({ outcome: "not_filled" });
    expect(sentInTests).toHaveLength(0);
  });

  it("a replaced answer: Still available, then Filled through us, ends taken, and the date no longer shows", async () => {
    const p = await poster("poster@uvm.edu");
    const t = signOutcomeToken(p.listingId);
    await answerFromLink(db, { t, a: "still_available" }, nextIp());
    expect(await answerFromLink(db, { t, a: "through_site" }, nextIp())).toMatchObject({ effect: "taken" });
    expect(await outcomeFor(db, p.listingId)).toMatchObject({ outcome: "through_site", source: "email" });
    expect(await listingRow(p.listingId)).toMatchObject({ status: "taken" });
    expect((await listingForViewer(db, p.listingId, null, { anyVisibility: true }))?.confirmedAvailable).toBeNull();
    expect(await db.select().from(s.listingOutcomes)).toHaveLength(1);
  });

  it("a replaced answer: Filled, then Still available, puts the listing back up the email took down", async () => {
    const p = await poster("poster@uvm.edu");
    const t = signOutcomeToken(p.listingId);
    await answerFromLink(db, { t, a: "elsewhere" }, nextIp());
    expect(await answerFromLink(db, { t, a: "still_available" }, nextIp())).toMatchObject({ effect: "reopened" });
    expect(await listingRow(p.listingId)).toMatchObject({ status: "open" });
    expect((await listingRow(p.listingId)).confirmedAvailableAt).not.toBeNull();
    expect(await outcomeFor(db, p.listingId)).toMatchObject({ outcome: "still_available" });
  });

  it("Still available never reopens a listing the poster marked taken or paused themselves", async () => {
    const taken = await poster("taken@uvm.edu");
    const paused = await poster("paused@uvm.edu");
    await db.update(s.listings).set({ status: "taken" }).where(eq(s.listings.id, taken.listingId));
    await db.update(s.listings).set({ status: "paused" }).where(eq(s.listings.id, paused.listingId));
    expect(await answerFromLink(db, { t: signOutcomeToken(taken.listingId), a: "still_available" }, nextIp())).toMatchObject({ effect: "confirmed" });
    expect(await answerFromLink(db, { t: signOutcomeToken(paused.listingId), a: "still_available" }, nextIp())).toMatchObject({ effect: "confirmed" });
    expect(await listingRow(taken.listingId)).toMatchObject({ status: "taken" });
    expect(await listingRow(paused.listingId)).toMatchObject({ status: "paused" });
  });

  it("acts only on the listing the token names", async () => {
    const mine = await poster("poster@uvm.edu");
    const theirs = await poster("other@uvm.edu");
    await answerFromLink(db, { t: signOutcomeToken(mine.listingId), a: "through_site" }, nextIp());
    await answerFromLink(db, { t: signOutcomeToken(mine.listingId), a: "still_available" }, nextIp());
    expect(await listingRow(theirs.listingId)).toMatchObject({ status: "open", confirmedAvailableAt: null });
    expect(await outcomeFor(db, theirs.listingId)).toBeNull();
  });

  it("opening the page (the GET) writes nothing", async () => {
    const p = await poster("poster@uvm.edu");
    expect(await outcomePageState(db, signOutcomeToken(p.listingId))).toEqual({ state: "open", listingId: p.listingId, current: null });
    expect(await db.select().from(s.listingOutcomes)).toHaveLength(0);
    expect(await listingRow(p.listingId)).toMatchObject({ status: "open", confirmedAvailableAt: null });
  });

  it("still records once the listing is gone, which is the point of asking", async () => {
    const p = await poster("poster@uvm.edu");
    const t = signOutcomeToken(p.listingId);
    await db.delete(s.listings);
    expect(await answerFromLink(db, { t, a: "elsewhere" }, nextIp())).toEqual({ ok: true, outcome: "elsewhere", effect: "gone" });
    expect(await outcomePageState(db, t)).toEqual({ state: "open", listingId: p.listingId, current: "elsewhere" });
  });

  it("refuses a forged token or an answer outside the email's four, and stores nothing", async () => {
    const p = await poster("poster@uvm.edu");
    const [id, exp, sig] = signOutcomeToken(p.listingId).split(".");
    expect(await answerFromLink(db, { t: `${id}.${exp}.${sig.replace(/^./, sig[0] === "a" ? "b" : "a")}`, a: "elsewhere" }, nextIp())).toMatchObject({ ok: false });
    expect(await answerFromLink(db, { t: signOutcomeToken(p.listingId), a: "skipped" }, nextIp())).toMatchObject({ ok: false });
    expect(await answerFromLink(db, { t: 42, a: "elsewhere" }, nextIp())).toMatchObject({ ok: false });
    expect(await outcomePageState(db, "nope")).toEqual({ state: "invalid" });
    expect(await db.select().from(s.listingOutcomes)).toHaveLength(0);
  });

  it("honours read-only mode and the per-IP limit", async () => {
    const p = await poster("poster@uvm.edu");
    const t = signOutcomeToken(p.listingId);
    await setSetting(db, "read_only", { active: true, message: "Back soon." }, null);
    expect(await answerFromLink(db, { t, a: "elsewhere" }, nextIp())).toEqual({ ok: false, error: "Back soon." });
    await db.delete(s.siteSettings);
    const same = nextIp();
    for (let i = 0; i < 20; i++) expect(await answerFromLink(db, { t, a: "elsewhere" }, same)).toMatchObject({ ok: true });
    expect(await answerFromLink(db, { t, a: "elsewhere" }, same)).toMatchObject({ ok: false });
  });
});

describe("the per-semester send", () => {
  it("previews, needs the code typed back, sends each poster their own links once, and a second send sends nothing", async () => {
    const sam = await poster("sam@uvm.edu", "Sam");
    const kai = await poster("kai@uvm.edu");
    const preview = await askPreview(db, "spring27");
    expect(preview).toMatchObject({ name: "Spring 2027", blocking: [], alreadyAsked: 0 });
    expect(preview.recipients.map((r) => r.listingId).sort()).toEqual([sam.listingId, kai.listingId].sort());
    expect(sentInTests).toHaveLength(0);

    expect(await sendAsks(db, "spring27", "spring2")).toMatchObject({ ok: false });
    expect(sentInTests).toHaveLength(0);

    expect(await sendAsks(db, "spring27", "spring27")).toEqual({ ok: true, data: { sent: 2, failed: 0, skipped: 0 } });
    const toSam = sentInTests.find((m) => m.to === "sam@uvm.edu")!;
    expect(toSam).toMatchObject({ kind: "outcome_ask", subject: "Is your sublet still available?" });
    expect(toSam.text).toContain("Hi Sam,");
    expect(toSam.text).toContain("your listing at 52 North Willard Street, Burlington");
    // Each answer on its own line in the plain-text part, not run together.
    for (const a of ["through_site", "elsewhere", "still_available", "not_filled"]) expect(toSam.text).toMatch(new RegExp(`&a=${a}$`, "m"));
    expect(Object.keys(answerLinks(sam.listingId))).toHaveLength(4);
    expect(toSam.text).toContain(`/outcome?t=${sam.listingId}.`);
    expect(toSam.text).not.toContain(`/outcome?t=${kai.listingId}.`);

    expect((await askPreview(db, "spring27")).alreadyAsked).toBe(2);
    expect(await sendAsks(db, "spring27", "spring27")).toMatchObject({ ok: false });
    expect(sentInTests).toHaveLength(2);
  });

  it("refuses an archived or unknown semester", async () => {
    await db.update(s.semesters).set({ active: false, archivedAt: new Date() });
    expect((await askPreview(db, "spring27")).blocking).toEqual(["Already archived: its listings are gone."]);
    expect(await sendAsks(db, "spring27", "spring27")).toMatchObject({ ok: false });
    expect((await askPreview(db, "fall99")).blocking).toEqual(["No such semester."]);
  });
});

describe("Send test to me", () => {
  async function admin() {
    const [u] = await db.insert(s.user).values({ email: "aaron@uvm.edu", name: "aaron", role: "admin" }).returning({ id: s.user.id });
    return { id: u.id, email: "aaron@uvm.edu" };
  }

  it("sends the chosen listing's email, with its real links, to the admin only, and records no ask", async () => {
    const me = await admin();
    const sam = await poster("sam@uvm.edu", "Sam");
    expect(await sendAskTest(db, me, "spring27", sam.listingId)).toEqual({ ok: true, data: { to: "aaron@uvm.edu" } });
    expect(sentInTests.map((m) => m.to)).toEqual(["aaron@uvm.edu"]);
    const [mail] = sentInTests;
    expect(mail).toMatchObject({ kind: "outcome_ask", subject: "[Test] Is your sublet still available?" });
    expect(mail.text).toContain("Hi Sam,");
    const token = /\/outcome\?t=([^&\s]+)&a=through_site/.exec(mail.text)?.[1];
    expect(token && verifyOutcomeToken(token)).toEqual({ listingId: sam.listingId });
    expect(await db.select().from(s.listingOutcomeAsks)).toHaveLength(0);
    // The real send still goes to the poster.
    expect((await askPreview(db, "spring27")).recipients.map((r) => r.listingId)).toEqual([sam.listingId]);
  });

  it("works for any listing: another semester's, or one already asked", async () => {
    const me = await admin();
    await db.insert(s.semesters).values({ code: "fall27", name: "Fall 2027" });
    const p = await poster("kai@uvm.edu");
    await db.update(s.listingSemesters).set({ semesterCode: "fall27" }).where(eq(s.listingSemesters.listingId, p.listingId));
    await db.insert(s.listingOutcomeAsks).values({ semesterCode: "spring27", listingId: p.listingId });
    expect(await sendAskTest(db, me, "spring27", p.listingId)).toMatchObject({ ok: true });
    expect(await db.select().from(s.listingOutcomeAsks)).toHaveLength(1);
    const choices = (await askPreview(db, "spring27")).testListings;
    expect(choices).toEqual([{ listingId: p.listingId, label: `#${p.listingId} · 52 North Willard Street, Burlington · other semester` }]);
  });

  it("lists this semester's listings first", async () => {
    await db.insert(s.semesters).values({ code: "fall27", name: "Fall 2027" });
    const inIt = await poster("a@uvm.edu");
    const other = await poster("b@uvm.edu");
    await db.update(s.listingSemesters).set({ semesterCode: "fall27" }).where(eq(s.listingSemesters.listingId, other.listingId));
    expect((await askPreview(db, "spring27")).testListings.map((l) => l.listingId)).toEqual([inIt.listingId, other.listingId]);
  });

  it("refuses a bad listing id, a listing that is gone, an unknown semester, or no secret, and sends nothing", async () => {
    const me = await admin();
    const p = await poster("sam@uvm.edu");
    for (const bad of [0, -1, 1.5, "7", null]) expect(await sendAskTest(db, me, "spring27", bad)).toEqual({ ok: false, error: "Pick a listing." });
    expect(await sendAskTest(db, me, "fall99", p.listingId)).toEqual({ ok: false, error: "No such semester." });
    expect(await sendAskTest(db, me, "spring27", p.listingId + 1000)).toEqual({ ok: false, error: "That listing is gone." });
    vi.stubEnv("SURVEY_SECRET", undefined);
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      expect(await sendAskTest(db, me, "spring27", p.listingId)).toMatchObject({ ok: false, error: expect.stringMatching(/SURVEY_SECRET/) });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(sentInTests).toHaveLength(0);
  });
});
