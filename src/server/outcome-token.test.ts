import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OUTCOME_TOKEN_DAYS, signOutcomeToken, verifyOutcomeToken } from "./outcome-token";
import { linkSecret, signLink } from "./signed-link";
import { signSurveyToken, verifySurveyToken } from "./survey-token";

const USER = "6f1d2a9c-3b4e-4f5a-8b6c-7d8e9f0a1b2c";
const DAY = 86_400_000;

afterEach(() => vi.unstubAllEnvs());

describe("outcome tokens", () => {
  it("round-trips the listing id", () => {
    const token = signOutcomeToken(187);
    expect(token.startsWith("187.")).toBe(true);
    expect(verifyOutcomeToken(token)).toEqual({ listingId: 187 });
  });

  it("work for at least 60 days from the send, and stop at OUTCOME_TOKEN_DAYS", () => {
    expect(OUTCOME_TOKEN_DAYS).toBeGreaterThanOrEqual(60);
    const sent = new Date("2026-12-10T15:00:00Z");
    const token = signOutcomeToken(42, sent);
    expect(verifyOutcomeToken(token, new Date(sent.getTime() + 60 * DAY))).toEqual({ listingId: 42 });
    expect(verifyOutcomeToken(token, new Date(sent.getTime() + (OUTCOME_TOKEN_DAYS - 1) * DAY))).toEqual({ listingId: 42 });
    expect(verifyOutcomeToken(token, new Date(sent.getTime() + OUTCOME_TOKEN_DAYS * DAY))).toBeNull();
  });

  it("refuse a tampered signature, listing or expiry", () => {
    const [id, exp, sig] = signOutcomeToken(42).split(".");
    const flipped = sig[0] === "0" ? "1" : "0";
    expect(verifyOutcomeToken(`${id}.${exp}.${flipped}${sig.slice(1)}`)).toBeNull();
    expect(verifyOutcomeToken(`43.${exp}.${sig}`)).toBeNull();
    expect(verifyOutcomeToken(`${id}.${Number(exp) + 1}.${sig}`)).toBeNull();
  });

  it("refuse anything that is not the token shape", () => {
    for (const bad of ["", "42", "42.1", `0.1.${"0".repeat(32)}`, `-4.1.${"0".repeat(32)}`, `042.1.${"0".repeat(32)}`, `42.1.${"0".repeat(31)}`, `42.1.${"G".repeat(32)}`]) {
      expect(verifyOutcomeToken(bad)).toBeNull();
    }
  });

  it("will not sign something that is not a listing id", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => signOutcomeToken(bad)).toThrow();
  });

  it("refuse an id past the integer column even when signed", () => {
    expect(verifyOutcomeToken(signLink("outcome", "9999999999", 1))).toBeNull();
  });

  it("are signed with SURVEY_SECRET, and stop verifying when it changes", () => {
    vi.stubEnv("SURVEY_SECRET", "secret-one");
    const token = signOutcomeToken(42);
    expect(verifyOutcomeToken(token)).toEqual({ listingId: 42 });
    vi.stubEnv("SURVEY_SECRET", "secret-two");
    expect(verifyOutcomeToken(token)).toBeNull();
  });

  it("on a deployment without SURVEY_SECRET, sign nothing and verify nothing", () => {
    const token = signOutcomeToken(42);
    vi.stubEnv("SURVEY_SECRET", undefined);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(verifyOutcomeToken(token)).toBeNull();
    expect(() => signOutcomeToken(42)).toThrow(/SURVEY_SECRET/);
  });
});

describe("purpose separation", () => {
  it("a signature made for one purpose does not verify as the other", () => {
    // Same subject and expiry, signed as a survey link: the outcome check must refuse it, and the reverse.
    const asSurvey = signLink("survey", "42", 30);
    expect(verifyOutcomeToken(asSurvey)).toBeNull();
    const asOutcome = signLink("outcome", USER, 30);
    expect(verifySurveyToken(asOutcome)).toBeNull();
    expect(verifyOutcomeToken(signSurveyToken(USER))).toBeNull();
    expect(verifySurveyToken(signOutcomeToken(42))).toBeNull();
  });
});

describe("survey links sent before signed-link.ts", () => {
  it("still verify: the signature is the same HMAC of 'survey:<user>.<expiry>'", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const sig = createHmac("sha256", linkSecret()!).update(`survey:${USER}.${expiresAt}`).digest("hex").slice(0, 32);
    expect(verifySurveyToken(`${USER}.${expiresAt}.${sig}`)).toEqual({ userId: USER });
    const now = new Date();
    const [, exp, newSig] = signSurveyToken(USER, now).split(".");
    expect(newSig).toBe(createHmac("sha256", linkSecret()!).update(`survey:${USER}.${exp}`).digest("hex").slice(0, 32));
  });
});
