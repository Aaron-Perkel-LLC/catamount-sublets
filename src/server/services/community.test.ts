import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { setListingVisibility } from "@/server/data/my-listing";
import { setListingSemesters } from "@/server/data/semesters";
import { setSetting } from "@/server/data/settings";
import { tierBackfill } from "@/server/data/tier-backfill";
import { setTier } from "./admin";
import { buildDigest } from "./digest";
import { attachPhotoFor, POSTING_REFUSED, saveListingFor, setStatusFor } from "./listing";

/**
 * Phase 31's community accounts outside the read paths (those are in
 * src/app/(board)/public-pages.test.ts): they can't post, their digest holds
 * only public listings, the admin's tier switch, and the post-deploy backfill.
 */
let db: Db;
let close: () => Promise<void>;
const admin = { userId: "", isAdmin: true };
let seq = 0;

async function mkUser(email: string, tier: "student" | "community") {
  const [u] = await db.insert(s.user).values({ email, name: email.split("@")[0], tier }).returning({ id: s.user.id });
  return { id: u.id, email, role: "user" as const, tier };
}

async function mkListing(userId: string, signedInOnly = false) {
  const n = ++seq;
  const [l] = await db.insert(s.listings).values({ userId, price: 800 + n, address: `${n} Hidden Lane, Burlington`, lat: 44.4778, lon: -73.1965 }).returning({ id: s.listings.id });
  await setListingSemesters(db, l.id, [{ code: "spring27", position: 0 }]);
  await db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: `c${n}`.padEnd(32, "x"), displayUrl: "d", thumbUrl: "t", cardUrl: "c", sha256: "0".repeat(64) });
  await setListingVisibility(db, l.id, admin, signedInOnly);
  return l.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", active: true });
});
afterAll(() => close());

describe("community accounts can't post", () => {
  it("are refused by every posting service, whatever the page showed", async () => {
    const c = await mkUser("robin@gmail.com", "community");
    const form = new FormData();
    form.set("price", "900");
    expect(await saveListingFor(db, c, form)).toEqual({ ok: false, error: POSTING_REFUSED });
    expect(await attachPhotoFor(db, c, "raw/whatever")).toEqual({ ok: false, error: POSTING_REFUSED });
    expect(await setStatusFor(db, c, "paused")).toEqual({ ok: false, error: POSTING_REFUSED });
    expect(await db.select().from(s.listings).where(eq(s.listings.userId, c.id))).toHaveLength(0);
  });

  it("an unknown tier is refused too (fails closed)", async () => {
    const odd = { ...(await mkUser("odd@example.org", "community")), tier: "bogus" as unknown as "community" };
    expect(await saveListingFor(db, odd, new FormData())).toEqual({ ok: false, error: POSTING_REFUSED });
  });
});

describe("the digest follows the recipient's tier", () => {
  it("a community recipient gets public listings only; a student gets every board listing", async () => {
    const poster = await mkUser("poster@uvm.edu", "student");
    const poster2 = await mkUser("poster2@uvm.edu", "student");
    const pub = await mkListing(poster.id);
    const hidden = await mkListing(poster2.id, true);
    const c = await mkUser("reader@gmail.com", "community");
    const st = await mkUser("reader@uvm.edu", "student");
    const window = { since: new Date(0), until: new Date(Date.now() + 60_000) };
    const searches = [{ name: "Everything", query: "" }];
    const forC = await buildDigest(db, { userId: c.id, searches }, window);
    const forS = await buildDigest(db, { userId: st.id, searches }, window);
    expect(forC.lines.map((l) => l.id)).toEqual([pub]);
    expect(forS.lines.map((l) => l.id).sort()).toEqual([pub, hidden].sort());
    expect(JSON.stringify(forC)).not.toContain("Hidden Lane");
    // An account that is gone gets the public view, not the full one.
    expect((await buildDigest(db, { userId: crypto.randomUUID(), searches }, window)).lines.map((l) => l.id)).toEqual([pub]);
  });
});

describe("the admin's tier switch", () => {
  it("promotes and demotes, ending sessions; refuses to demote a poster or touch the admin", async () => {
    const c = await mkUser("grad@example.org", "community");
    await db.insert(s.session).values({ userId: c.id, token: "t-grad", expiresAt: new Date(Date.now() + 86_400_000), updatedAt: new Date() });
    expect(await setTier(db, c.id, "student")).toEqual({ ok: true, data: undefined });
    expect((await db.select({ tier: s.user.tier }).from(s.user).where(eq(s.user.id, c.id)))[0].tier).toBe("student");
    expect(await db.select().from(s.session).where(eq(s.session.userId, c.id))).toHaveLength(0);
    expect(await setTier(db, c.id, "community")).toMatchObject({ ok: true });

    const poster = await mkUser("haslisting@uvm.edu", "student");
    await mkListing(poster.id);
    expect(await setTier(db, poster.id, "community")).toMatchObject({ ok: false, error: expect.stringContaining("listing") });
    expect(await setTier(db, poster.id, "staff")).toMatchObject({ ok: false });
    const [a] = await db.insert(s.user).values({ email: "boss@example.org", name: "boss", role: "admin" }).returning({ id: s.user.id });
    expect(await setTier(db, a.id, "student")).toMatchObject({ ok: false });
  });
});

describe("the post-deploy tier backfill", () => {
  it("finds community accounts with a school or approved address, fixes them once, and leaves the rest", async () => {
    // As the old code would have left them during the deploy gap: no tier set, so the column default.
    const [uvm] = await db.insert(s.user).values({ email: "gap1@uvm.edu", name: "gap1" }).returning({ id: s.user.id });
    const [cc] = await db.insert(s.user).values({ email: "jane.doe@mymail.champlain.edu", name: "jane" }).returning({ id: s.user.id });
    const [ok] = await db.insert(s.user).values({ email: "approved@example.org", name: "approved" }).returning({ id: s.user.id });
    const [stay] = await db.insert(s.user).values({ email: "stranger@gmail.com", name: "stranger" }).returning({ id: s.user.id });
    await setSetting(db, "approved_emails", { emails: ["approved@example.org"] }, null);
    await db.insert(s.session).values({ userId: uvm.id, token: "t-gap1", expiresAt: new Date(Date.now() + 86_400_000), updatedAt: new Date() });

    const dry = await tierBackfill(db, { apply: false });
    expect(dry.wrong.map((w) => w.id).sort()).toEqual([uvm.id, cc.id, ok.id].sort());
    expect(dry.wrong.find((w) => w.id === ok.id)?.why).toBe("approved");
    expect(dry.applied).toBe(0);
    expect((await db.select({ tier: s.user.tier }).from(s.user).where(eq(s.user.id, uvm.id)))[0].tier).toBe("community");

    const applied = await tierBackfill(db, { apply: true });
    expect(applied.applied).toBe(3);
    expect(await db.select().from(s.session).where(eq(s.session.userId, uvm.id))).toHaveLength(0);
    for (const id of [uvm.id, cc.id, ok.id]) expect((await db.select({ tier: s.user.tier }).from(s.user).where(eq(s.user.id, id)))[0].tier).toBe("student");
    expect((await db.select({ tier: s.user.tier }).from(s.user).where(eq(s.user.id, stay.id)))[0].tier).toBe("community");

    const again = await tierBackfill(db, { apply: true });
    expect(again.wrong).toEqual([]);
    expect(again.applied).toBe(0);
  });
});
