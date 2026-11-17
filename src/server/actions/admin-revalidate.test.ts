import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The front page is cached for a minute and shows covers from the signed-out
 * board, so every admin change that can take a listing off that board must
 * refresh "/" at once, as the poster's own visibility switch does.
 */
const revalidated = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidated.push(p) }));
vi.mock("@/server/auth", () => ({ requireAdmin: async () => ({ id: "admin-id", role: "admin" }) }));
vi.mock("@/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/server/services/admin", () => {
  const ok = async () => ({ ok: true, data: undefined });
  return { adminSetStatus: ok, adminDeleteListing: ok, setBanned: ok, deletePerson: ok, toggleSemester: async () => ({ ok: true, data: { active: false } }) };
});

const actions = await import("./admin");
const USER = "00000000-0000-4000-8000-000000000001";

describe("admin changes that take a listing off the signed-out board refresh the front page", () => {
  beforeEach(() => {
    revalidated.length = 0;
  });

  it.each([
    ["a listing's status", () => actions.adminSetListingStatus(7, "paused")],
    ["deleting a listing", () => actions.adminDeleteListing(7)],
    ["a ban", () => actions.adminSetBanned(USER, true, null)],
    ["deleting a person", () => actions.adminDeletePerson(USER, false)],
    ["a semester switched off", () => actions.adminToggleSemester("spring27")],
  ])("%s", async (_, run) => {
    await run();
    expect(revalidated).toEqual(expect.arrayContaining(["/", "/browse", "/map"]));
  });

  it("not on a dry run that changes nothing", async () => {
    await actions.adminDeletePerson(USER, true);
    expect(revalidated).toEqual([]);
  });
});
