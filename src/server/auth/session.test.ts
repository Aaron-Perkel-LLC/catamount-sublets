import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";

/**
 * getSessionUser() reads the session from the database on every request, not
 * from better-auth's five-minute signed cookie cache: a ban, a deleted
 * session or a changed tier takes effect at once (phase 31 review). The
 * cookies come from a real sign-in through better-auth.
 */
const h = vi.hoisted(() => ({ db: null as unknown as Db, cookie: "" }));
vi.mock("@/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db")>()), getDb: async () => h.db }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: h.cookie }) }));

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { buildAuth } = await import("./config");
const { getSessionUser } = await import("./index");
const { sentInTests } = await import("@/server/email/send");

let close: () => Promise<void>;
let auth: ReturnType<typeof buildAuth>;

beforeAll(async () => {
  ({ db: h.db, close } = await createTestDb());
  auth = buildAuth(h.db);
});
afterAll(() => close());

async function signIn(email: string): Promise<string> {
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  const code = String(sentInTests.at(-1)!.subject).split(" ")[0];
  const res = await auth.api.signInEmailOTP({ body: { email, otp: code }, returnHeaders: true });
  // Every Set-Cookie (the session token and the signed session_data cache) as one Cookie header.
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("getSessionUser", () => {
  it("carries the tier, and sees a tier change at once despite the cookie cache", async () => {
    h.cookie = await signIn("robin@gmail.com");
    expect(h.cookie).toContain("session_data"); // the cache cookie is really there
    expect((await getSessionUser())?.tier).toBe("community");
    await h.db.update(s.user).set({ tier: "student" }).where(eq(s.user.email, "robin@gmail.com"));
    expect((await getSessionUser())?.tier).toBe("student");
  });

  it("is signed out the moment the session rows are deleted (a ban, a tier switch)", async () => {
    h.cookie = await signIn("jdoe@uvm.edu");
    expect((await getSessionUser())?.email).toBe("jdoe@uvm.edu");
    const [u] = await h.db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, "jdoe@uvm.edu"));
    await h.db.delete(s.session).where(eq(s.session.userId, u.id));
    expect(await getSessionUser()).toBeNull();
    // Positive control: better-auth's own cached read would still have said yes.
    expect(await auth.api.getSession({ headers: new Headers({ cookie: h.cookie }) })).not.toBeNull();
  });
});
