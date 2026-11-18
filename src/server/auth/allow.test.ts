import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createTestDb } from "@/db/test-db";
import { EmailNotAllowedError } from "@/lib/auth-allow";
import { setSetting } from "@/server/data/settings";
import { assertEmailAllowed, isDisposableDomain } from "./allow";
import { DISPOSABLE_DOMAINS, DISPOSABLE_DOMAINS_SOURCE_COMMIT } from "./disposable-domains";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await setSetting(db, "approved_emails", { emails: ["grad@gmail.com", "odd@mailinator.com"] }, null);
});
afterAll(() => close());

const refusal = async (raw: string) => {
  try {
    await assertEmailAllowed(db, raw);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(EmailNotAllowedError);
    return (e as EmailNotAllowedError).result.reason;
  }
};

describe("assertEmailAllowed (the server's one gate)", () => {
  it("gives school addresses and the admin's the student tier", async () => {
    expect(await assertEmailAllowed(db, "JDoe@uvm.edu")).toEqual({ email: "jdoe@uvm.edu", tier: "student" });
    expect(await assertEmailAllowed(db, "jane.smith@mymail.champlain.edu")).toEqual({ email: "jane.smith@mymail.champlain.edu", tier: "student" });
    expect(await assertEmailAllowed(db, "staff.person@champlain.edu")).toMatchObject({ tier: "student" });
    expect(await assertEmailAllowed(db, "admin@catamountsublets.com")).toMatchObject({ tier: "student" });
  });

  it("gives any other real address the community tier", async () => {
    expect(await assertEmailAllowed(db, "Someone@Gmail.com")).toEqual({ email: "someone@gmail.com", tier: "community" });
    expect(await assertEmailAllowed(db, "x@uvm.edu.evil.com")).toMatchObject({ tier: "community" });
  });

  it("makes an approved address a student, even on a throwaway domain the admin chose to approve", async () => {
    expect(await assertEmailAllowed(db, "grad@gmail.com")).toEqual({ email: "grad@gmail.com", tier: "student" });
    expect(await assertEmailAllowed(db, "odd@mailinator.com")).toMatchObject({ tier: "student" });
  });

  it("refuses throwaway domains and their subdomains", async () => {
    expect(await refusal("x@mailinator.com")).toBe("disposable");
    expect(await refusal("x@guerrillamail.com")).toBe("disposable");
    expect(await refusal("x@inbox.mailinator.com")).toBe("disposable");
  });

  it("refuses the UVM first.last alias and junk, as before", async () => {
    expect(await refusal("jane.smith@uvm.edu")).toBe("dotted_local_part");
    expect(await refusal("nope")).toBe("invalid");
  });
});

describe("the vendored disposable list", () => {
  it("is pinned to a commit, holds thousands of domains, and none we must accept", () => {
    expect(DISPOSABLE_DOMAINS_SOURCE_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(DISPOSABLE_DOMAINS.size).toBeGreaterThan(1000);
    for (const d of ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "uvm.edu", "champlain.edu", "mymail.champlain.edu"]) {
      expect(isDisposableDomain(d)).toBe(false);
    }
  });

  it("matches parents but never a bare top-level domain", () => {
    expect(isDisposableDomain("a.b.mailinator.com")).toBe(true);
    expect(isDisposableDomain("com")).toBe(false);
  });
});
