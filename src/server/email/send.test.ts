import { describe, expect, it } from "vitest";
import { SITE } from "@/config/site";
import { apiKeyEnvFor, isTestAddress, senderFor } from "./send";

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
    for (const kind of ["broadcast", "broadcast_copy", "welcome"] as const) expect(senderFor(kind), kind).toBe(SITE.mailFromPersonal);
  });
});

describe("apiKeyEnvFor", () => {
  it("sends the digest, and only the digest, with the key scoped to its subdomain", () => {
    expect(senderFor("digest")).toBe(SITE.mailFromDigest);
    expect(apiKeyEnvFor("digest")).toBe("RESEND_DIGEST_API_KEY");
    for (const kind of ["login_code", "admin_notice", "access_request", "welcome", "broadcast", "broadcast_copy", "survey_invite", "admin_message", "outcome_ask", "stale_notice"] as const)
      expect(apiKeyEnvFor(kind), kind).toBe("RESEND_API_KEY");
  });
});
