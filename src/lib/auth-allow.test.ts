import { describe, expect, it } from "vitest";
import { checkEmailAllowed, emailRefusalMessage, normalizeEmail, schoolOfDomain, tierForEmail } from "./auth-allow";

describe("checkEmailAllowed: tiers", () => {
  it("makes a UVM NetID address a student, normalized", () => {
    expect(checkEmailAllowed("  JSmith@UVM.edu ")).toEqual({ ok: true, email: "jsmith@uvm.edu", tier: "student", school: "uvm" });
    expect(checkEmailAllowed("jdoe@uvm.edu")).toMatchObject({ ok: true, tier: "student" });
  });

  it("still refuses the First.Last form of a UVM address, with the NetID hint", () => {
    const r = checkEmailAllowed("Jane.Smith@uvm.edu");
    expect(r).toMatchObject({ ok: false, reason: "dotted_local_part" });
    expect(emailRefusalMessage("dotted_local_part")).toMatch(/NetID email \(netid@uvm\.edu\)/);
  });

  it("makes any Champlain student or staff address a student, first.last included", () => {
    expect(checkEmailAllowed("Jane.Smith@mymail.champlain.edu")).toEqual({ ok: true, email: "jane.smith@mymail.champlain.edu", tier: "student", school: "champlain" });
    expect(checkEmailAllowed("jsmith@mymail.champlain.edu")).toMatchObject({ ok: true, tier: "student" });
    expect(checkEmailAllowed("prof.jones@champlain.edu")).toMatchObject({ ok: true, tier: "student", school: "champlain" });
  });

  it("makes the admin's own address a student whatever its domain (NEXT_PUBLIC_ADMIN_EMAILS, set in vitest.config.mts)", () => {
    expect(checkEmailAllowed("Admin@catamountsublets.com")).toEqual({ ok: true, email: "admin@catamountsublets.com", tier: "student", school: null });
  });

  it("makes every other valid address a community account", () => {
    for (const e of ["someone@gmail.com", "first.last@outlook.com", "someone@catamountsublets.com"]) {
      expect(checkEmailAllowed(e)).toMatchObject({ ok: true, tier: "community", school: null });
    }
  });

  it("matches school domains exactly: look-alikes and subdomains are community, never students", () => {
    for (const e of ["x@uvm.edu.evil.com", "x@champlain.edu.evil.com", "x@evilchamplain.edu", "x@med.uvm.edu", "x@notmymail.champlain.edu.co", "x@uvm.edux"]) {
      expect(checkEmailAllowed(e)).toMatchObject({ ok: true, tier: "community" });
    }
    // A dotted local part on a look-alike is not UVM's rule to apply.
    expect(checkEmailAllowed("jane.smith@uvm.edu.evil.com")).toMatchObject({ ok: true, tier: "community" });
  });

  it("refuses junk", () => {
    expect(checkEmailAllowed("")).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkEmailAllowed("not an email")).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkEmailAllowed("a@b")).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkEmailAllowed(`${"a".repeat(250)}@b.co`)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("tierForEmail and schoolOfDomain", () => {
  it("agree with checkEmailAllowed and know nothing of approvals", () => {
    expect(tierForEmail("jdoe@uvm.edu")).toBe("student");
    expect(tierForEmail("a.b@mymail.champlain.edu")).toBe("student");
    expect(tierForEmail("someone@gmail.com")).toBe("community");
    expect(tierForEmail("jane.smith@uvm.edu")).toBeNull();
    expect(schoolOfDomain("champlain.edu")?.key).toBe("champlain");
    expect(schoolOfDomain("gmail.com")).toBeNull();
  });
});

it("normalizeEmail lowercases and trims", () => {
  expect(normalizeEmail(" A@B.CO ")).toBe("a@b.co");
});
