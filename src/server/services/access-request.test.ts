import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import { accessRequests, rateLimitBuckets, siteSettings } from "@/db/schema";
import { parseAccessRequest } from "@/lib/access-request";
import { sentInTests } from "@/server/email/send";
import { submitAccessRequest } from "./access-request";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(accessRequests);
  await db.delete(rateLimitBuckets);
  await db.delete(siteSettings);
  sentInTests.length = 0;
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ website: "", school: "", message: "", ...fields })) fd.set(k, v);
  return fd;
}

const school = { kind: "school", name: "Sam Rivera", email: "Sam@Example.org", school: "Champlain College" };
const access = { kind: "access", name: "Sam Rivera", email: "sam@example.org", message: "I graduated in May and still hold the lease." };

describe("parseAccessRequest", () => {
  it("needs a school for a school request and a reason for an access request", () => {
    const a = parseAccessRequest(form({ ...school, school: "" }));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.fieldErrors.school).toBeTruthy();
    const b = parseAccessRequest(form({ ...access, message: "pls" }));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.fieldErrors.message).toBeTruthy();
  });

  it("refuses a bad kind and a bad email, and lowercases a good one", () => {
    const bad = parseAccessRequest(form({ ...school, kind: "admin", email: "nope" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["email", "kind"]);
    const good = parseAccessRequest(form(school));
    expect(good.ok && good.data.email).toBe("sam@example.org");
  });
});

describe("submitAccessRequest", () => {
  it("stores the request and mails the admin with Reply-To the person", async () => {
    const r = await submitAccessRequest(db, form(school), "203.0.113.5");
    expect(r).toEqual({ ok: true });
    const rows = await db.select().from(accessRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "school", name: "Sam Rivera", email: "sam@example.org", school: "Champlain College" });
    expect(sentInTests).toHaveLength(1);
    expect(sentInTests[0]).toMatchObject({ to: "admin@catamountsublets.com", kind: "access_request" });
    expect(sentInTests[0].text).toContain("Champlain College");
  });

  it("says thanks to the honeypot and stores nothing", async () => {
    const r = await submitAccessRequest(db, form({ ...access, website: "http://spam.example" }), "203.0.113.5");
    expect(r.ok).toBe(true);
    expect(await db.select().from(accessRequests)).toHaveLength(0);
    expect(sentInTests).toHaveLength(0);
  });

  it("says which field is wrong", async () => {
    const r = await submitAccessRequest(db, form({ ...access, message: "" }), "203.0.113.5");
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors ?? {})).toEqual(["message"]);
  });

  it("refuses the sixth request from one IP in an hour", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await submitAccessRequest(db, form({ ...access, email: `p${i}@example.org` }), "198.51.100.7");
      expect(r.ok).toBe(true);
    }
    const sixth = await submitAccessRequest(db, form({ ...access, email: "p9@example.org" }), "198.51.100.7");
    expect(sixth.ok).toBe(false);
    expect(await db.select().from(accessRequests)).toHaveLength(5);
  });

  it("refuses a fourth request for one reply address in a day", async () => {
    for (let i = 0; i < 3; i++) expect((await submitAccessRequest(db, form(access), `192.0.2.${i}`)).ok).toBe(true);
    expect((await submitAccessRequest(db, form(access), "192.0.2.99")).ok).toBe(false);
  });

  it("refuses while the site is read-only", async () => {
    await db.insert(siteSettings).values({ key: "read_only", value: { active: true, message: "Back soon." } });
    const r = await submitAccessRequest(db, form(school), "203.0.113.5");
    expect(r).toMatchObject({ ok: false, error: "Back soon." });
  });
});
