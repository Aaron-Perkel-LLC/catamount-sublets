import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendMailArgs, SendMailResult } from "@/server/email/send";

/**
 * The weekly digest against a real (PGlite) Postgres with the real
 * migrations: matching parity with Browse, own-listing and visibility
 * exclusions, the window, who is skipped, idempotency under doubled and
 * overlapping runs, failures after the claim, the clock, and unsubscribe.
 */

// sendMail stays real (it collects into sentInTests under vitest) but can be made to fail once.
const h = vi.hoisted(() => ({ failNext: 0 }));
vi.mock("@/server/email/send", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/email/send")>();
  return {
    ...real,
    sendMail: vi.fn(async (args: SendMailArgs): Promise<SendMailResult> => {
      if (h.failNext > 0) {
        h.failNext--;
        return { ok: false, error: "Resend refused it (test)." };
      }
      return real.sendMail(args);
    }),
  };
});

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { and, eq } = await import("drizzle-orm");
const { SITE, DIGEST } = await import("@/config/site");
const { parseListingQuery, parseSavedQuery, canonicalFilterQuery } = await import("@/lib/listing-filters");
const { browseListings, newBoardListings } = await import("@/server/data/listings");
const { sentInTests, sendMail } = await import("@/server/email/send");
const { setSetting } = await import("@/server/data/settings");
const { setDigestEnabled, digestSubscriptionFor, savedSearchesFor } = await import("@/server/data/digest");
const { signDigestUnsubscribe } = await import("@/server/digest-token");
const digest = await import("./digest");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

// Monday 23 Nov 2026, 08:05 Eastern (EST, UTC−5): the digest's hour.
const NOW = new Date("2026-11-23T13:05:00Z");
const WEEK = "2026-11-23";
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const hours = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

let seq = 0;
async function person(key: string, opts: { banned?: boolean; noEmail?: boolean; email?: string } = {}): Promise<string> {
  const email = opts.email ?? `${key}@uvm.edu`;
  const [u] = await db.insert(s.user).values({ email, name: key, firstName: key, lastName: "Doe", banned: opts.banned ?? false, noEmail: opts.noEmail ?? false }).returning({ id: s.user.id });
  return u.id;
}

async function listing(userId: string, v: Partial<typeof s.listings.$inferInsert> & { postedAt: Date }, sems = ["spring27"], photo = true): Promise<number> {
  const [l] = await db
    .insert(s.listings)
    .values({ userId, price: 800, address: "52 North Willard Street, Burlington, Vermont, United States", lat: 44.4778, lon: -73.1965, ...v })
    .returning({ id: s.listings.id });
  await db.insert(s.listingSemesters).values(sems.map((semesterCode, position) => ({ listingId: l.id, semesterCode, position })));
  if (photo) {
    seq++;
    await db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: `${seq}`.padStart(32, "0"), displayUrl: "d", thumbUrl: `https://media.example/thumb-${l.id}.jpg`, cardUrl: "c", sha256: "0".repeat(64) });
  }
  return l.id;
}

async function search(userId: string, name: string, query: string) {
  await db.insert(s.savedSearches).values({ userId, name, query: canonicalFilterQuery(query) });
}

async function subscribe(userId: string, enabledAt: Date) {
  await db.insert(s.digestSubscriptions).values({ userId, enabled: true, enabledAt });
}

async function sendRow(userId: string, week = WEEK) {
  const [row] = await db.select().from(s.digestSends).where(and(eq(s.digestSends.userId, userId), eq(s.digestSends.week, week)));
  return row;
}

const run = (now = NOW, opts: Parameters<typeof digest.runDigest>[2] = {}) => digest.runDigest(db, now, { pauseMs: 0, ...opts });
const mailTo = (email: string) => sentInTests.filter((m) => m.to === email && m.kind === "digest");


beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  sentInTests.length = 0;
  h.failNext = 0;
  vi.stubEnv("MAILING_ADDRESS", "PO Box 1, Burlington, VT 05402");
  await db.delete(s.digestSends);
  await db.delete(s.digestSubscriptions);
  await db.delete(s.savedSearches);
  await db.delete(s.listings);
  await db.delete(s.user);
  await db.delete(s.semesters);
  await db.delete(s.siteSettings);
  await db.delete(s.rateLimitBuckets);
  await db.insert(s.semesters).values([
    { code: "spring27", name: "Spring 2027", active: true },
    { code: "summer27", name: "Summer 2027", active: true },
    { code: "fall26", name: "Fall 2026", active: false },
  ]);
  await setSetting(db, "digest", { enabled: true }, null);
});

/* ------------------------------------------------------------------ parity */

describe("matching uses Browse's query", () => {
  let me: string;
  const ids: Record<string, number> = {};

  beforeEach(async () => {
    me = await person("me");
    const others = await Promise.all(["a", "b", "c", "d", "e", "f", "g"].map((k) => person(k)));
    const banned = await person("banned", { banned: true });
    ids.cheapNear = await listing(others[0], { price: 650, amenityPetsAllowed: true, roommatePreference: "women", postedAt: days(1) });
    ids.downtown = await listing(others[1], { price: 1250, lat: 44.4759, lon: -73.2121, priceNegotiable: true, amenityPaidParking: true, postedAt: days(2) }, ["summer27"]);
    ids.winooski = await listing(others[2], { price: 950, lat: 44.4906, lon: -73.1853, amenityFurnished: true, roommatePreference: "men", postedAt: days(3) });
    ids.far = await listing(others[3], { price: 700, lat: 44.55, lon: -73.3, amenityLaundryFree: true, postedAt: days(4) });
    ids.paused = await listing(others[4], { status: "paused", postedAt: days(1) });
    ids.taken = await listing(others[5], { status: "taken", postedAt: days(1) });
    ids.expired = await listing(others[6], { postedAt: days(1) }, ["fall26"]);
    ids.noPhoto = await listing(await person("h"), { postedAt: days(1) }, ["spring27"], false);
    ids.banned = await listing(banned, { postedAt: days(1) });
    ids.mine = await listing(me, { price: 600, postedAt: days(1) });
    ids.old = await listing(await person("i"), { price: 600, postedAt: days(30) });
    // Several rooms: a whole house typed as its $3,200 total ($800 a room), three of five rooms per room, and a studio.
    ids.house = await listing(await person("j"), { price: 3200, priceBasis: "total", roomsAvailable: 4, bedrooms: 4, roommates: 0, postedAt: days(2) });
    ids.rooms3 = await listing(await person("k"), { price: 750, roomsAvailable: 3, bedrooms: 5, roommates: 1, postedAt: days(5) });
    ids.studio = await listing(await person("l"), { price: 1000, bedrooms: 0, roommates: 0, postedAt: days(3) });
  });

  const QUERIES = [
    "",
    "semester=spring27",
    "semester=summer27",
    "min_price=0&max_price=900",
    "min_price=900&max_price=2000",
    "max_distance=1",
    "max_distance=0.3",
    "amenities=pets",
    "amenities=parking&amenities=laundry",
    "amenities=furnished",
    "negotiable=1",
    "open_to=women",
    "open_to=men",
    "semester=spring27&min_price=0&max_price=1000&amenities=pets&open_to=women",
    "semester=nope",
    "min_price=0&max_price=850",
    "min_price=3000&max_price=4000",
    "rooms=2",
    "rooms=3",
    "rooms=4",
    "no_roommates=1",
    "min_price=0&max_price=900&rooms=2&no_roommates=1",
  ];

  it.each(QUERIES)("finds exactly Browse's listings for %j, inside the window, less the recipient's own", async (query) => {
    const q = parseSavedQuery(canonicalFilterQuery(query));
    const since = days(7);
    const browse = await browseListings(db, q, me);
    const expected = browse.listings
      .filter((l) => new Date(l.postedAt) > since && new Date(l.postedAt) <= NOW && l.id !== ids.mine)
      .map((l) => l.id);
    const found = (await newBoardListings(db, q, { recipientId: me, since, until: NOW })).map((l) => l.id);
    expect(found).toEqual(expected);
  });

  it("matches a whole house by its per-room price, never its total", async () => {
    const window = { recipientId: me, since: days(7), until: NOW };
    expect((await newBoardListings(db, parseSavedQuery("min_price=0&max_price=850"), window)).map((l) => l.id)).toContain(ids.house);
    expect((await newBoardListings(db, parseSavedQuery("min_price=3000&max_price=4000"), window)).map((l) => l.id)).not.toContain(ids.house);
  });

  it("never includes the recipient's own listing, though Browse shows it to them", async () => {
    const q = parseListingQuery({});
    expect((await browseListings(db, q, me)).listings.map((l) => l.id)).toContain(ids.mine);
    expect((await newBoardListings(db, q, { recipientId: me, since: days(7), until: NOW })).map((l) => l.id)).not.toContain(ids.mine);
  });

  it("leaves out what Browse leaves out: paused, taken, expired, photo-less, and a banned poster's listing", async () => {
    const browse = (await browseListings(db, parseListingQuery({}), me)).listings.map((l) => l.id);
    const found = (await newBoardListings(db, parseListingQuery({}), { recipientId: me, since: days(7), until: NOW })).map((l) => l.id);
    for (const k of ["paused", "taken", "expired", "noPhoto", "banned"]) {
      expect(browse).not.toContain(ids[k]);
      expect(found).not.toContain(ids[k]);
    }
    expect(found).toEqual(expect.arrayContaining([ids.cheapNear, ids.downtown, ids.winooski, ids.far]));
    expect(found).not.toContain(ids.old);
  });

  it("puts a banned poster's listing back when they are unbanned", async () => {
    await db.update(s.user).set({ banned: false }).where(eq(s.user.email, "banned@uvm.edu"));
    expect((await browseListings(db, parseListingQuery({}), me)).listings.map((l) => l.id)).toContain(ids.banned);
  });
});

/* -------------------------------------------------------------- the clock */

describe("digestClock", () => {
  it("acts at the digest hour Eastern in winter (EST) and summer (EDT)", () => {
    expect(digest.digestClock(new Date("2026-11-23T13:00:00Z"))).toEqual({ act: true, week: "2026-11-23", catchUp: false });
    expect(digest.digestClock(new Date("2026-11-23T12:59:00Z"))).toMatchObject({ act: false, reason: "before_the_hour" });
    expect(digest.digestClock(new Date("2027-07-05T12:00:00Z"))).toEqual({ act: true, week: "2027-07-05", catchUp: false });
    expect(digest.digestClock(new Date("2027-07-05T11:59:00Z"))).toMatchObject({ act: false });
  });

  it("keeps acting through the catch-up hours, then stops", () => {
    expect(digest.digestClock(new Date("2026-11-23T14:30:00Z"))).toEqual({ act: true, week: WEEK, catchUp: true });
    expect(digest.digestClock(new Date(`2026-11-23T${String(13 + DIGEST.catchUpHours).padStart(2, "0")}:59:00Z`))).toMatchObject({ act: true });
    expect(digest.digestClock(new Date(`2026-11-23T${String(14 + DIGEST.catchUpHours).padStart(2, "0")}:00:00Z`))).toMatchObject({ act: false, reason: "after_catch_up" });
  });

  it("does nothing on another day, including the UTC Monday that is still Sunday in Burlington", () => {
    expect(digest.digestClock(new Date("2026-11-24T13:05:00Z"))).toMatchObject({ act: false, reason: "not_the_day" });
    expect(digest.digestClock(new Date("2026-11-23T03:00:00Z"))).toMatchObject({ act: false, reason: "not_the_day" });
  });
});

describe("digestWindow", () => {
  it("starts at opt-in for a first digest, at most 7 days back", () => {
    expect(DIGEST.firstWindowDays).toBe(7);
    expect(digest.digestWindow(NOW, { enabledAt: days(2), lastWindowEnd: null }).since).toEqual(days(2));
    expect(digest.digestWindow(NOW, { enabledAt: days(30), lastWindowEnd: null }).since).toEqual(days(7));
  });

  it("starts where the last one ended (a missed week included), never more than the longer cap back", () => {
    expect(digest.digestWindow(NOW, { enabledAt: days(30), lastWindowEnd: days(7) }).since).toEqual(days(7));
    expect(digest.digestWindow(NOW, { enabledAt: days(30), lastWindowEnd: days(14) }).since).toEqual(days(14));
    expect(digest.digestWindow(NOW, { enabledAt: days(60), lastWindowEnd: days(40) }).since).toEqual(days(DIGEST.maxWindowDays));
    expect(digest.digestWindow(NOW, { enabledAt: days(30), lastWindowEnd: days(7) }).until).toEqual(NOW);
  });

  it("starts afresh after the person turns it off and on again", () => {
    expect(digest.digestWindow(NOW, { enabledAt: days(1), lastWindowEnd: days(7) }).since).toEqual(days(1));
  });
});

/* ---------------------------------------------------------------- the run */

describe("runDigest", () => {
  let me: string;
  let poster: string;

  beforeEach(async () => {
    me = await person("me");
    poster = await person("poster");
    await subscribe(me, days(14));
    await search(me, "Spring under $900", "semester=spring27&min_price=0&max_price=900");
    await search(me, "Pets", "amenities=pets");
  });

  it("does nothing while the switch is off, outside the hour, while blocked, or read-only", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    await setSetting(db, "digest", { enabled: false }, null);
    expect(await run()).toMatchObject({ acted: false, reason: "switched_off" });
    await setSetting(db, "digest", { enabled: true }, null);
    expect(await run(new Date("2026-11-24T13:05:00Z"))).toMatchObject({ acted: false, reason: "not_the_day" });
    vi.stubEnv("MAILING_ADDRESS", "");
    expect(await run()).toMatchObject({ acted: false, reason: "blocked" });
    vi.stubEnv("MAILING_ADDRESS", "PO Box 1");
    await setSetting(db, "read_only", { active: true, message: "" }, null);
    expect(await run()).toMatchObject({ acted: false, reason: "read_only" });
    expect(sentInTests).toHaveLength(0);
    expect(await db.select().from(s.digestSends)).toHaveLength(0);
  });

  /** A real-sending deployment: off console mode, so a missed guard would reach sendMail (the mock counts it). */
  function onVercel(env: "production" | "preview", vars: Record<string, string>) {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", env);
    vi.stubEnv("CRON_SECRET", "x".repeat(16));
    vi.stubEnv("RESEND_API_KEY", "re_root");
    vi.stubEnv("RESEND_DIGEST_API_KEY", "");
    vi.stubEnv("MAILING_ADDRESS", "PO Box 1, Burlington, VT 05402");
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  }

  async function quietRun(): Promise<{ summary: Awaited<ReturnType<typeof run>>; warned: string }> {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls = vi.mocked(sendMail).mock.calls.length;
    try {
      const summary = await run();
      expect(vi.mocked(sendMail).mock.calls.length).toBe(calls);
      return { summary, warned: warn.mock.calls.map((c) => String(c[0])).join("\n") };
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  }

  it("skips with a warning, sending nothing and never falling back to the root key, while the digest key or the address is missing", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    await setSetting(db, "digest", { enabled: true }, null);

    onVercel("production", {});
    let r = await quietRun();
    expect(r.summary).toMatchObject({ acted: false, reason: "blocked" });
    expect(r.warned).toContain('"event":"digest.blocked"');
    expect(r.warned).toContain("RESEND_DIGEST_API_KEY");

    onVercel("production", { RESEND_DIGEST_API_KEY: "re_updates", MAILING_ADDRESS: "" });
    r = await quietRun();
    expect(r.summary).toMatchObject({ acted: false, reason: "blocked" });
    expect(r.warned).toContain("MAILING_ADDRESS");
    expect(r.warned).not.toContain("RESEND_DIGEST_API_KEY");

    expect(await db.select().from(s.digestSends)).toHaveLength(0);
  });

  it("never runs the full send from a preview, even with every key set and the switch on", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    await setSetting(db, "digest", { enabled: true }, null);
    onVercel("preview", { RESEND_DIGEST_API_KEY: "re_updates" });
    const r = await quietRun();
    expect(r.summary).toMatchObject({ acted: false, reason: "not_production" });
    expect(r.warned).toContain('"event":"digest.not_production"');
    expect(await db.select().from(s.digestSends)).toHaveLength(0);
  });

  it("shows a whole house by its per-room price, with the size chip and the total", async () => {
    const house = await listing(poster, { price: 3200, priceBasis: "total", roomsAvailable: 4, bedrooms: 4, roommates: 0, postedAt: hours(4) });
    const r = await run();
    expect(r).toMatchObject({ sent: 1 });
    const [m] = mailTo("me@uvm.edu");
    expect(m.text).toContain(`/s/${house}-`);
    expect(m.text).toContain("$800/room · Spring 2027");
    expect(m.text).toContain("Whole place · 4 BR · $3,200 total · 4 bd · No roommates");
    expect(m.text).toContain("Matches: Spring under $900");
  });

  it("sends one email merging every search, newest first, with only share-card lines", async () => {
    const pets = await listing(poster, { price: 1100, amenityPetsAllowed: true, postedAt: hours(30) }, ["summer27"]);
    const both = await listing(await person("p2"), { price: 700, amenityPetsAllowed: true, bedrooms: 2, bathrooms: 1, postedAt: hours(5) });
    await listing(await person("p3"), { price: 1500, postedAt: hours(3) }); // matches neither search
    const r = await run();
    expect(r).toMatchObject({ acted: true, week: WEEK, sent: 1, empty: 0, failed: 0 });
    const [m] = mailTo("me@uvm.edu");
    expect(m.subject).toBe("2 new sublets matching your searches");
    expect(m.from).toBe(SITE.mailFromDigest);
    expect(m.replyTo).toBe(SITE.mailReplyTo);
    expect(m.idempotencyKey).toBe(`digest/${me}/${WEEK}`);
    expect(m.text.indexOf(`/s/${both}-`)).toBeLessThan(m.text.indexOf(`/s/${pets}-`));
    expect(m.text).toContain("$700/mo · Spring 2027");
    expect(m.text).toContain("2 bd · 1 ba");
    expect(m.text).toContain("Matches: Spring under $900, Pets");
    // No address, no poster name, no image unless the flag is on.
    for (const part of [m.text, m.html]) {
      expect(part).not.toMatch(/Willard/i);
      expect(part).not.toMatch(/poster|p2@|Doe/);
    }
    expect(m.html).not.toContain("<img");
    expect(m.text.split("\n")).toContain(`${SITE.name}, PO Box 1, Burlington, VT 05402`);
    const row = await sendRow(me);
    expect(row).toMatchObject({ status: "sent", searches: 2, matches: 2, resendId: "test" });
  });

  it("carries RFC 8058 one-click unsubscribe headers and a visible link, both the recipient's own", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    await run();
    const [m] = mailTo("me@uvm.edu");
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const header = m.headers["List-Unsubscribe"];
    expect(header).toMatch(/^<https?:\/\/[^>]+\/api\/digest\/unsubscribe\?t=[^>]+>, <mailto:/);
    const token = decodeURIComponent(/\?t=([^>]+)>/.exec(header)![1]);
    expect(token.startsWith(`${me}.`)).toBe(true);
    expect(m.text).toMatch(new RegExp(`Unsubscribe: \\S+/unsubscribe\\?t=${me}`));
  });

  it("covers only what was posted since opt-in, at most the cap back", async () => {
    await db.update(s.digestSubscriptions).set({ enabledAt: hours(10) }).where(eq(s.digestSubscriptions.userId, me));
    await listing(poster, { price: 700, postedAt: hours(11) }); // before opt-in
    const fresh = await listing(await person("p2"), { price: 700, postedAt: hours(9) });
    await run();
    const [m] = mailTo("me@uvm.edu");
    expect(m.subject).toBe("1 new sublet matching your searches");
    expect(m.text).toContain(`/s/${fresh}-`);
    const row = await sendRow(me);
    expect(row.windowStart).toEqual(hours(10));
    expect(row.windowEnd).toEqual(NOW);
  });

  it("sends nothing and records `empty` when nothing new matches", async () => {
    await listing(poster, { price: 5000, postedAt: hours(5) });
    const r = await run();
    expect(r).toMatchObject({ sent: 0, empty: 1 });
    expect(sentInTests).toHaveLength(0);
    expect(await sendRow(me)).toMatchObject({ status: "empty", searches: 2, matches: 0 });
  });

  it("never sends twice for a week: a repeat run, a catch-up run, and two runs at once", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    await run();
    expect(await run()).toMatchObject({ sent: 0, done: 1 });
    expect(await run(new Date("2026-11-23T15:10:00Z"))).toMatchObject({ sent: 0, done: 1 });
    expect(mailTo("me@uvm.edu")).toHaveLength(1);

    // Two firings racing for a fresh week.
    const next = new Date("2026-11-30T13:00:30Z");
    await listing(await person("p2"), { price: 700, postedAt: new Date("2026-11-27T12:00:00Z") });
    const [a, b] = await Promise.all([run(next), run(next)]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.done + b.done).toBe(1);
    expect(mailTo("me@uvm.edu")).toHaveLength(2);
    expect(await db.select().from(s.digestSends).where(eq(s.digestSends.userId, me))).toHaveLength(2);
  });

  it("starts the next week where the last one ended, so nothing repeats", async () => {
    const first = await listing(poster, { price: 700, postedAt: hours(5) });
    await run();
    const second = await listing(await person("p2"), { price: 700, postedAt: new Date("2026-11-25T12:00:00Z") });
    await run(new Date("2026-11-30T13:05:00Z"));
    const [, m] = mailTo("me@uvm.edu");
    expect(m.text).toContain(`/s/${second}-`);
    expect(m.text).not.toContain(`/s/${first}-`);
    expect((await sendRow(me, "2026-11-30")).windowStart).toEqual(NOW);
  });

  it("skips banned, Stop-email and test-address recipients and people with no searches, writing no row", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    for (const [key, opts] of [
      ["banned", { banned: true }],
      ["quiet", { noEmail: true }],
      ["seed1", {}],
    ] as const) {
      const id = await person(key, opts);
      await subscribe(id, days(3));
      await search(id, "All", "");
    }
    await subscribe(await person("nosearch"), days(3));
    const r = await run();
    expect(r.skipped).toEqual({ banned: 1, stop_email: 1, test_address: 1, no_searches: 1 });
    expect(r.sent).toBe(1);
    expect(sentInTests.map((m) => m.to)).toEqual(["me@uvm.edu"]);
    expect(await db.select().from(s.digestSends)).toHaveLength(1);
  });

  it("leaves out people who turned it off and accounts that were deleted", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    const gone = await person("gone2");
    await subscribe(gone, days(3));
    await search(gone, "All", "");
    await db.delete(s.user).where(eq(s.user.id, gone));
    await setDigestEnabled(db, me, false, "account");
    const r = await run();
    expect(r).toMatchObject({ sent: 0, empty: 0 });
    expect(sentInTests).toHaveLength(0);
  });

  it("settles a refused send as failed, does not retry it that week, and rolls its listings into the next", async () => {
    // A delivered week before, so the failed week isn't the first digest.
    await db.insert(s.digestSends).values({ userId: me, week: "2026-11-16", status: "empty", windowStart: days(14), windowEnd: days(7) });
    const missed = await listing(poster, { price: 700, postedAt: days(6) });
    h.failNext = 1;
    expect(await run()).toMatchObject({ failed: 1, sent: 0 });
    expect(await sendRow(me)).toMatchObject({ status: "failed", error: "Resend refused it (test)." });
    expect(await run(new Date("2026-11-23T14:05:00Z"))).toMatchObject({ sent: 0, done: 1 });
    expect(sentInTests).toHaveLength(0);
    // Next week, within the 7-day cap, the missed listing comes along.
    await run(new Date("2026-11-30T13:05:00Z"));
    expect(mailTo("me@uvm.edu")[0].text).toContain(`/s/${missed}-`);
  });

  it("takes over a send left pending by a run that died, under the same key, but not a fresh one", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    await db.insert(s.digestSends).values({ userId: me, week: WEEK, windowStart: days(7), windowEnd: NOW, attemptedAt: new Date() });
    expect(await run(new Date("2026-11-23T14:05:00Z"))).toMatchObject({ retaken: 0, done: 1, sent: 0 });

    await db.update(s.digestSends).set({ attemptedAt: new Date(Date.now() - digest.STALE_PENDING_MS - 60_000) });
    expect(await run(new Date("2026-11-23T14:05:00Z"))).toMatchObject({ retaken: 1, sent: 1 });
    const [m] = mailTo("me@uvm.edu");
    expect(m.idempotencyKey).toBe(`digest/${me}/${WEEK}`);
    expect(await sendRow(me)).toMatchObject({ status: "sent", windowStart: days(7), windowEnd: NOW });
  });

  it("stops claiming people when its time is up and leaves them for the catch-up run", async () => {
    await listing(poster, { price: 700, postedAt: hours(5) });
    const r = await run(NOW, { elapsed: () => digest.RUN_BUDGET_MS + 1 });
    expect(r).toMatchObject({ deferred: 1, sent: 0 });
    expect(await db.select().from(s.digestSends)).toHaveLength(0);
    expect(await run(new Date("2026-11-23T14:05:00Z"))).toMatchObject({ sent: 1 });
  });
});

/* ------------------------------------------------------- saved searches */

describe("saved searches", () => {
  let me: string;
  beforeEach(async () => {
    me = await person("me");
  });

  it("stores Browse's own query string, canonical, and refuses a duplicate", async () => {
    const r = await digest.saveSearch(db, me, { query: "amenities=pets&amenities=ac&sort=closest&id=4&min_price=900&max_price=100&bogus=1", name: " Pets ", enableDigest: false });
    expect(r.ok).toBe(true);
    const [row] = await savedSearchesFor(db, me);
    expect(row).toMatchObject({ name: "Pets", query: "min_price=100&max_price=900&amenities=ac&amenities=pets" });
    expect(parseSavedQuery(row.query)).toEqual(parseListingQuery({ min_price: "100", max_price: "900", amenities: ["ac", "pets"] }));
    const again = await digest.saveSearch(db, me, { query: "max_price=900&min_price=100&amenities=pets&amenities=ac", name: "Again", enableDigest: false });
    expect(again).toEqual({ ok: false, error: "You've already saved this search." });
  });

  it("turns the email on only when asked in the same press", async () => {
    await digest.saveSearch(db, me, { query: "semester=spring27", name: "Spring", enableDigest: false });
    expect((await digestSubscriptionFor(db, me)).enabled).toBe(false);
    const r = await digest.saveSearch(db, me, { query: "semester=summer27", name: "Summer", enableDigest: true });
    expect(r).toMatchObject({ ok: true, data: { digestOn: true } });
    expect((await digestSubscriptionFor(db, me)).enabled).toBe(true);
  });

  it(`stops at ${DIGEST.maxSavedSearches}`, async () => {
    for (let i = 0; i < DIGEST.maxSavedSearches; i++) expect((await digest.saveSearch(db, me, { query: `max_distance=${i + 1}`, name: `S${i}`, enableDigest: false })).ok).toBe(true);
    const r = await digest.saveSearch(db, me, { query: "max_distance=99", name: "One more", enableDigest: false });
    expect(r.ok).toBe(false);
    expect(await savedSearchesFor(db, me)).toHaveLength(DIGEST.maxSavedSearches);
  });

  it("holds the cap when saves race", async () => {
    for (let i = 0; i < DIGEST.maxSavedSearches - 1; i++) await digest.saveSearch(db, me, { query: `max_distance=${i + 1}`, name: `S${i}`, enableDigest: false });
    const results = await Promise.all([50, 51, 52].map((d) => digest.saveSearch(db, me, { query: `max_distance=${d}`, name: "Race", enableDigest: false })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await savedSearchesFor(db, me)).toHaveLength(DIGEST.maxSavedSearches);
  });

  it("validates input with the shared schema", async () => {
    expect((await digest.saveSearch(db, me, { query: "", name: "", enableDigest: false })).ok).toBe(false);
    expect((await digest.saveSearch(db, me, { query: "", name: "x".repeat(61), enableDigest: false })).ok).toBe(false);
    expect((await digest.saveSearch(db, me, { query: "x".repeat(1001), name: "Long", enableDigest: false })).ok).toBe(false);
    expect((await digest.saveSearch(db, me, { query: "", name: "No flag" })).ok).toBe(false);
  });

  it("renames and deletes only the person's own searches", async () => {
    const other = await person("other");
    const r = await digest.saveSearch(db, other, { query: "", name: "Theirs", enableDigest: false });
    if (!r.ok) throw new Error(r.error);
    expect(await digest.renameSearch(db, me, { id: r.data.id, name: "Mine now" })).toEqual({ ok: false, error: "That search is gone." });
    expect(await digest.deleteSearch(db, me, { id: r.data.id })).toEqual({ ok: false, error: "That search is gone." });
    expect((await savedSearchesFor(db, other))[0].name).toBe("Theirs");
    expect(await digest.renameSearch(db, other, { id: r.data.id, name: "Renamed" })).toEqual({ ok: true, data: undefined });
    expect(await digest.deleteSearch(db, other, { id: r.data.id })).toEqual({ ok: true, data: undefined });
    expect(await savedSearchesFor(db, other)).toHaveLength(0);
  });

  it("keeps the opt-in time while on, and takes a new one after being off", async () => {
    await setDigestEnabled(db, me, true, "account");
    const first = (await digestSubscriptionFor(db, me)).enabledAt!;
    await new Promise((r) => setTimeout(r, 5));
    await setDigestEnabled(db, me, true, "account");
    expect((await digestSubscriptionFor(db, me)).enabledAt).toEqual(first);
    await setDigestEnabled(db, me, false, "account");
    await setDigestEnabled(db, me, true, "account");
    expect((await digestSubscriptionFor(db, me)).enabledAt!.getTime()).toBeGreaterThan(first.getTime());
  });

  it("goes with the account", async () => {
    await digest.saveSearch(db, me, { query: "", name: "All", enableDigest: true });
    await db.delete(s.user).where(eq(s.user.id, me));
    expect(await db.select().from(s.savedSearches)).toHaveLength(0);
    expect(await db.select().from(s.digestSubscriptions)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------ unsubscribe */

describe("unsubscribe", () => {
  let me: string;
  beforeEach(async () => {
    me = await person("me");
    await subscribe(me, days(3));
    await search(me, "All", "");
  });

  it("opening the page reads only; the confirm turns the digest off and keeps the searches", async () => {
    const t = signDigestUnsubscribe(me);
    expect(await digest.unsubscribePageState(db, t)).toEqual({ state: "open", enabled: true });
    expect((await digestSubscriptionFor(db, me)).enabled).toBe(true);
    expect(await digest.unsubscribeWithToken(db, t, "page")).toEqual({ ok: true });
    expect((await digestSubscriptionFor(db, me)).enabled).toBe(false);
    const [sub] = await db.select().from(s.digestSubscriptions).where(eq(s.digestSubscriptions.userId, me));
    expect(sub.disabledVia).toBe("link");
    expect(await savedSearchesFor(db, me)).toHaveLength(1);
    expect(await digest.unsubscribePageState(db, t)).toEqual({ state: "open", enabled: false });
  });

  it("works while the site is read-only", async () => {
    await setSetting(db, "read_only", { active: true, message: "" }, null);
    expect(await digest.unsubscribeWithToken(db, signDigestUnsubscribe(me), "one_click")).toEqual({ ok: true });
    expect((await digestSubscriptionFor(db, me)).enabled).toBe(false);
  });

  it("refuses a bad token and answers the same for an account that is gone", async () => {
    expect(await digest.unsubscribeWithToken(db, "nope", "page")).toEqual({ ok: false });
    expect(await digest.unsubscribePageState(db, "nope")).toEqual({ state: "invalid" });
    expect(await digest.unsubscribeWithToken(db, signDigestUnsubscribe("00000000-0000-4000-8000-000000000000"), "page")).toEqual({ ok: true });
    expect((await digestSubscriptionFor(db, me)).enabled).toBe(true);
  });
});

/* ------------------------------------------------------------- the admin */

describe("admin preview and test", () => {
  let me: string;
  let admin: string;
  beforeEach(async () => {
    me = await person("me");
    admin = await person("admin", { email: "admin@catamountsublets.com" });
    // These read the real clock, not NOW.
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    await subscribe(me, threeDaysAgo);
    await search(me, "All", "");
    await subscribe(await person("quiet", { noEmail: true }), threeDaysAgo);
    await listing(await person("poster"), { price: 700, postedAt: new Date(Date.now() - 3_600_000) });
  });

  it("lists who would get one as counts, never addresses", async () => {
    const o = await digest.digestOverview(db);
    expect(o.rows).toEqual([{ userId: me, ref: me.slice(0, 8), searches: 1, matches: 1, state: "would_send" }]);
    expect(o.skipped).toMatchObject({ stop_email: 1 });
    expect(JSON.stringify(o)).not.toContain("@");
    expect(await db.select().from(s.digestSends)).toHaveLength(0);
  });

  it("is blocked on a deployment that has the root Resend key but not the digest's", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("CRON_SECRET", "x".repeat(16));
    vi.stubEnv("RESEND_API_KEY", "re_root");
    vi.stubEnv("RESEND_DIGEST_API_KEY", "");
    try {
      expect(digest.digestBlockers().join(" ")).toContain("RESEND_DIGEST_API_KEY");
      vi.stubEnv("RESEND_DIGEST_API_KEY", "re_updates");
      expect(digest.digestBlockers().join(" ")).not.toContain("RESEND");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses to turn the switch on while something blocks it", async () => {
    vi.stubEnv("MAILING_ADDRESS", "");
    expect(await digest.setDigestSwitch(db, true, admin)).toMatchObject({ ok: false });
    vi.stubEnv("MAILING_ADDRESS", "PO Box 1");
    expect(await digest.setDigestSwitch(db, true, admin)).toEqual({ ok: true });
  });

  it("sends a test only to the admin, with the admin's own unsubscribe, and records nothing", async () => {
    await setSetting(db, "digest", { enabled: false }, null);
    const r = await digest.sendDigestTest(db, { id: admin, email: "admin@catamountsublets.com" }, me);
    expect(r).toMatchObject({ ok: true, data: { to: "admin@catamountsublets.com", total: 1 } });
    expect(sentInTests.map((m) => m.to)).toEqual(["admin@catamountsublets.com"]);
    const [m] = sentInTests;
    expect(m.subject).toBe(`${digest.DIGEST_TEST_PREFIX}1 new sublet matching your search`);
    expect(m.headers["List-Unsubscribe"]).toContain(`t=${admin}`);
    expect(m.text).not.toContain(me);
    expect(m.idempotencyKey).toBeUndefined();
    expect(await db.select().from(s.digestSends)).toHaveLength(0);
  });
});
