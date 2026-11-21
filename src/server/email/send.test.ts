import { describe, expect, it, vi } from "vitest";
import { SITE } from "@/config/site";
import { apiKeyFor, isTestAddress, senderFor } from "./send";

describe("isTestAddress", () => {
  it("knows the seed, fixture and example addresses", () => {
    for (const e of ["seed1@uvm.edu", "SEED12@uvm.edu", "poster@uvm.edu", "other@uvm.edu", "viewer@uvm.edu", "jsmith@uvm.edu", "gone@uvm.edu", "a@example.com", "x@foo.test", "y@foo.invalid"]) {
      expect(isTestAddress(e), e).toBe(true);
    }
  });
  it("leaves real addresses alone", () => {
    for (const e of ["jdoe@uvm.edu", "seeder@uvm.edu", "jsmith2@uvm.edu", "aaron@catamountsublets.com", "testa@uvm.edu"]) {
      expect(isTestAddress(e), e).toBe(false);
    }
  });
});

describe("senderFor", () => {
  it("sends codes from the transactional address, notices from their own, signed notes from the author", () => {
    expect(senderFor("login_code")).toBe(SITE.mailFrom);
    expect(senderFor("admin_notice")).toBe(SITE.mailFromNotices);
    expect(senderFor("access_request")).toBe(SITE.mailFromNotices);
    for (const kind of ["email_direct", "welcome"] as const) expect(senderFor(kind), kind).toBe(SITE.mailFromPersonal);
    expect(senderFor("email_group")).toBe(SITE.mailFromGroup);
  });
});

describe("apiKeyFor", () => {
  it("sends the digest and the admin's group email, and only those, with the key scoped to the bulk subdomain, never falling back to the root key", () => {
    vi.stubEnv("RESEND_API_KEY", "re_root");
    try {
      expect(senderFor("digest")).toBe(SITE.mailFromDigest);
      expect(apiKeyFor("digest", "re_updates")).toEqual({ key: "re_updates", name: "RESEND_DIGEST_API_KEY" });
      expect(apiKeyFor("digest", undefined)).toEqual({ key: undefined, name: "RESEND_DIGEST_API_KEY" });
      expect(senderFor("email_group")).toContain(`@${SITE.mailDigestDomain}>`);
      expect(apiKeyFor("email_group", "re_updates")).toEqual({ key: "re_updates", name: "RESEND_DIGEST_API_KEY" });
      for (const kind of ["login_code", "admin_notice", "access_request", "welcome", "survey_invite", "email_direct", "outcome_ask"] as const)
        expect(apiKeyFor(kind, "re_updates"), kind).toEqual({ key: "re_root", name: "RESEND_API_KEY" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
