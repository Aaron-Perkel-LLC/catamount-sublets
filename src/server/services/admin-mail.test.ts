import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real send path, not console mode: a key and MAIL_LIVE, with Resend itself mocked.
process.env.RESEND_API_KEY = "re_test_not_a_key";
process.env.MAIL_LIVE = "1";
const resendSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const { previewAdminMessage, sendAdminMessage, previewToken, RETRY_PENDING_AFTER_MS, NO_EMAIL_WARNING } = await import("./admin-mail");
const { claimAdminMessage, countAdminMessagesTo, failStalePending } = await import("@/server/data/admin-messages");
const { deletePerson } = await import("./admin");
const { createAccessRequest, approvedEmails } = await import("@/server/data/access-requests");
const { RATE_LIMITS } = await import("@/server/rate-limit");
const { SITE } = await import("@/config/site");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
let adminId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [a] = await db.insert(s.user).values({ email: "aaron@catamountsublets.com", name: "Aaron", role: "admin" }).returning({ id: s.user.id });
  adminId = a.id;
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(s.adminMessages);
  await db.delete(s.accessRequests);
  await db.delete(s.rateLimitBuckets);
  await db.delete(s.siteSettings);
  resendSend.mockReset();
  resendSend.mockResolvedValue({ data: { id: "re_123" }, error: null });
});

const content = { to: " Sam@Example.org ", subject: "Hello", body: "Hi Sam,\n\nSee https://example.org/x." };

/** Preview, then send what was previewed, as the composer does. */
async function previewAndSend(input: Record<string, unknown> = {}) {
  const c = { ...content, ...input };
  const p = await previewAdminMessage(db, adminId, c);
  if (!p.ok) throw new Error(p.error);
  return sendAdminMessage(db, adminId, c, p.data.token);
}

const rows = () => db.select().from(s.adminMessages).orderBy(s.adminMessages.id);

describe("previewAdminMessage", () => {
  it("renders the message, links and sign-off included, with a plain-text part", async () => {
    const p = await previewAdminMessage(db, adminId, content);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data.html).toContain('href="https://example.org/x"');
    expect(p.data.html).toContain(SITE.disclaimer);
    expect(p.data.text).toContain("See https://example.org/x.");
    expect(p.data.text).toContain(SITE.supportEmail);
  });

  it("refuses bad input field by field", async () => {
    const p = await previewAdminMessage(db, adminId, { to: "a@b.com, c@d.com", subject: "", body: "x".repeat(10_001) });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(Object.keys(p.fieldErrors ?? {}).sort()).toEqual(["body", "subject", "to"]);
  });
});

describe("a recipient who asked for no email", () => {
  it("gets a warning with the preview, and can still be sent to", async () => {
    await db.insert(s.user).values([
      { email: "optedout@example.org", name: "Opted Out", noEmail: true },
      { email: "fine@example.org", name: "Fine" },
    ]);
    const warned = await previewAdminMessage(db, adminId, { ...content, to: "OptedOut@Example.org" });
    expect(warned.ok && warned.data.warning).toBe(NO_EMAIL_WARNING);
    const plain = await previewAdminMessage(db, adminId, { ...content, to: "fine@example.org" });
    expect(plain.ok && plain.data.warning).toBeNull();
    const stranger = await previewAdminMessage(db, adminId, content);
    expect(stranger.ok && stranger.data.warning).toBeNull();

    if (!warned.ok) throw new Error();
    const sent = await sendAdminMessage(db, adminId, { ...content, to: "OptedOut@Example.org" }, warned.data.token);
    expect(sent.ok).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect((await rows())[0]).toMatchObject({ recipient: "optedout@example.org", status: "sent" });
    await db.delete(s.adminMessages);
    await db.delete(s.user).where(inArray(s.user.email, ["optedout@example.org", "fine@example.org"]));
  });
});

describe("sendAdminMessage", () => {
  it("sends through Resend from the personal sender and records the row", async () => {
    const r = await previewAndSend();
    expect(r.ok).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    const [payload, options] = resendSend.mock.calls[0];
    expect(payload).toMatchObject({ from: SITE.mailFromPersonal, to: "sam@example.org", subject: "Hello", replyTo: SITE.mailReplyTo });
    expect(payload.text).toContain("See https://example.org/x.");
    expect(options.idempotencyKey).toMatch(/^admin-message\/[a-f0-9]{32}$/);
    const [row] = await rows();
    expect(row).toMatchObject({ senderId: adminId, recipient: "sam@example.org", subject: "Hello", status: "sent", resendId: "re_123", error: null, accessRequestId: null, idempotencyKey: options.idempotencyKey });
  });

  it("refuses without a preview, or after any edit to what was previewed", async () => {
    expect((await sendAdminMessage(db, adminId, content, "")).ok).toBe(false);
    const p = await previewAdminMessage(db, adminId, content);
    if (!p.ok) throw new Error();
    for (const changed of [{ body: content.body + "!" }, { subject: "Hello!" }, { to: "other@example.org" }]) {
      const r = await sendAdminMessage(db, adminId, { ...content, ...changed }, p.data.token);
      expect(r.ok && "sent").toBe(false);
    }
    // A token is the admin's own.
    expect((await sendAdminMessage(db, "00000000-0000-0000-0000-000000000000", content, p.data.token)).ok).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });

  it("sends one preview once, however often Send is pressed", async () => {
    const p = await previewAdminMessage(db, adminId, content);
    if (!p.ok) throw new Error();
    const first = await sendAdminMessage(db, adminId, content, p.data.token);
    const again = await sendAdminMessage(db, adminId, content, p.data.token);
    expect(first.ok && first.data.duplicate).toBe(false);
    expect(again.ok && again.data.duplicate).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(await rows()).toHaveLength(1);
  });

  it("records a failed send with its reason and says why", async () => {
    resendSend.mockResolvedValue({ data: null, error: { name: "validation_error", message: "The domain is not verified." } });
    const r = await previewAndSend();
    expect(r).toEqual({ ok: false, error: "Not sent: The domain is not verified." });
    const [row] = await rows();
    expect(row).toMatchObject({ status: "failed", error: "The domain is not verified.", resendId: null });
  });

  it("records a send that throws as failed, too", async () => {
    resendSend.mockRejectedValue(new Error("socket hang up"));
    const r = await previewAndSend();
    expect(r.ok).toBe(false);
    expect((await rows())[0]).toMatchObject({ status: "failed", error: "socket hang up" });
  });

  it("refuses a retry of a failed preview: a new preview is a new attempt", async () => {
    resendSend.mockResolvedValueOnce({ data: null, error: { name: "application_error", message: "down" } });
    const p = await previewAdminMessage(db, adminId, content);
    if (!p.ok) throw new Error();
    expect((await sendAdminMessage(db, adminId, content, p.data.token)).ok).toBe(false);
    const retry = await sendAdminMessage(db, adminId, content, p.data.token);
    expect(retry.ok).toBe(false);
    expect(!retry.ok && retry.error).toMatch(/Preview again/);
    expect((await previewAndSend()).ok).toBe(true);
  });

  it("stops at the hourly limit, counting failed sends", async () => {
    const { limit } = RATE_LIMITS.adminMailPerUser;
    resendSend.mockResolvedValue({ data: null, error: { name: "application_error", message: "down" } });
    for (let i = 0; i < 10; i++) expect((await previewAndSend({ subject: `Fail ${i}` })).ok).toBe(false);
    resendSend.mockResolvedValue({ data: { id: "re_ok" }, error: null });
    for (let i = 10; i < limit; i++) expect((await previewAndSend({ subject: `Ok ${i}` })).ok).toBe(true);
    const over = await previewAndSend({ subject: "One too many" });
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toMatch(/30 emails this hour/);
    expect(resendSend).toHaveBeenCalledTimes(limit);
    // The refused one left no row behind.
    expect(await rows()).toHaveLength(limit);
  });

  it("approves the request it answers, in the same step", async () => {
    const id = await createAccessRequest(db, { kind: "access", name: "Sam Rivera", email: "sam@example.org", school: "", message: "Graduated, still on the lease.", website: "" });
    const r = await previewAndSend({ accessRequestId: id, resolve: "approve" });
    expect(r.ok && r.data.resolved).toBe("approved");
    const [req] = await db.select().from(s.accessRequests).where(eq(s.accessRequests.id, id));
    expect(req.handledAt).not.toBeNull();
    expect(await approvedEmails(db)).toContain("sam@example.org");
    expect((await rows())[0].accessRequestId).toBe(id);
  });

  it("declines the request it answers without approving the address", async () => {
    const id = await createAccessRequest(db, { kind: "school", name: "Sam", email: "sam@example.org", school: "Champlain College", message: "", website: "" });
    const r = await previewAndSend({ accessRequestId: id, resolve: "decline" });
    expect(r.ok && r.data.resolved).toBe("declined");
    const [req] = await db.select().from(s.accessRequests).where(eq(s.accessRequests.id, id));
    expect(req.handledAt).not.toBeNull();
    expect(await approvedEmails(db)).not.toContain("sam@example.org");
  });

  it("leaves the request open when the send fails, or when asked to", async () => {
    const id = await createAccessRequest(db, { kind: "access", name: "Sam", email: "sam@example.org", school: "", message: "Graduated, still on the lease.", website: "" });
    expect((await previewAndSend({ accessRequestId: id, resolve: null })).ok).toBe(true);
    resendSend.mockResolvedValue({ data: null, error: { name: "application_error", message: "down" } });
    expect((await previewAndSend({ accessRequestId: id, resolve: "approve", subject: "Again" })).ok).toBe(false);
    const [req] = await db.select().from(s.accessRequests).where(eq(s.accessRequests.id, id));
    expect(req.handledAt).toBeNull();
    expect(await approvedEmails(db)).not.toContain("sam@example.org");
  });

  it("can only resolve a request it is a reply to", async () => {
    expect((await previewAndSend({ resolve: "approve" })).ok).toBe(false);
    expect((await previewAndSend({ accessRequestId: 99_999 })).ok).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });
});

describe("a send interrupted mid-flight", () => {
  /** What a request that died after claiming its row leaves behind: a pending row under the preview's key. */
  async function strand(minutesAgo: number) {
    const p = await previewAdminMessage(db, adminId, content);
    if (!p.ok) throw new Error();
    const key = `admin-message/${p.data.token.split(".")[0]}`;
    const id = await claimAdminMessage(db, { senderId: adminId, recipient: "sam@example.org", subject: "Hello", body: content.body.trim(), idempotencyKey: key, accessRequestId: null });
    await db.update(s.adminMessages).set({ attemptedAt: new Date(Date.now() - minutesAgo * 60_000) }).where(eq(s.adminMessages.id, id!));
    return { token: p.data.token, key, id: id! };
  }

  it("is not retried while it might still be sending", async () => {
    const { token } = await strand(1);
    const r = await sendAdminMessage(db, adminId, content, token);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/still sending/);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("is retried under the same key once it has sat five minutes, settling the same row", async () => {
    expect(RETRY_PENDING_AFTER_MS).toBe(5 * 60_000);
    const { token, key, id } = await strand(6);
    const r = await sendAdminMessage(db, adminId, content, token);
    expect(r.ok && r.data).toMatchObject({ messageId: id, duplicate: false });
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(resendSend.mock.calls[0][1]).toEqual({ idempotencyKey: key });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id, status: "sent", resendId: "re_123" });
    // And it is then a plain duplicate.
    const again = await sendAdminMessage(db, adminId, content, token);
    expect(again.ok && again.data.duplicate).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("is marked failed as interrupted by the daily sweep after an hour", async () => {
    const old = await strand(61);
    const recent = await strand(10);
    expect(await failStalePending(db, new Date(Date.now() - 3_600_000))).toBe(1);
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(old.id)).toMatchObject({ status: "failed", error: "interrupted" });
    expect(byId.get(recent.id)).toMatchObject({ status: "pending", error: null });
  });
});

describe("recipients", () => {
  it("are stored lowercase, and the database refuses anything else", async () => {
    await claimAdminMessage(db, { senderId: adminId, recipient: " JDoe@UVM.edu ", subject: "s", body: "b", idempotencyKey: "k1", accessRequestId: null });
    expect((await rows())[0].recipient).toBe("jdoe@uvm.edu");
    await expect(db.insert(s.adminMessages).values({ recipient: "JDoe@uvm.edu", subject: "s", body: "b", idempotencyKey: "k2" })).rejects.toThrow();
    expect(await countAdminMessagesTo(db, "JDOE@uvm.EDU")).toBe(1);
  });
});

describe("deleting an account", () => {
  it("deletes the admin's emails to that address", async () => {
    const [u] = await db.insert(s.user).values({ email: "jdoe@uvm.edu", name: "Jane" }).returning({ id: s.user.id });
    expect((await previewAndSend({ to: "jdoe@uvm.edu" })).ok).toBe(true);
    expect((await previewAndSend({ to: "someone@example.org" })).ok).toBe(true);
    const dry = await deletePerson(db, u.id, adminId, true);
    expect(dry.ok && dry.data.messages).toBe(1);
    expect((await deletePerson(db, u.id, adminId)).ok).toBe(true);
    expect((await rows()).map((r) => r.recipient)).toEqual(["someone@example.org"]);
  });
});

describe("previewToken", () => {
  it("is bound to the nonce, the admin and the content", () => {
    const c = { to: "a@example.org", subject: "s", body: "b" };
    expect(previewToken(adminId, c, "0".repeat(32))).toBe(previewToken(adminId, c, "0".repeat(32)));
    expect(previewToken(adminId, c, "0".repeat(32))).not.toBe(previewToken(adminId, { ...c, body: "c" }, "0".repeat(32)));
  });
});
