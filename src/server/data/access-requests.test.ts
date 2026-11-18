import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import { eq } from "drizzle-orm";
import { accessRequests, otpSends, rateLimitBuckets, session, siteSettings, user } from "@/db/schema";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { buildAuth } from "@/server/auth/config";
import { sentInTests } from "@/server/email/send";
import {
  approveAccessRequest,
  approvedEmails,
  createAccessRequest,
  dismissAccessRequest,
  isEmailApproved,
  listPendingAccessRequests,
  revokeApprovedEmail,
} from "./access-requests";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
let adminId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(accessRequests);
  await db.delete(siteSettings);
  await db.delete(rateLimitBuckets);
  await db.delete(user);
  sentInTests.length = 0;
  const [a] = await db.insert(user).values({ id: crypto.randomUUID(), email: "admin@uvm.edu", name: "Admin", emailVerified: true, role: "admin" }).returning();
  adminId = a.id;
});

const request = (email: string) => createAccessRequest(db, { kind: "access", name: "Sam Rivera", email, school: "", message: "I graduated in May and still hold the lease.", website: "" });

describe("access request approvals", () => {
  it("approve closes the request and lets its address in, once", async () => {
    const id = await request("sam@example.org");
    expect(await listPendingAccessRequests(db)).toHaveLength(1);
    expect(await approveAccessRequest(db, id, adminId)).toBe("sam@example.org");
    expect(await listPendingAccessRequests(db)).toHaveLength(0);
    expect(await isEmailApproved(db, "Sam@Example.org")).toBe(true);
    expect(await approveAccessRequest(db, id, adminId)).toBeNull();
    expect(await approvedEmails(db)).toEqual(["sam@example.org"]);
  });

  it("dismiss closes without approving; revoke removes an approval", async () => {
    const a = await request("sam@example.org");
    const b = await request("lee@example.org");
    expect(await dismissAccessRequest(db, a)).toBe(true);
    expect(await dismissAccessRequest(db, a)).toBe(false);
    expect(await isEmailApproved(db, "sam@example.org")).toBe(false);
    await approveAccessRequest(db, b, adminId);
    expect(await revokeApprovedEmail(db, "LEE@example.org", adminId)).toBe(true);
    expect(await revokeApprovedEmail(db, "lee@example.org", adminId)).toBe(false);
    expect(await approvedEmails(db)).toEqual([]);
  });
});

describe("sign-in through better-auth: tiers, approvals and the new-account limits", () => {
  let n = 0;
  /** A fresh IP per call unless given, so the per-IP code limits never get in the way. */
  const from = (ip = `198.51.100.${++n}`) => new Headers({ "x-forwarded-for": ip });
  const signIn = async (auth: ReturnType<typeof buildAuth>, email: string, ip?: string) => {
    const headers = from(ip);
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers });
    const code = String(sentInTests.at(-1)!.subject).split(" ")[0];
    await auth.api.signInEmailOTP({ body: { email, otp: code }, headers });
    const [row] = await db.select({ tier: user.tier }).from(user).where(eq(user.email, email.toLowerCase()));
    return row?.tier;
  };

  it("makes school addresses students and any other address a community account", async () => {
    const auth = buildAuth(db);
    expect(await signIn(auth, "jdoe@uvm.edu")).toBe("student");
    expect(await signIn(auth, "Jane.Smith@mymail.champlain.edu")).toBe("student");
    expect(await signIn(auth, "prof.x@champlain.edu")).toBe("student");
    expect(await signIn(auth, "robin@gmail.com")).toBe("community");
  });

  it("refuses throwaway domains and the UVM alias before any code is sent", async () => {
    const auth = buildAuth(db);
    await expect(auth.api.sendVerificationOTP({ body: { email: "x@mailinator.com", type: "sign-in" }, headers: from() })).rejects.toThrow(/throwaway/);
    await expect(auth.api.sendVerificationOTP({ body: { email: "jane.smith@uvm.edu", type: "sign-in" }, headers: from() })).rejects.toThrow(/NetID/);
    expect(sentInTests).toHaveLength(0);
  });

  it("an approved address signs in as a student; approving an existing community account promotes it and signs it out", async () => {
    const auth = buildAuth(db);
    await approveAccessRequest(db, await request("sam@example.org"), adminId);
    expect(await signIn(auth, "Sam@Example.org")).toBe("student");

    expect(await signIn(auth, "lee@example.org")).toBe("community");
    const [lee] = await db.select({ id: user.id }).from(user).where(eq(user.email, "lee@example.org"));
    expect(await db.select().from(session).where(eq(session.userId, lee.id))).toHaveLength(1);
    await approveAccessRequest(db, await request("lee@example.org"), adminId);
    expect((await db.select({ tier: user.tier }).from(user).where(eq(user.id, lee.id)))[0].tier).toBe("student");
    expect(await db.select().from(session).where(eq(session.userId, lee.id))).toHaveLength(0);
  });

  it("caps new community accounts per IP (students never count), only after a correct code", async () => {
    const auth = buildAuth(db);
    const ip = "203.0.113.7";
    for (let i = 0; i < RATE_LIMITS.communityAccountPerIp.limit; i++) expect(await signIn(auth, `c${i}@gmail.com`, ip)).toBe("community");
    await expect(signIn(auth, "one-too-many@gmail.com", ip)).rejects.toThrow(/Too many new accounts/);
    expect(await db.select().from(user).where(eq(user.email, "one-too-many@gmail.com"))).toHaveLength(0);
    // A student from the same network, and an existing community account signing in again, are not new community accounts.
    expect(await signIn(auth, "newkid@uvm.edu", ip)).toBe("student");
    await db.delete(otpSends); // past the 60 s resend cooldown
    expect(await signIn(auth, "c0@gmail.com", ip)).toBe("community");
  });

  it("caps new community accounts across the site per hour", async () => {
    const auth = buildAuth(db);
    for (let i = 0; i < RATE_LIMITS.communityAccountGlobal.limit; i++) await takeRateLimit(db, RATE_LIMITS.communityAccountGlobal, "all");
    await expect(signIn(auth, "late@gmail.com")).rejects.toThrow(/Too many new accounts/);
    expect(await signIn(auth, "still-fine@mymail.champlain.edu")).toBe("student");
  });
});
