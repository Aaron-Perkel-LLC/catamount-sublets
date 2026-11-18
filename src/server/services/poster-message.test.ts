import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ACCESS, SITE } from "@/config/site";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { containsLink, LINK_REFUSAL } from "@/lib/poster-message";
import { setListingVisibility } from "@/server/data/my-listing";
import { setListingSemesters } from "@/server/data/semesters";
import { setSetting } from "@/server/data/settings";
import { sentInTests } from "@/server/email/send";
import { RATE_LIMITS } from "@/server/rate-limit";
import { setOutsideMessagesFor } from "./listing";
import { relayStatusFor, sendPosterMessage } from "./poster-message";

let db: Db;
let close: () => Promise<void>;
const admin = { userId: "", isAdmin: true };
const posters: { id: string; email: string; listingId: number }[] = [];
let community: { id: string; email: string; role: "user"; tier: "community" };
let student: { id: string; email: string; role: "user"; tier: "student" };
let seq = 0;

const body = "Hi! I start a job downtown in January. Is the room still free, and could I see it next week? My number is 802-555-0199.";
const msg = (listingId: number, extra: Record<string, unknown> = {}) => ({ listingId, body, idempotencyKey: crypto.randomUUID(), ...extra });

async function mkUser(email: string, tier: "student" | "community", names = true) {
  const [u] = await db
    .insert(s.user)
    .values({ email, name: email.split("@")[0], tier, ...(names ? { firstName: "Robin", lastName: "Lee" } : {}) })
    .returning({ id: s.user.id });
  return u.id;
}

async function mkListing(contactEmail: string | null = null) {
  const n = ++seq;
  const email = `poster${n}@uvm.edu`;
  const id = await mkUser(email, "student");
  const [l] = await db
    .insert(s.listings)
    .values({ userId: id, price: 850, address: `${n} Secret Street, Burlington`, lat: 44.4778 + n / 1000, lon: -73.1965, contactEmail })
    .returning({ id: s.listings.id });
  await setListingSemesters(db, l.id, [{ code: "spring27", position: 0 }]);
  await db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: `s${n}`.padEnd(32, "x"), displayUrl: "d", thumbUrl: "t", cardUrl: "c", sha256: "0".repeat(64) });
  await setListingVisibility(db, l.id, admin, false);
  posters.push({ id, email, listingId: l.id });
  return { id, email, listingId: l.id };
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", active: true });
  community = { id: await mkUser("robin@gmail.com", "community"), email: "robin@gmail.com", role: "user", tier: "community" };
  student = { id: await mkUser("jdoe@uvm.edu", "student"), email: "jdoe@uvm.edu", role: "user", tier: "student" };
});
afterAll(() => close());
beforeEach(async () => {
  sentInTests.length = 0;
  await db.delete(s.rateLimitBuckets);
});

describe("the message relay", () => {
  it("emails the poster from the updates subdomain, Reply-To the sender, labelled and with the scam warning, and stores it", async () => {
    const p = await mkListing("contact@example.org");
    expect(await relayStatusFor(db, community, p.listingId)).toBe("open");
    expect(await sendPosterMessage(db, community, msg(p.listingId))).toEqual({ ok: true, duplicate: false });
    expect(sentInTests).toHaveLength(1);
    const m = sentInTests[0];
    expect(m.kind).toBe("poster_message");
    expect(m.from).toBe(SITE.mailFromMessages);
    expect(m.from).not.toBe(SITE.mailFrom); // never login@, which sends sign-in codes
    expect(m.to).toBe("contact@example.org"); // the listing's contact email, which the sender never sees
    expect(m.replyTo).toBe("robin@gmail.com");
    expect(m.subject).toContain(`from someone ${ACCESS.outside}`);
    expect(m.text).toContain(`From someone ${ACCESS.outside}`);
    expect(m.text).toContain("Robin Lee (robin@gmail.com)");
    expect(m.text).toContain("$850/mo · Spring 2027");
    expect(m.text).toContain("Never send money");
    expect(m.text).not.toContain("Secret Street");
    expect(m.html).not.toContain("Secret Street");
    const [row] = await db.select().from(s.posterMessages).where(eq(s.posterMessages.listingId, p.listingId));
    expect(row).toMatchObject({ senderId: community.id, posterId: p.id, status: "sent", body });
  });

  it("is for community accounts only: a student is told to use the contact panel", async () => {
    const p = await mkListing();
    expect(await sendPosterMessage(db, student, msg(p.listingId))).toMatchObject({ ok: false });
    expect(await relayStatusFor(db, student, p.listingId)).toBe("not_found");
    expect(sentInTests).toHaveLength(0);
  });

  it("refuses links, too-short and too-long messages, before anything is stored", async () => {
    const p = await mkListing();
    expect(await sendPosterMessage(db, community, msg(p.listingId, { body: "See https://evil.example/pay for details, thanks!" }))).toMatchObject({ ok: false, error: LINK_REFUSAL });
    expect(await sendPosterMessage(db, community, msg(p.listingId, { body: "Deposit here: bit.ly/abc123 asap please" }))).toMatchObject({ ok: false, error: LINK_REFUSAL });
    expect(await sendPosterMessage(db, community, msg(p.listingId, { body: "hi" }))).toMatchObject({ ok: false });
    expect(await sendPosterMessage(db, community, msg(p.listingId, { body: "x".repeat(1501) }))).toMatchObject({ ok: false });
    expect(sentInTests).toHaveLength(0);
    expect(await db.select().from(s.posterMessages).where(eq(s.posterMessages.listingId, p.listingId))).toHaveLength(0);
  });

  it("goes nowhere when the poster turned it off, or asked for no email; the toggle is the poster's", async () => {
    const p = await mkListing();
    const poster = { id: p.id, email: p.email, role: "user" as const, tier: "student" as const };
    expect(await setOutsideMessagesFor(db, poster, false)).toEqual({ ok: true });
    expect(await relayStatusFor(db, community, p.listingId)).toBe("not_accepting");
    expect(await sendPosterMessage(db, community, msg(p.listingId))).toMatchObject({ ok: false, error: expect.stringContaining("isn't accepting") });
    expect(await setOutsideMessagesFor(db, poster, true)).toEqual({ ok: true });
    expect(await relayStatusFor(db, community, p.listingId)).toBe("open");
    // A community account can't flip anyone's switch (it has no listing, and the service refuses it outright).
    expect(await setOutsideMessagesFor(db, community, false)).toMatchObject({ ok: false });

    await db.update(s.user).set({ noEmail: true }).where(eq(s.user.id, p.id));
    expect(await relayStatusFor(db, community, p.listingId)).toBe("not_accepting");
    expect(sentInTests).toHaveLength(0);
  });

  it("says nothing about a listing a community account can't see: kept to students, paused, or missing", async () => {
    const p = await mkListing();
    await setListingVisibility(db, p.listingId, admin, true);
    expect(await relayStatusFor(db, community, p.listingId)).toBe("not_found");
    expect(await sendPosterMessage(db, community, msg(p.listingId))).toMatchObject({ ok: false, error: "That listing isn't up any more." });
    await setListingVisibility(db, p.listingId, admin, false);
    await db.update(s.listings).set({ status: "paused" }).where(eq(s.listings.id, p.listingId));
    expect(await relayStatusFor(db, community, p.listingId)).toBe("not_found");
    expect(await relayStatusFor(db, community, 999_999)).toBe("not_found");
    expect(sentInTests).toHaveLength(0);
  });

  it("is one email per form, however often it is pressed", async () => {
    const p = await mkListing();
    const once = msg(p.listingId);
    expect(await sendPosterMessage(db, community, once)).toEqual({ ok: true, duplicate: false });
    expect(await sendPosterMessage(db, community, once)).toEqual({ ok: true, duplicate: true });
    expect(sentInTests).toHaveLength(1);
  });

  it("allows one message per sender per listing a day", async () => {
    const p = await mkListing();
    expect((await sendPosterMessage(db, community, msg(p.listingId))).ok).toBe(true);
    expect(await sendPosterMessage(db, community, msg(p.listingId))).toMatchObject({ ok: false, error: expect.stringContaining("already messaged") });
    expect(sentInTests).toHaveLength(1);
    // The refused one left no row behind.
    expect(await db.select().from(s.posterMessages).where(eq(s.posterMessages.listingId, p.listingId))).toHaveLength(1);
  });

  it(`allows ${RATE_LIMITS.posterMessagePerSender.limit} messages per sender a day, to anyone`, async () => {
    const targets = await Promise.all(Array.from({ length: RATE_LIMITS.posterMessagePerSender.limit + 1 }, () => mkListing()));
    for (const t of targets.slice(0, -1)) expect((await sendPosterMessage(db, community, msg(t.listingId))).ok).toBe(true);
    expect(await sendPosterMessage(db, community, msg(targets.at(-1)!.listingId))).toMatchObject({ ok: false, error: expect.stringContaining("messages today") });
    expect(sentInTests).toHaveLength(RATE_LIMITS.posterMessagePerSender.limit);
  });

  it(`allows ${RATE_LIMITS.posterMessagePerListing.limit} messages per listing a day, from everyone together`, async () => {
    const p = await mkListing();
    const senders = await Promise.all(
      Array.from({ length: RATE_LIMITS.posterMessagePerListing.limit + 1 }, async (_, i) => {
        const email = `sender${i}@example.org`;
        return { id: await mkUser(email, "community"), email, role: "user" as const, tier: "community" as const };
      }),
    );
    for (const who of senders.slice(0, -1)) expect((await sendPosterMessage(db, who, msg(p.listingId))).ok).toBe(true);
    expect(await sendPosterMessage(db, senders.at(-1)!, msg(p.listingId))).toMatchObject({ ok: false, error: expect.stringContaining("a lot of messages") });
  });

  it("needs the sender's name on file, and honours the read-only switch", async () => {
    const p = await mkListing();
    const nameless = { id: await mkUser("nameless@example.org", "community", false), email: "nameless@example.org", role: "user" as const, tier: "community" as const };
    expect(await sendPosterMessage(db, nameless, msg(p.listingId))).toMatchObject({ ok: false, error: expect.stringContaining("name") });
    await setSetting(db, "read_only", { active: true, message: "" }, null);
    try {
      expect((await sendPosterMessage(db, community, msg(p.listingId))).ok).toBe(false);
    } finally {
      await setSetting(db, "read_only", { active: false, message: "" }, null);
    }
    expect(sentInTests).toHaveLength(0);
  });
});

describe("containsLink", () => {
  it.each(["https://x.co", "see http://a.b/c", "www.example.com", "pay at venmo.com/me", "bit.ly/abc", "example.org.", "ftp://files.example"])("finds %s", (text) => {
    expect(containsLink(text)).toBe(true);
  });
  it.each(["write to me at robin@gmail.com", "call 802-555-0199", "St. John here", "I'm free Jan.15 to May", "U.S. citizen, 3.5 GPA"])("lets %s through", (text) => {
    expect(containsLink(text)).toBe(false);
  });
});
