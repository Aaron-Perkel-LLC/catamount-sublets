import { describe, expect, it } from "vitest";
import { DIGEST_UNSUBSCRIBE_DAYS, signDigestUnsubscribe, verifyDigestUnsubscribe } from "./digest-token";
import { signOutcomeToken } from "./outcome-token";
import { signSurveyToken } from "./survey-token";

const ID = "3f1e2d4c-5b6a-4789-8abc-def012345678";

describe("digest unsubscribe token", () => {
  it("names the account it was signed for", () => {
    expect(verifyDigestUnsubscribe(signDigestUnsubscribe(ID))).toEqual({ userId: ID });
  });

  it("works for a year and not after", () => {
    const sent = new Date("2026-11-23T13:00:00Z");
    const t = signDigestUnsubscribe(ID, sent);
    expect(verifyDigestUnsubscribe(t, new Date(sent.getTime() + (DIGEST_UNSUBSCRIBE_DAYS - 1) * 86_400_000))).toEqual({ userId: ID });
    expect(verifyDigestUnsubscribe(t, new Date(sent.getTime() + (DIGEST_UNSUBSCRIBE_DAYS + 1) * 86_400_000))).toBeNull();
  });

  it("refuses a forged or altered token", () => {
    const t = signDigestUnsubscribe(ID);
    const [, expiry, sig] = t.split(".");
    const other = "00000000-0000-4000-8000-000000000000";
    expect(verifyDigestUnsubscribe(`${other}.${expiry}.${sig}`)).toBeNull();
    expect(verifyDigestUnsubscribe(`${ID}.${Number(expiry) + 1}.${sig}`)).toBeNull();
    expect(verifyDigestUnsubscribe(`${ID}.${expiry}.${"0".repeat(32)}`)).toBeNull();
  });

  it("refuses other kinds of signed link, and they refuse it", async () => {
    expect(verifyDigestUnsubscribe(signSurveyToken(ID))).toBeNull();
    expect(verifyDigestUnsubscribe(signOutcomeToken(187))).toBeNull();
    const { verifySurveyToken } = await import("./survey-token");
    expect(verifySurveyToken(signDigestUnsubscribe(ID))).toBeNull();
  });

  it("refuses junk", () => {
    for (const t of ["", "x", `${ID}..`, `${ID}.1.2`, 42, null, undefined, { t: 1 }, "a".repeat(500)]) expect(verifyDigestUnsubscribe(t)).toBeNull();
  });

  it("will only sign a user id", () => {
    expect(() => signDigestUnsubscribe("not-an-id")).toThrow();
  });
});
