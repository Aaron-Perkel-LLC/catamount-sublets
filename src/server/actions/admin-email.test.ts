import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The email actions' own rules: nobody but an admin gets past the first
 * line, input is parsed before the service sees it, and only a Send that
 * actually started schedules the sending.
 */
const auth = vi.hoisted(() => ({ role: "user" as string | null }));
const svc = vi.hoisted(() => ({
  checkEmail: vi.fn(async () => ({ ok: true, data: {} })),
  sendTest: vi.fn(async () => ({ ok: true, data: { to: "a@b.c", as: "Sam" } })),
  startSend: vi.fn(async (): Promise<unknown> => ({ ok: true, data: { already: false, queued: 1, leftOut: 0 } })),
  drain: vi.fn(async () => ({ sent: 1, failed: 0, finished: true })),
  retryFailed: vi.fn(async (): Promise<unknown> => ({ ok: true, data: { queued: 1 } })),
  sentCopy: vi.fn(async () => ({ ok: true, data: {} })),
}));
const data = vi.hoisted(() => ({ createDraft: vi.fn(async () => 9), deleteDraft: vi.fn(async () => true), getEmail: vi.fn(async (): Promise<unknown> => ({ id: 5, accessRequestId: null, audience: { kind: "board" }, subject: "s", body: "b" })), saveDraft: vi.fn(async () => true) }));
const after = vi.hoisted(() => ({ run: [] as (() => unknown)[] }));

vi.mock("@/server/auth", async () => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireAdmin: async () => {
      if (auth.role !== "admin") throw new ForbiddenError("Forbidden");
      return { id: "admin-id", email: "admin@example.org", role: "admin" };
    },
  };
});
vi.mock("@/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/server/services/email", () => svc);
vi.mock("@/server/data/emails", () => data);
vi.mock("@/server/data/access-requests", () => ({ listPendingAccessRequests: async () => [] }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => after.run.push(fn) }));

const actions = await import("./admin-email");
const draft = { subject: "Hi", body: "Hello", audience: { kind: "everyone" }, resolve: null };
const send = { check: "a".repeat(32), typed: 3, sendAnyway: false };

beforeEach(() => {
  for (const f of [...Object.values(svc), ...Object.values(data)]) f.mockClear();
  after.run.length = 0;
  auth.role = "admin";
});

describe("the admin's email actions", () => {
  it("refuse a signed-out visitor and a non-admin before doing anything", async () => {
    for (const role of [null, "user"]) {
      auth.role = role;
      await expect(actions.adminEmailNew({})).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailSave(5, draft, 0)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailCheck(5, 0)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailDelete(5)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailTest(5, 0)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailSend(5, send)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailRetry(5)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailCopy(5)).rejects.toThrow("Forbidden");
      await expect(actions.adminEmailCopyFor(5, 1)).rejects.toThrow("Forbidden");
    }
    for (const f of [...Object.values(svc), ...Object.values(data)]) expect(f).not.toHaveBeenCalled();
    expect(after.run).toHaveLength(0);
  });

  it("Send starts the sending only when it queued something, and never on a refusal or a repeat", async () => {
    expect(await actions.adminEmailSend(5, send)).toMatchObject({ ok: true });
    expect(svc.startSend).toHaveBeenCalledWith({}, "admin-id", 5, send);
    expect(after.run).toHaveLength(1);
    expect(svc.drain).not.toHaveBeenCalled(); // not before the action answers
    await after.run[0]();
    expect(svc.drain).toHaveBeenCalledWith({}, 5);

    after.run.length = 0;
    svc.startSend.mockResolvedValueOnce({ ok: true, data: { already: true, queued: 0, leftOut: 0 } });
    await actions.adminEmailSend(5, send);
    svc.startSend.mockResolvedValueOnce({ ok: false, error: "Type 3 to send." });
    await actions.adminEmailSend(5, send);
    expect(after.run).toHaveLength(0);
  });

  it("parse what they are given before the service sees it", async () => {
    expect(await actions.adminEmailSend(5, { check: "nope", typed: 3, sendAnyway: false })).toMatchObject({ ok: false });
    expect(await actions.adminEmailSend(5, { check: "a".repeat(32), typed: "3", sendAnyway: false })).toMatchObject({ ok: false });
    expect(svc.startSend).not.toHaveBeenCalled();
    await expect(actions.adminEmailSend(-1, send)).rejects.toThrow();
    expect(await actions.adminEmailNew({ audience: { kind: "all" } })).toMatchObject({ ok: false });
    expect(await actions.adminEmailSave(5, { ...draft, audience: { kind: "people", userIds: ["x"] } }, 0)).toMatchObject({ ok: false });
    expect(data.saveDraft).not.toHaveBeenCalled();
    await expect(actions.adminEmailTest(5, -2)).rejects.toThrow();
    expect(svc.sendTest).not.toHaveBeenCalled();
  });

  it("a test goes to the signed-in admin's own address, and only a reply can approve or decline", async () => {
    await actions.adminEmailTest(5, 2);
    expect(svc.sendTest).toHaveBeenCalledWith({}, { id: "admin-id", email: "admin@example.org" }, 5, 2);
    await actions.adminEmailSave(5, { ...draft, resolve: "approve" }, 0);
    expect(data.saveDraft).toHaveBeenLastCalledWith({}, 5, { ...draft, resolve: null });
    data.getEmail.mockResolvedValueOnce({ id: 5, accessRequestId: 7 });
    await actions.adminEmailSave(5, { ...draft, resolve: "approve" }, 0);
    expect(data.saveDraft).toHaveBeenLastCalledWith({}, 5, { ...draft, resolve: "approve" });
  });

  it("Retry drains only when something went back in the queue", async () => {
    await actions.adminEmailRetry(5);
    expect(after.run).toHaveLength(1);
    after.run.length = 0;
    svc.retryFailed.mockResolvedValueOnce({ ok: false, error: "Nothing here can be retried safely." });
    await actions.adminEmailRetry(5);
    expect(after.run).toHaveLength(0);
  });
});
