import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ role: "user" as string | null }));
const svc = vi.hoisted(() => ({
  preview: vi.fn(async () => ({ ok: true, data: { html: "", text: "", token: "t", warning: null } })),
  send: vi.fn(async () => ({ ok: true, data: { messageId: 1, duplicate: false, resolved: null } })),
}));

vi.mock("@/server/auth", async () => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireAdmin: async () => {
      if (auth.role !== "admin") throw new ForbiddenError("Forbidden");
      return { id: "admin-id", role: "admin" };
    },
  };
});
vi.mock("@/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/server/services/admin-mail", () => ({ previewAdminMessage: svc.preview, sendAdminMessage: svc.send }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { adminPreviewMail, adminSendMail } = await import("./admin");
const input = { to: "sam@example.org", subject: "Hi", body: "Hello" };

describe("admin mail actions", () => {
  beforeEach(() => {
    svc.preview.mockClear();
    svc.send.mockClear();
  });

  it("refuses a signed-out visitor and a non-admin before doing anything", async () => {
    for (const role of [null, "user"]) {
      auth.role = role;
      await expect(adminPreviewMail(input)).rejects.toThrow("Forbidden");
      await expect(adminSendMail(input, "t")).rejects.toThrow("Forbidden");
    }
    expect(svc.preview).not.toHaveBeenCalled();
    expect(svc.send).not.toHaveBeenCalled();
  });

  it("passes the acting admin's id through", async () => {
    auth.role = "admin";
    await adminPreviewMail(input);
    await adminSendMail(input, "t");
    expect(svc.preview).toHaveBeenCalledWith({}, "admin-id", input);
    expect(svc.send).toHaveBeenCalledWith({}, "admin-id", input, "t");
  });
});
