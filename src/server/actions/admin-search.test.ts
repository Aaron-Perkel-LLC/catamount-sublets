import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ role: "user" as string | null }));
const search = vi.hoisted(() => vi.fn(async () => ["id-1"]));
const quick = vi.hoisted(() => vi.fn(async () => ({ listings: [{ id: 7, label: "1 Main St", status: "open" }], people: [] })));

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
vi.mock("@/server/services/admin", () => ({ searchPeopleIds: search, quickFind: quick }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { adminQuickFind, adminSearchPeople } = await import("./admin");

describe("adminSearchPeople", () => {
  beforeEach(() => search.mockClear());

  it("refuses anyone who isn't an admin, before searching", async () => {
    auth.role = "user";
    await expect(adminSearchPeople("jane")).rejects.toThrow("Forbidden");
    auth.role = null;
    await expect(adminSearchPeople("jane")).rejects.toThrow("Forbidden");
    expect(search).not.toHaveBeenCalled();
  });

  it("searches for an admin, and refuses an over-long query without searching", async () => {
    auth.role = "admin";
    expect(await adminSearchPeople(" jane ")).toEqual({ ok: true, data: { ids: ["id-1"] } });
    expect(search).toHaveBeenCalledWith({}, "jane");
    expect((await adminSearchPeople("x".repeat(101))).ok).toBe(false);
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("adminQuickFind", () => {
  beforeEach(() => quick.mockClear());

  it("refuses anyone who isn't an admin, before looking anything up", async () => {
    auth.role = "user";
    await expect(adminQuickFind("#7")).rejects.toThrow("Forbidden");
    auth.role = null;
    await expect(adminQuickFind("#7")).rejects.toThrow("Forbidden");
    expect(quick).not.toHaveBeenCalled();
  });

  it("finds for an admin, trimmed; an over-long query finds nothing without a lookup", async () => {
    auth.role = "admin";
    expect((await adminQuickFind(" #7 ")).listings).toHaveLength(1);
    expect(quick).toHaveBeenCalledWith({}, "#7");
    expect(await adminQuickFind("x".repeat(101))).toEqual({ listings: [], people: [] });
    expect(quick).toHaveBeenCalledTimes(1);
  });
});
