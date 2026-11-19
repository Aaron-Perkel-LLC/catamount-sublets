import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { shareSlug } from "@/lib/share";
import { anonymousActorKey, recordAnonymousShareArrival, recordAnonymousView } from "./events";
import { setListingVisibility } from "./my-listing";
import { setListingSemesters } from "./semesters";

const IP = "203.0.113.42";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

let db: Db;
let close: () => Promise<void>;
let listingId: number;
const admin = { userId: "", isAdmin: true };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", active: true });
  const [u] = await db.insert(s.user).values({ email: "p@uvm.edu", name: "p" }).returning({ id: s.user.id });
  const [l] = await db.insert(s.listings).values({ userId: u.id, price: 800, address: "9 Elm St", lat: 44.47, lon: -73.2 }).returning({ id: s.listings.id });
  listingId = l.id;
  await setListingSemesters(db, l.id, [{ code: "spring27", position: 0 }]);
  await db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: "e".repeat(32), displayUrl: "d", thumbUrl: "t", cardUrl: "c", sha256: "0".repeat(64) });
  await setListingVisibility(db, l.id, admin, false);
});
afterAll(() => close());
beforeEach(async () => {
  vi.useRealTimers();
  await db.delete(s.listingEvents);
});

const rows = () => db.select().from(s.listingEvents).where(eq(s.listingEvents.listingId, listingId));

describe("signed-out views", () => {
  it("are stored once per visitor, listing and Eastern day, flagged signed out", async () => {
    expect(await recordAnonymousView(db, { listingId, source: "browse", ip: IP, userAgent: UA })).toBe("stored");
    expect(await recordAnonymousView(db, { listingId, source: "map", ip: IP, userAgent: UA })).toBe("duplicate");
    expect(await recordAnonymousView(db, { listingId, source: "browse", ip: "198.51.100.7", userAgent: UA })).toBe("stored");
    const stored = await rows();
    expect(stored).toHaveLength(2);
    for (const r of stored) expect(r).toMatchObject({ type: "listing_open", signedOut: true });
  });

  it("never store the IP or the user agent, in any column", async () => {
    await recordAnonymousView(db, { listingId, source: "browse", ip: IP, userAgent: UA });
    const text = JSON.stringify(await rows());
    expect(text).not.toContain(IP);
    expect(text).not.toContain("203.0.113");
    expect(text).not.toContain("iPhone");
  });

  it("use a key that changes with the Eastern day, not the UTC one", () => {
    // 11 pm and 1 am Eastern are different days; 11 pm Eastern is already the next UTC day.
    const lateEvening = new Date("2026-11-17T04:00:00Z"); // 11 pm EST, 16 Nov
    const sameEvening = new Date("2026-11-17T04:59:00Z");
    const nextMorning = new Date("2026-11-17T06:00:00Z"); // 1 am EST, 17 Nov
    expect(anonymousActorKey(IP, UA, lateEvening)).toBe(anonymousActorKey(IP, UA, sameEvening));
    expect(anonymousActorKey(IP, UA, lateEvening)).not.toBe(anonymousActorKey(IP, UA, nextMorning));
    expect(anonymousActorKey(IP, UA, lateEvening)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("are not taken for a listing kept to signed-in students, or one that does not exist", async () => {
    await setListingVisibility(db, listingId, admin, true);
    expect(await recordAnonymousView(db, { listingId, ip: IP, userAgent: UA })).toBe("invalid");
    await setListingVisibility(db, listingId, admin, false);
    expect(await recordAnonymousView(db, { listingId: 999_999, ip: IP, userAgent: UA })).toBe("invalid");
    expect(await rows()).toHaveLength(0);
  });
});

describe("signed-out share arrivals", () => {
  const arrive = (extra: { slug?: string; listingId?: number; ip?: string } = {}) =>
    recordAnonymousShareArrival(db, { listingId: extra.listingId ?? listingId, slug: extra.slug, source: "share-link", ip: extra.ip ?? IP, userAgent: UA });

  it("are stored once per visitor, listing and Eastern day for a public listing, flagged signed out", async () => {
    expect(await arrive()).toBe("stored");
    expect(await arrive()).toBe("duplicate");
    expect(await rows()).toEqual([expect.objectContaining({ type: "share_arrival", signedOut: true, source: "share-link", semesterCode: "spring27" })]);
  });

  it("count a students-only listing only through its own valid share slug", async () => {
    await setListingVisibility(db, listingId, admin, true);
    expect(await arrive()).toBe("invalid");
    expect(await arrive({ slug: `${listingId}-0000000000` })).toBe("invalid");
    expect(await arrive({ slug: shareSlug(listingId + 1) })).toBe("invalid");
    expect(await arrive({ slug: shareSlug(listingId) })).toBe("stored");
    await setListingVisibility(db, listingId, admin, false);
    expect(await rows()).toHaveLength(1);
  });

  it("are not taken for a taken or missing listing, even with a valid slug", async () => {
    await db.update(s.listings).set({ status: "taken" }).where(eq(s.listings.id, listingId));
    expect(await arrive({ slug: shareSlug(listingId) })).toBe("invalid");
    await db.update(s.listings).set({ status: "open" }).where(eq(s.listings.id, listingId));
    expect(await arrive({ listingId: 999_999, slug: shareSlug(999_999) })).toBe("invalid");
    expect(await rows()).toHaveLength(0);
  });

  it("hit the per-visitor limit before looking at the listing, so being limited says nothing about it", async () => {
    await db.insert(s.listingEvents).values(
      Array.from({ length: 60 }, (_, i) => ({ listingId, actorKey: anonymousActorKey(IP, UA), type: "share_target", signedOut: true, dedupeKey: `x${i}` })),
    );
    expect(await arrive({ listingId: 999_999 })).toBe("limited");
    expect(await arrive()).toBe("limited");
    expect(await recordAnonymousView(db, { listingId: 999_999, ip: IP, userAgent: UA })).toBe("limited");
  });
});
