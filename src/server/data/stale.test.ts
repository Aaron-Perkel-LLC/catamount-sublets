import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const uploadsDir = await mkdtemp(path.join(tmpdir(), "cs-stale-"));
process.env.UPLOADS_DIR = uploadsDir;

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { saveRawUploadLocal } = await import("@/server/storage");
const { attachPhotoFor } = await import("@/server/services/listing");
const { recordEvent } = await import("@/server/data/events");
const { staleAudience, streetOf } = await import("./stale");
const { removeStale } = await import("@/server/services/stale");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
const ids: Record<string, string> = {};
const listingIds: Record<string, number> = {};
const files = async () => (await readdir(path.join(uploadsDir, "media"), { recursive: true })).filter((f) => f.includes(".")).length;

/**
 * One account per case. "migrated" means legacy_netid set and email_verified
 * false, as the importer leaves it; a sign-in sets last_login_at (the hook),
 * email_verified (better-auth) and a session row.
 */
async function person(key: string, opts: { migrated?: boolean; signedIn?: boolean; role?: string; banned?: boolean; noEmail?: boolean; listing?: boolean; email?: string } = {}) {
  const { migrated = true, signedIn = false, listing = true } = opts;
  const email = opts.email ?? `${key}@uvm.edu`;
  const [u] = await db
    .insert(s.user)
    .values({ email, name: key, firstName: key === "noname" ? null : key[0].toUpperCase() + key.slice(1), lastName: key === "noname" ? null : "Doe", legacyNetid: migrated ? `nid${key}` : null, role: opts.role ?? "user", banned: opts.banned ?? false, noEmail: opts.noEmail ?? false })
    .returning({ id: s.user.id });
  ids[key] = u.id;
  if (signedIn) await signIn(key);
  if (listing) {
    const [l] = await db.insert(s.listings).values({ userId: u.id, price: 800, address: `${key.length} ${key} St, Burlington, VT 05401`, lat: 44.47, lon: -73.2 }).returning({ id: s.listings.id });
    await db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: "spring27", position: 0 });
    listingIds[key] = l.id;
  }
}

async function signIn(key: string) {
  await db.update(s.user).set({ lastLoginAt: new Date(), emailVerified: true }).where(eq(s.user.id, ids[key]));
  await db.insert(s.session).values({ userId: ids[key], token: `t-${key}`, expiresAt: new Date(Date.now() + 1e9), updatedAt: new Date() });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", sortOrder: 1 });
  await person("stale");
  await person("noname");
  await person("returned", { signedIn: true });
  await person("admin", { role: "admin" });
  await person("banned", { banned: true });
  await person("quiet", { noEmail: true });
  await person("archived", { listing: false }); // the archive deleted the listing
  await person("fresh", { migrated: false, signedIn: true });
  await person("seed", { email: "seed1@example.com" });
  await person("late"); // signs in after the notice
  await person("skipped");
  await person("failed"); // the send failed, so not in the log
  await person("viewer", { migrated: false, signedIn: true, listing: false });

  // Photos and events on the stale listing, to see them go with it.
  const [u] = await db.select({ id: s.user.id, email: s.user.email, role: s.user.role }).from(s.user).where(eq(s.user.id, ids.stale));
  const ref = await saveRawUploadLocal(await sharp({ create: { width: 800, height: 600, channels: 3, background: "#1D4F73" } }).jpeg().toBuffer());
  const photo = await attachPhotoFor(db, { id: u.id, email: u.email, role: "user" }, ref);
  if (!photo.ok) throw new Error(photo.error);
  await recordEvent(db, { id: ids.viewer, role: "user" }, { listingId: listingIds.stale, type: "listing_open" });
});

afterAll(async () => {
  await close();
  await rm(uploadsDir, { recursive: true, force: true });
});

describe("staleAudience", () => {
  it("is migrated accounts that never signed in and still have a listing; Stop-email apart", async () => {
    const a = await staleAudience(db);
    expect(a.mail.map((r) => r.id).sort()).toEqual([ids.stale, ids.noname, ids.late, ids.skipped, ids.failed].sort());
    expect(a.noEmail.map((r) => r.id)).toEqual([ids.quiet]);
    const stale = a.mail.find((r) => r.id === ids.stale);
    expect(stale).toMatchObject({ firstName: "Stale", street: "5 stale St", semester: "spring27", status: "open", listingId: listingIds.stale });
    // Left out: signed in, admin, banned, archived listing, never migrated, test address.
    for (const k of ["returned", "admin", "banned", "archived", "fresh", "seed", "viewer"]) expect([...a.mail, ...a.noEmail].some((r) => r.id === ids[k])).toBe(false);
  });

  it("keeps out anyone with any sign of a sign-in, even when the hook missed last_login_at", async () => {
    await person("halfway");
    expect((await staleAudience(db)).mail.some((r) => r.id === ids.halfway)).toBe(true);
    await db.insert(s.session).values({ userId: ids.halfway, token: "t-halfway", expiresAt: new Date(Date.now() + 1e9), updatedAt: new Date() });
    expect((await staleAudience(db)).mail.some((r) => r.id === ids.halfway)).toBe(false);
  });

  it("takes the street line of the address", () => {
    expect(streetOf("12 Main St, Burlington, VT 05401")).toBe("12 Main St");
    expect(streetOf("12 Main St")).toBe("12 Main St");
  });
});

describe("removeStale", () => {
  it("removes the notified who never signed in, skips anyone who signed in after the notice, and writes no outcome", async () => {
    // The notice went to everyone in the audience except the failed send.
    const mailedIds = new Set([ids.stale, ids.noname, ids.late, ids.skipped, ids.quiet]);
    const input = { mailedIds, skip: new Set(["skipped@uvm.edu"]), suppressed: new Set(["failed@uvm.edu"]), includeSuppressed: false };

    // After the notice, one person signs in.
    await signIn("late");

    const dry = await removeStale(db, { ...input, apply: false });
    expect(dry).toMatchObject({ targets: 2, removed: 2, keptNoEmail: 1, keptSkip: 1, keptUnmailed: 1, photos: 1, events: 1, failed: 0 });
    expect(await db.select().from(s.user).where(eq(s.user.id, ids.stale))).toHaveLength(1);

    const filesBefore = await files();
    const logged: string[] = [];
    const report = await removeStale(db, { ...input, apply: true }, async (r) => void logged.push(r.userId));
    expect(report).toMatchObject({ removed: 2, photos: 1, events: 1, droppedAtRecheck: 0 });
    expect(logged.sort()).toEqual([ids.stale, ids.noname].sort());
    expect(await files()).toBe(filesBefore - 3);

    const users = new Set((await db.select({ id: s.user.id }).from(s.user)).map((u) => u.id));
    expect(users.has(ids.stale)).toBe(false);
    expect(users.has(ids.noname)).toBe(false);
    for (const k of ["late", "skipped", "failed", "quiet", "returned", "admin", "banned"]) expect(users.has(ids[k])).toBe(true);
    expect(await db.select().from(s.listings).where(eq(s.listings.id, listingIds.stale))).toHaveLength(0);
    expect(await db.select().from(s.listingEvents).where(eq(s.listingEvents.listingId, listingIds.stale))).toHaveLength(0);
    expect(await db.select().from(s.listingPhotos).where(eq(s.listingPhotos.listingId, listingIds.stale))).toHaveLength(0);
    expect(await db.select().from(s.listingOutcomes)).toHaveLength(0);
  });

  it("with includeSuppressed adds only suppressed addresses; Stop-email and skip.txt stay", async () => {
    const r = await removeStale(db, { mailedIds: new Set(), skip: new Set(["skipped@uvm.edu"]), suppressed: new Set(["failed@uvm.edu", "quiet@uvm.edu", "skipped@uvm.edu"]), includeSuppressed: true, apply: false });
    expect(r).toMatchObject({ removed: 1, keptNoEmail: 1, keptSkip: 1 });
  });
});
