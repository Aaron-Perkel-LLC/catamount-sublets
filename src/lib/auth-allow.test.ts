import { describe, expect, it } from "vitest";
import { assertEmailAllowed, checkEmailAllowed, EmailNotAllowedError, normalizeEmail } from "./auth-allow";

describe("checkEmailAllowed", () => {
  it("accepts NetID-form addresses on an allowed domain, normalized", () => {
    expect(checkEmailAllowed("  JSmith@UVM.edu ")).toEqual({ ok: true, email: "jsmith@uvm.edu" });
    expect(checkEmailAllowed("jdoe@uvm.edu")).toEqual({ ok: true, email: "jdoe@uvm.edu" });
  });

  it("accepts the exact-address exceptions (NEXT_PUBLIC_ADMIN_EMAILS, set in vitest.config.mts)", () => {
    expect(checkEmailAllowed("Admin@catamountsublets.com")).toEqual({ ok: true, email: "admin@catamountsublets.com" });
  });

  it("refuses other domains", () => {
    expect(checkEmailAllowed("someone@gmail.com")).toMatchObject({ ok: false, reason: "domain" });
    expect(checkEmailAllowed("someone@catamountsublets.com")).toMatchObject({ ok: false, reason: "domain" });
    expect(checkEmailAllowed("someone@uvm.edu.evil.com")).toMatchObject({ ok: false, reason: "domain" });
  });

  it("refuses the First.Last form of a UVM address", () => {
    expect(checkEmailAllowed("Jane.Smith@uvm.edu")).toMatchObject({ ok: false, reason: "dotted_local_part" });
  });

  it("refuses junk", () => {
    expect(checkEmailAllowed("")).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkEmailAllowed("not an email")).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkEmailAllowed("a@b")).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("assertEmailAllowed", () => {
  it("returns the normalized address or throws a typed error", () => {
    expect(assertEmailAllowed("JSMITH@uvm.edu")).toBe("jsmith@uvm.edu");
    expect(() => assertEmailAllowed("x@gmail.com")).toThrow(EmailNotAllowedError);
    try {
      assertEmailAllowed("jane.smith@uvm.edu");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailNotAllowedError);
      expect((e as EmailNotAllowedError).message).toMatch(/NetID email \(netid@uvm\.edu\)/);
    }
  });
});

it("normalizeEmail lowercases and trims", () => {
  expect(normalizeEmail(" A@B.CO ")).toBe("a@b.co");
});
