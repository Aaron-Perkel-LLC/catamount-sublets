import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import { accessRequests, rateLimitBuckets, siteSettings, user } from "@/db/schema";
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

describe("sign-in with an approval", () => {
  it("sends a code to an approved address and creates its account; still refuses an unapproved one", async () => {
    const auth = buildAuth(db);
    await expect(auth.api.sendVerificationOTP({ body: { email: "sam@example.org", type: "sign-in" } })).rejects.toThrow(/limited to/);
    expect(sentInTests).toHaveLength(0);

    await approveAccessRequest(db, await request("sam@example.org"), adminId);
    await auth.api.sendVerificationOTP({ body: { email: "Sam@Example.org", type: "sign-in" } });
    expect(sentInTests).toHaveLength(1);
    const code = String(sentInTests[0].subject).split(" ")[0];
    await auth.api.signInEmailOTP({ body: { email: "sam@example.org", otp: code } });
    const rows = await db.select({ email: user.email }).from(user);
    expect(rows.map((r) => r.email)).toContain("sam@example.org");

    await expect(auth.api.sendVerificationOTP({ body: { email: "lee@example.org", type: "sign-in" } })).rejects.toThrow(/limited to/);
  });
});
