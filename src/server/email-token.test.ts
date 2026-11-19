import { describe, expect, it } from "vitest";
import { signDigestUnsubscribe, verifyDigestUnsubscribe } from "./digest-token";
import { ANNOUNCE_UNSUBSCRIBE_DAYS, signAnnounceUnsubscribe, verifyAnnounceUnsubscribe } from "./email-token";

const USER = "00000000-0000-4000-8000-000000000001";

describe("the announcement unsubscribe token", () => {
  it("names the account for a year, and nothing else passes for it", () => {
    const now = new Date("2026-11-19T15:00:00Z");
    const token = signAnnounceUnsubscribe(USER, now);
    expect(verifyAnnounceUnsubscribe(token, now)).toEqual({ userId: USER });
    expect(verifyAnnounceUnsubscribe(token, new Date(now.getTime() + (ANNOUNCE_UNSUBSCRIBE_DAYS - 1) * 86_400_000))).toEqual({ userId: USER });
    expect(verifyAnnounceUnsubscribe(token, new Date(now.getTime() + (ANNOUNCE_UNSUBSCRIBE_DAYS + 1) * 86_400_000))).toBeNull();
    expect(verifyAnnounceUnsubscribe(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"), now)).toBeNull();
    for (const bad of ["", "x", null, 7, "a".repeat(200)]) expect(verifyAnnounceUnsubscribe(bad, now)).toBeNull();
    expect(() => signAnnounceUnsubscribe("not-a-user")).toThrow();
  });

  it("is not a digest link, nor a digest link one of these", () => {
    expect(verifyDigestUnsubscribe(signAnnounceUnsubscribe(USER))).toBeNull();
    expect(verifyAnnounceUnsubscribe(signDigestUnsubscribe(USER))).toBeNull();
  });
});
