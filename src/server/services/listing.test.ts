import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Local storage root must be set before the storage module loads.
const uploadsDir = await mkdtemp(path.join(tmpdir(), "cs-uploads-"));
process.env.UPLOADS_DIR = uploadsDir;

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { sentInTests } = await import("@/server/email/send");
const { saveRawUploadLocal } = await import("@/server/storage");
const { attachPhotoFor, deleteListingFor, photoOpFor, saveListingFor, setStatusFor } = await import("@/server/services/listing");
const { browseListings } = await import("@/server/data/listings");
const { parseListingQuery } = await import("@/lib/listing-filters");
const { setSetting } = await import("@/server/data/settings");
const { eq } = await import("drizzle-orm");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
const user = { id: "", email: "poster@uvm.edu", role: "user" as const };
const other = { id: "", email: "other@uvm.edu", role: "user" as const };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([
    { code: "spring27", name: "Spring 2027" },
    { code: "summer27", name: "Summer 2027" },
    { code: "fall26", name: "Fall 2026", active: false },
  ]);
  const [u] = await db.insert(s.user).values({ email: user.email, name: "poster" }).returning({ id: s.user.id });
  user.id = u.id;
  const [o] = await db.insert(s.user).values({ email: other.email, name: "other" }).returning({ id: s.user.id });
  other.id = o.id;
});
afterAll(async () => {
  await close();
  await rm(uploadsDir, { recursive: true, force: true });
});

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
}
const base = {
  price: "950",
  search_place: "62 King Street, Burlington, Vermont, United States",
  lat: "44.4762",
  lon: "-73.2106",
  semesters: ["spring27"],
  description: "Sunny room.",
  search_reach: "",
  search_text: "802-555-0100",
  search_who: "Sam",
  utilityElectric: "tenant",
  utilityGas: "",
  utilityWater: "",
  utilityInternet: "",
  utilityCost: "",
  bedrooms: "4",
  bathrooms: "1.5",
  roommates: "2",
  roommateGender: "mixed",
  roommatePreference: "",
};

async function jpeg(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 201, g: 85, b: 43 } } }).jpeg().toBuffer();
}
const filesOnDisk = async () => (await readdir(path.join(uploadsDir, "media"), { recursive: true })).filter((f) => f.includes(".")).length;

describe("the listing lifecycle", () => {
  it("creates a listing that is not on the board until it has a photo", async () => {
    const r = await saveListingFor(db, user, form(base));
    expect(r).toMatchObject({ ok: true, created: true });
    // No name on file (the account name is the email's local part): the email stands in.
    expect(sentInTests.at(-1)).toMatchObject({ kind: "admin_notice", subject: expect.stringContaining("poster@uvm.edu · New listing") });
    expect(sentInTests.at(-1)?.text).toContain("poster@uvm.edu posted a listing.");
    expect((await browseListings(db, parseListingQuery({}), other.id)).listings).toHaveLength(0);
  });

  it("refuses a second listing's worth of fields on a bad form and a gap in semesters", async () => {
    const bad = await saveListingFor(db, user, form({ ...base, price: "-5" }));
    expect(bad.ok).toBe(false);
    expect(bad.fieldErrors?.price).toBeDefined();
    const gap = await saveListingFor(db, user, form({ ...base, semesters: ["spring27", "fall26"] }));
    expect(gap.ok).toBe(false);
    expect(gap.error).toMatch(/isn't open/);
  });

  it("attaches photos through the pipeline, puts the listing on the board, and sends a notice only when something changed", async () => {
    const before = sentInTests.length;
    for (const [w, h] of [
      [1600, 1200],
      [900, 1200],
      [2000, 1000],
    ]) {
      const ref = await saveRawUploadLocal(await jpeg(w, h));
      const r = await attachPhotoFor(db, user, ref);
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
    expect(await filesOnDisk()).toBe(9);
    const board = (await browseListings(db, parseListingQuery({}), other.id)).listings;
    expect(board).toHaveLength(1);
    expect(board[0].photos).toHaveLength(3);
    expect(board[0].hasPhone).toBe(true);

    const same = await saveListingFor(db, user, form(base));
    expect(same.ok).toBe(true);
    expect(sentInTests.length).toBe(before); // nothing changed, nothing sent
    // With a name on file the notice leads with it, the email after.
    await db.update(s.user).set({ firstName: "Sam", lastName: "Lee" }).where(eq(s.user.id, user.id));
    const changed = await saveListingFor(db, user, form({ ...base, price: "900", semesters: ["spring27", "summer27"] }));
    expect(changed.ok).toBe(true);
    expect(sentInTests.at(-1)?.subject).toMatch(/^\[.+\] Sam Lee · Listing edited \(price, semesters\): /);
    expect(sentInTests.at(-1)?.text).toContain("Sam Lee (poster@uvm.edu) changed their listing.");
  });

  it("refuses junk and HEIC uploads and cleans the raw file up", async () => {
    const ref = await saveRawUploadLocal(Buffer.from("not an image"));
    expect(await attachPhotoFor(db, user, ref)).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a photo/) });
    expect(await readdir(path.join(uploadsDir, "raw"))).toHaveLength(0);
  });

  it("reorders, sets the cover and deletes a photo, with its files", async () => {
    const list = (await db.select({ id: s.listingPhotos.id }).from(s.listingPhotos).orderBy(s.listingPhotos.sortOrder)).map((p) => p.id);
    const moved = await photoOpFor(db, user, list[2], { kind: "move", dir: -1 });
    expect(moved.ok && moved.photos.map((p) => p.id)).toEqual([list[0], list[2], list[1]]);
    const cover = await photoOpFor(db, user, list[1], { kind: "cover" });
    expect(cover.ok && cover.photos.map((p) => p.id)).toEqual([list[1], list[0], list[2]]);
    expect(cover.ok && cover.photos.map((p) => p.sortOrder)).toEqual([0, 1, 2]);
    const notMine = await photoOpFor(db, other, list[0], { kind: "delete" });
    expect(notMine).toMatchObject({ ok: false });
    const deleted = await photoOpFor(db, user, list[0], { kind: "delete" });
    expect(deleted.ok && deleted.photos).toHaveLength(2);
    expect(await filesOnDisk()).toBe(6);
  });

  it("pauses and resumes, honours the read-only switch, then deletes everything", async () => {
    expect(await setStatusFor(db, user, "paused")).toEqual({ ok: true });
    expect((await browseListings(db, parseListingQuery({}), other.id)).listings).toHaveLength(0);
    expect(sentInTests.at(-1)?.subject).toMatch(/paused/);
    expect(await setStatusFor(db, user, "open")).toEqual({ ok: true });

    await setSetting(db, "read_only", { active: true, message: "Moving house." }, null);
    expect(await setStatusFor(db, user, "taken")).toMatchObject({ ok: false, error: "Moving house." });
    await setSetting(db, "read_only", { active: false, message: "" }, null);

    expect(await deleteListingFor(db, user)).toEqual({ ok: true });
    expect(await db.select().from(s.listings)).toHaveLength(0);
    expect(await db.select().from(s.listingPhotos)).toHaveLength(0);
    expect(await filesOnDisk()).toBe(0);
    expect(sentInTests.at(-1)?.subject).toMatch(/deleted/);
    expect(await deleteListingFor(db, user)).toMatchObject({ ok: false });
  });

  it("limits how often one person can create a listing", async () => {
    // The lifecycle above created once; two more create-delete rounds use the day's three.
    for (let i = 0; i < 2; i++) {
      expect(await saveListingFor(db, user, form(base))).toMatchObject({ ok: true, created: true });
      expect(await deleteListingFor(db, user)).toEqual({ ok: true });
    }
    expect(await saveListingFor(db, user, form(base))).toMatchObject({ ok: false, error: expect.stringContaining("Try again tomorrow") });
    expect(await db.select().from(s.listings)).toHaveLength(0);
  });
});
