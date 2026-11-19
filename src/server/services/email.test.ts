import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { and, eq, sql } = await import("drizzle-orm");
const { SITE } = await import("@/config/site");
const { sentInTests } = await import("@/server/email/send");
const { createDraft, forgetRecipient, getEmail, listDeliveries, listEmails, repliesForRequests, RETRY_AFTER_MS, saveDraft } = await import("@/server/data/emails");
const { verifyAnnounceUnsubscribe } = await import("@/server/email-token");
const { verifySurveyToken } = await import("@/server/survey-token");
const email = await import("@/server/services/email");
const { setNoEmail, deletePerson } = await import("@/server/services/admin");

/**
 * The admin's email, end to end against a real Postgres (PGlite) with mail
 * collected instead of sent: who an audience comes to, that the check is the
 * email that goes, that Send works once and only on what was checked, that
 * nobody banned or on Stop email is mailed (with the one recorded
 * exception), that a failure is retried without a second copy, and that
 * unsubscribing sets Stop email.
 */
type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
const p: Record<string, string> = {};
let admin: { id: string; email: string };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.semesters).values([
    { code: "fall26", name: "Fall 2026", active: false, sortOrder: 1 },
    { code: "spring27", name: "Spring 2027", sortOrder: 2 },
  ]);
  const add = async (key: string, values: Partial<typeof s.user.$inferInsert> = {}) => {
    const [u] = await db
      .insert(s.user)
      .values({ email: `${key}@uvm.edu`, name: key, firstName: key[0].toUpperCase() + key.slice(1), lastName: "Test", ...values })
      .returning({ id: s.user.id });
    p[key] = u.id;
    return u.id;
  };
  admin = { id: await add("boss", { role: "admin" }), email: "boss@uvm.edu" };
  for (const key of ["priya", "sam", "taylor", "seeker"]) await add(key);
  await add("quiet", { noEmail: true });
  await add("gone", { banned: true });
  // Posters of fall26: priya, sam, quiet (Stop email), gone (banned). taylor posts for spring27. seeker has no listing.
  for (const [who, code] of [["priya", "fall26"], ["sam", "fall26"], ["quiet", "fall26"], ["gone", "fall26"], ["taylor", "spring27"]] as const) {
    const [l] = await db.insert(s.listings).values({ userId: p[who], price: 800, address: `${who} st`, lat: 44.47, lon: -73.2 }).returning({ id: s.listings.id });
    await db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: code, position: 0 });
  }
});
afterAll(() => close());
beforeEach(() => {
  sentInTests.length = 0;
  vi.stubEnv("MAILING_ADDRESS", "PO Box 1, Burlington, VT 05402");
  return () => vi.unstubAllEnvs();
});

const FALL = { kind: "semester", code: "fall26" } as const;
const draft = (audience: Parameters<typeof createDraft>[2]["audience"], more: Partial<Parameters<typeof createDraft>[2]> = {}) => createDraft(db, admin.id, { audience, subject: "Fall listings come down", body: "Hi {name},\n\nThey come down on Friday.", ...more });
const checkFor = async (id: number) => email.checkOf((await getEmail(db, id))!);
const send = async (id: number, input: Partial<import("@/server/services/email").SendInput> = {}) => email.startSend(db, admin.id, id, { check: await checkFor(id), typed: null, sendAnyway: false, ...input });
const go = (id: number) => email.drain(db, id, { pauseMs: 0 });

describe("who an audience comes to", () => {
  it("splits a group into who gets it and who is left out, by reason, one row per address", async () => {
    const r = await email.resolveAudience(db, FALL);
    expect(r.to.map((x) => [x.email, x.name, x.posted])).toEqual([
      ["priya@uvm.edu", "Priya", true],
      ["sam@uvm.edu", "Sam", true],
    ]);
    expect(r.leftOut.map((x) => [x.email, x.reason])).toEqual([
      ["quiet@uvm.edu", "stop_email"],
      ["gone@uvm.edu", "banned"],
    ]);
    const everyone = await email.resolveAudience(db, { kind: "everyone" });
    expect(everyone.to.map((x) => x.email).sort()).toEqual(["boss@uvm.edu", "priya@uvm.edu", "sam@uvm.edu", "seeker@uvm.edu", "taylor@uvm.edu"]);
    expect(everyone.to.find((x) => x.email === "seeker@uvm.edu")?.posted).toBe(false);
    expect((await email.resolveAudience(db, { kind: "people", userIds: [p.sam, p.gone, p.sam] })).to.map((x) => x.email)).toEqual(["sam@uvm.edu"]);
    expect((await email.resolveAudience(db, { kind: "people", userIds: [] })).to).toEqual([]);
    // The board needs a photo; nobody here has one.
    expect((await email.resolveAudience(db, { kind: "board" })).to).toEqual([]);
  });

  it("an address with no account is still one recipient; one with an account brings its name and its flags", async () => {
    expect((await email.resolveAudience(db, { kind: "address", email: "dana@example.org" })).to).toEqual([{ userId: null, email: "dana@example.org", name: null, posted: false, banned: false, stopEmail: false }]);
    expect((await email.resolveAudience(db, { kind: "address", email: "quiet@uvm.edu" })).leftOut[0]).toMatchObject({ name: "Quiet", reason: "stop_email" });
    expect((await email.resolveAudience(db, { kind: "address", email: "" })).to).toEqual([]);
  });
});

describe("the check", () => {
  it("shows a named recipient the email they will get, and counts who is in and out", async () => {
    const id = await draft(FALL, { body: "Hi {name},\n\nTell me how it went: {survey}" });
    const c = await email.checkEmail(db, id, 1);
    if (!c.ok) throw new Error(c.error);
    expect(c.data).toMatchObject({ group: true, total: 2, index: 1, warning: null, blockers: [], problems: {} });
    expect(c.data.leftOut.map((l) => l.reason)).toEqual(["stop_email", "banned"]);
    expect(c.data.shown).toMatchObject({ from: SITE.mailFromGroup, replyTo: SITE.mailReplyTo, to: "Sam <sam@uvm.edu>", subject: "Fall listings come down" });
    expect(c.data.shown!.text).toContain("Hi Sam,");
    expect(verifySurveyToken(/\/survey\?t=([0-9a-f.-]+)/.exec(c.data.shown!.text)?.[1] ?? "")).toEqual({ userId: p.sam });
    expect(verifyAnnounceUnsubscribe(/\/unsubscribe\?t=([0-9a-f.-]+)/.exec(c.data.shown!.text)?.[1])).toEqual({ userId: p.sam });
    expect(c.data.shown!.text).toContain("PO Box 1, Burlington, VT 05402");
    expect(c.data.shown!.text).toContain("because you posted a listing");
  });

  it("an email to one person has no unsubscribe or postal address, and says what stands in its way", async () => {
    const id = await draft({ kind: "address", email: "quiet@uvm.edu" });
    const c = await email.checkEmail(db, id);
    if (!c.ok) throw new Error(c.error);
    expect(c.data).toMatchObject({ group: false, total: 1, warning: "stop_email" });
    expect(c.data.shown).toMatchObject({ from: SITE.mailFromPersonal, to: "Quiet <quiet@uvm.edu>" });
    expect(c.data.shown!.text).not.toMatch(/unsubscribe|PO Box/i);
    const banned = await email.checkEmail(db, await draft({ kind: "address", email: "gone@uvm.edu" }));
    expect(banned.ok && banned.data).toMatchObject({ total: 0, warning: "banned" });
    const unfinished = await email.checkEmail(db, await createDraft(db, admin.id, { audience: { kind: "address", email: "not-an-address" } }));
    expect(unfinished.ok && Object.keys(unfinished.data.problems).sort()).toEqual(["body", "email", "subject"]);
  });

  it("blocks a group email without the postal address or the signing secret, and a survey link for someone with no account", async () => {
    const id = await draft(FALL);
    vi.stubEnv("MAILING_ADDRESS", "");
    const noAddress = await email.checkEmail(db, id);
    expect(noAddress.ok && noAddress.data.blockers).toEqual([expect.stringContaining("MAILING_ADDRESS")]);
    expect(await send(id, { typed: 2 })).toMatchObject({ ok: false, error: expect.stringContaining("MAILING_ADDRESS") });
    vi.stubEnv("MAILING_ADDRESS", "PO Box 1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SURVEY_SECRET", undefined);
    const noSecret = await email.checkEmail(db, id);
    expect(noSecret.ok && noSecret.data.blockers[0]).toContain("SURVEY_SECRET");
    vi.unstubAllEnvs();
    const stranger = await email.checkEmail(db, await draft({ kind: "address", email: "dana@example.org" }, { body: "{survey}" }));
    expect(stranger.ok && stranger.data.blockers).toEqual([expect.stringContaining("only works for someone with an account")]);
    expect(sentInTests).toHaveLength(0);
  });
});

describe("sending to a group", () => {
  it("needs the checked email and the typed count, freezes the list, and sends one email each from the bulk address with one-click unsubscribe", async () => {
    const id = await draft(FALL);
    expect(await send(id, { check: "0".repeat(32), typed: 2 })).toMatchObject({ ok: false, error: expect.stringContaining("changed after you last looked") });
    expect(await send(id, { typed: 3 })).toMatchObject({ ok: false, error: expect.stringContaining("Type 2 to send") });
    expect(await send(id, { typed: null })).toMatchObject({ ok: false });
    expect((await getEmail(db, id))?.status).toBe("draft");

    expect(await send(id, { typed: 2 })).toEqual({ ok: true, data: { already: false, queued: 2, leftOut: 2 } });
    expect(sentInTests).toHaveLength(0); // nothing goes until it is drained
    expect(await getEmail(db, id)).toMatchObject({ status: "sending", sender: "group", toLabel: "Fall 2026 posters" });
    // A second Send, from another tab or a double press, finds it gone and does nothing.
    expect(await send(id, { typed: 2 })).toEqual({ ok: true, data: { already: true, queued: 0, leftOut: 0 } });
    expect(await saveDraft(db, id, { subject: "Changed", body: "x", audience: FALL, resolve: null })).toBe(false);

    expect(await go(id)).toEqual({ sent: 2, failed: 0, finished: true });
    expect(sentInTests.map((m) => [m.to, m.kind, m.from, m.replyTo])).toEqual([
      ["priya@uvm.edu", "email_group", SITE.mailFromGroup, SITE.mailReplyTo],
      ["sam@uvm.edu", "email_group", SITE.mailFromGroup, SITE.mailReplyTo],
    ]);
    expect(sentInTests[0].text).toContain("Hi Priya,");
    expect(sentInTests[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(verifyAnnounceUnsubscribe(/\/api\/email\/unsubscribe\?t=([0-9a-f.-]+)>/.exec(sentInTests[0].headers["List-Unsubscribe"])?.[1])).toEqual({ userId: p.priya });
    expect(new Set(sentInTests.map((m) => m.idempotencyKey)).size).toBe(2);
    expect(await getEmail(db, id)).toMatchObject({ status: "sent" });
    const rows = await listDeliveries(db, id);
    expect(rows.map((d) => [d.address, d.status, d.reason, d.greetedAs])).toEqual([
      ["priya@uvm.edu", "sent", null, "Priya"],
      ["sam@uvm.edu", "sent", null, "Sam"],
      ["quiet@uvm.edu", "left_out", "stop_email", "Quiet"],
      ["gone@uvm.edu", "left_out", "banned", "Gone"],
    ]);
    // Draining again, as the cron might, sends nothing more.
    expect(await go(id)).toEqual({ sent: 0, failed: 0, finished: false });
    expect(sentInTests).toHaveLength(2);
    const [row] = (await listEmails(db)).filter((e) => e.id === id);
    expect(row).toMatchObject({ sent: 2, failed: 0, leftOut: 2, waiting: 0 });
    // Their copy can be shown again, rebuilt from the email and the name it greeted them by.
    const copy = await email.sentCopy(db, id, rows[1].id);
    expect(copy.ok && copy.data.text).toContain("Hi Sam,");
  });

  it("the database itself refuses a second row for one address in one email", async () => {
    const id = await draft(FALL);
    await send(id, { typed: 2 });
    await expect(db.insert(s.emailDeliveries).values({ emailId: id, address: "priya@uvm.edu" })).rejects.toThrow();
    await go(id);
  });

  it("leaves out someone who is banned or unsubscribes after the list was frozen", async () => {
    const id = await draft({ kind: "people", userIds: [p.priya, p.sam, p.taylor] });
    expect(await send(id, { typed: 3 })).toMatchObject({ ok: true, data: { queued: 3 } });
    await db.update(s.user).set({ banned: true }).where(eq(s.user.id, p.sam));
    await setNoEmail(db, p.taylor, true);
    expect(await go(id)).toEqual({ sent: 1, failed: 0, finished: true });
    expect(sentInTests.map((m) => m.to)).toEqual(["priya@uvm.edu"]);
    expect((await listDeliveries(db, id)).map((d) => [d.address, d.status, d.reason])).toEqual([
      ["priya@uvm.edu", "sent", null],
      ["sam@uvm.edu", "left_out", "banned"],
      ["taylor@uvm.edu", "left_out", "stop_email"],
    ]);
    await db.update(s.user).set({ banned: false }).where(eq(s.user.id, p.sam));
    await setNoEmail(db, p.taylor, false);
  });

  it("retries a temporary failure later under the same provider key, fails a refusal at once, and Retry reaches only the ones that failed", async () => {
    const id = await draft({ kind: "people", userIds: [p.priya, p.sam, p.taylor] });
    await send(id, { typed: 3 });
    const sendModule = await import("@/server/email/send");
    const real = sendModule.sendMail;
    const calls: { to: string; key: string | undefined }[] = [];
    const spy = vi.spyOn(sendModule, "sendMail").mockImplementation(async (args) => {
      calls.push({ to: args.to, key: args.idempotencyKey });
      if (args.to === "sam@uvm.edu") return { ok: false, error: "Internal server error" };
      if (args.to === "taylor@uvm.edu") return { ok: false, error: "Invalid `to` field." };
      return real(args);
    });
    try {
      // Sam's failure is the provider's, so he waits for a later try; Taylor's address was refused.
      expect(await go(id)).toEqual({ sent: 1, failed: 1, finished: false });
      expect((await listDeliveries(db, id)).map((d) => [d.address, d.status, d.attempts])).toEqual([
        ["priya@uvm.edu", "sent", 1],
        ["sam@uvm.edu", "queued", 1],
        ["taylor@uvm.edu", "failed", 1],
      ]);
      expect((await getEmail(db, id))?.status).toBe("sending");
      // Not yet: a second try waits five minutes.
      expect(await go(id)).toEqual({ sent: 0, failed: 0, finished: false });
      await db.update(s.emailDeliveries).set({ lastAttemptAt: new Date(Date.now() - RETRY_AFTER_MS - 1000) }).where(and(eq(s.emailDeliveries.emailId, id), eq(s.emailDeliveries.address, "sam@uvm.edu")));
      spy.mockImplementation(async (args) => {
        calls.push({ to: args.to, key: args.idempotencyKey });
        return real(args);
      });
      // The hourly cron's pass picks him up, and the email is finished.
      expect(await email.resumeSending(db, { pauseMs: 0 })).toMatchObject({ sent: 1, failed: 0 });
      expect((await getEmail(db, id))?.status).toBe("sent");
      const sam = calls.filter((c) => c.to === "sam@uvm.edu");
      expect(sam).toHaveLength(2);
      expect(sam[0].key).toBe(sam[1].key);

      // Retry failed: only Taylor, and nobody who already has it.
      const before = calls.length;
      expect(await email.retryFailed(db, id)).toEqual({ ok: true, data: { queued: 1 } });
      expect(await go(id)).toEqual({ sent: 1, failed: 0, finished: true });
      expect(calls.slice(before).map((c) => c.to)).toEqual(["taylor@uvm.edu"]);
      expect(await email.retryFailed(db, id)).toMatchObject({ ok: false });
    } finally {
      spy.mockRestore();
    }
  });

  it("a recipient cut off mid-send goes back to the queue and is sent once", async () => {
    const id = await draft({ kind: "people", userIds: [p.priya] });
    await send(id, { typed: 1 });
    // As if the function died after claiming her: `sending`, six minutes ago.
    await db.update(s.emailDeliveries).set({ status: "sending", attempts: 1, lastAttemptAt: new Date(Date.now() - 6 * 60_000) }).where(eq(s.emailDeliveries.emailId, id));
    expect(await go(id)).toEqual({ sent: 0, failed: 0, finished: false });
    // The hourly pass puts her back in the queue and, her wait being over, sends to her.
    expect(await email.resumeSending(db, { pauseMs: 0 })).toMatchObject({ requeued: 1, sent: 1, failed: 0 });
    expect((await getEmail(db, id))?.status).toBe("sent");
    expect(await go(id)).toEqual({ sent: 0, failed: 0, finished: false });
    expect(sentInTests.filter((m) => m.to === "priya@uvm.edu")).toHaveLength(1);
    expect((await listDeliveries(db, id))[0]).toMatchObject({ status: "sent", attempts: 2 });
  });
});

describe("sending to one person", () => {
  it("goes from the author's own address with no unsubscribe, and settles the request it answers once it has gone", async () => {
    const [req] = await db.insert(s.accessRequests).values({ kind: "access", name: "Dana Whitcomb", email: "dana@example.org", message: "Please" }).returning({ id: s.accessRequests.id });
    const id = await draft({ kind: "address", email: "dana@example.org" }, { subject: "Your access request", body: "Hi Dana,\n\nYou're in.", accessRequestId: req.id, resolve: "approve" });
    expect((await repliesForRequests(db, [req.id])).get(req.id)).toMatchObject([{ id, status: null }]);
    expect(await send(id)).toEqual({ ok: true, data: { already: false, queued: 1, leftOut: 0 } });
    expect(await go(id)).toEqual({ sent: 1, failed: 0, finished: true });
    expect(sentInTests).toHaveLength(1);
    expect(sentInTests[0]).toMatchObject({ to: "dana@example.org", kind: "email_direct", from: SITE.mailFromPersonal });
    expect(sentInTests[0].headers["List-Unsubscribe"]).toBeUndefined();
    expect(sentInTests[0].text).not.toMatch(/unsubscribe/i);
    expect(await getEmail(db, id)).toMatchObject({ status: "sent", sender: "personal", toLabel: "dana@example.org" });
    const { isEmailApproved } = await import("@/server/data/access-requests");
    expect(await isEmailApproved(db, "dana@example.org")).toBe(true);
    expect((await repliesForRequests(db, [req.id])).get(req.id)).toMatchObject([{ id, status: "sent" }]);
  });

  it("never goes to a banned account, and to someone on Stop email only with Send anyway, which is recorded", async () => {
    const banned = await draft({ kind: "address", email: "gone@uvm.edu" });
    expect(await send(banned, { sendAnyway: true })).toMatchObject({ ok: false, error: expect.stringContaining("banned") });
    const id = await draft({ kind: "address", email: "quiet@uvm.edu" });
    expect(await send(id)).toMatchObject({ ok: false, error: expect.stringContaining("Send anyway") });
    expect((await getEmail(db, id))?.status).toBe("draft");
    expect(await send(id, { sendAnyway: true })).toMatchObject({ ok: true, data: { queued: 1 } });
    expect(await go(id)).toEqual({ sent: 1, failed: 0, finished: true });
    expect(sentInTests.map((m) => m.to)).toEqual(["quiet@uvm.edu"]);
    expect((await listDeliveries(db, id))[0]).toMatchObject({ status: "sent", overridden: true });
  });

  it("refuses an unfinished email, and stops at thirty an hour", async () => {
    const blank = await createDraft(db, admin.id, { audience: { kind: "address", email: "dana@example.org" } });
    expect(await send(blank)).toMatchObject({ ok: false, fieldErrors: { subject: "Write a subject.", body: "Write the message." } });
    await db.delete(s.rateLimitBuckets);
    let last: Awaited<ReturnType<typeof send>> | undefined;
    for (let i = 0; i < 31; i++) last = await send(await draft({ kind: "address", email: `n${i}@example.org` }));
    expect(last).toMatchObject({ ok: false, error: expect.stringContaining("30 emails this hour") });
    await db.delete(s.rateLimitBuckets);
  });
});

describe("a test to the admin", () => {
  it("goes only to the admin, as a named recipient would get it, with the admin's own unsubscribe link, and is never counted", async () => {
    const id = await draft(FALL);
    expect(await email.sendTest(db, admin, id, 1)).toEqual({ ok: true, data: { to: "boss@uvm.edu", as: "Sam" } });
    expect(sentInTests).toHaveLength(1);
    expect(sentInTests[0]).toMatchObject({ to: "boss@uvm.edu", subject: "[Test] Fall listings come down", kind: "email_group" });
    expect(sentInTests[0].text).toContain("Hi Sam,");
    expect(verifyAnnounceUnsubscribe(/\/unsubscribe\?t=([0-9a-f.-]+)/.exec(sentInTests[0].text)?.[1])).toEqual({ userId: admin.id });
    expect((await getEmail(db, id))?.status).toBe("draft");
    expect((await listDeliveries(db, id)).map((d) => [d.address, d.test, d.status])).toEqual([["boss@uvm.edu", true, "sent"]]);
    expect((await listEmails(db)).find((e) => e.id === id)).toMatchObject({ sent: 0, waiting: 0 });
    // The test's row doesn't stand in the way of the admin being a real recipient later.
    await db.delete(s.rateLimitBuckets);
  });
});

describe("unsubscribing and deleting an account", () => {
  it("the link in a group email sets Stop email, whoever presses it and however often; nothing else passes for it", async () => {
    const id = await draft({ kind: "people", userIds: [p.seeker] });
    await send(id, { typed: 1 });
    await go(id);
    const token = /\/unsubscribe\?t=([0-9a-f.-]+)/.exec(sentInTests[0].text)![1];
    expect(await email.announceUnsubscribeState(db, token)).toEqual({ state: "open", already: false });
    expect(await email.announceUnsubscribe(db, token, "one_click")).toEqual({ ok: true });
    const [u] = await db.select({ noEmail: s.user.noEmail, source: s.user.noEmailSource, at: s.user.noEmailAt }).from(s.user).where(eq(s.user.id, p.seeker));
    expect(u).toMatchObject({ noEmail: true, source: "unsubscribe" });
    expect(u.at).toBeInstanceOf(Date);
    expect(await email.announceUnsubscribeState(db, token)).toEqual({ state: "open", already: true });
    expect(await email.announceUnsubscribe(db, token, "page")).toEqual({ ok: true });
    expect(await email.announceUnsubscribe(db, "nope", "page")).toEqual({ ok: false });
    const { signDigestUnsubscribe } = await import("@/server/digest-token");
    expect(await email.announceUnsubscribe(db, signDigestUnsubscribe(p.sam), "page")).toEqual({ ok: false });
    expect((await email.resolveAudience(db, { kind: "everyone" })).leftOut.map((x) => x.email)).toContain("seeker@uvm.edu");
    // The admin lifting it clears how it was set.
    await setNoEmail(db, p.seeker, false);
    const [back] = await db.select({ source: s.user.noEmailSource, at: s.user.noEmailAt }).from(s.user).where(eq(s.user.id, p.seeker));
    expect(back).toEqual({ source: null, at: null });
  });

  it("deleting an account deletes an email written to them alone, and keeps their row in a group email without the address or name", async () => {
    const [u] = await db.insert(s.user).values({ email: "leaver@uvm.edu", name: "leaver", firstName: "Lee", lastName: "Ver" }).returning({ id: s.user.id });
    const direct = await draft({ kind: "address", email: "leaver@uvm.edu" });
    await send(direct);
    await go(direct);
    const group = await draft({ kind: "people", userIds: [u.id, p.priya] });
    await send(group, { typed: 2 });
    await go(group);
    const dry = await deletePerson(db, u.id, null, true);
    expect(dry.ok && dry.data.messages).toBe(1);
    expect((await deletePerson(db, u.id, null)).ok).toBe(true);
    expect(await getEmail(db, direct)).toBeNull();
    expect((await listDeliveries(db, group)).map((d) => [d.address, d.userId === null, d.greetedAs, d.status])).toEqual([
      ["priya@uvm.edu", false, "Priya", "sent"],
      [null, true, null, "sent"],
    ]);
    expect((await listEmails(db)).find((e) => e.id === group)).toMatchObject({ sent: 2 });
    // forgetRecipient alone is safe to repeat.
    await forgetRecipient(db, "leaver@uvm.edu");
    expect(await db.select({ n: sql<number>`count(*)::int` }).from(s.emailDeliveries).where(eq(s.emailDeliveries.emailId, group))).toEqual([{ n: 2 }]);
  });
});
