import { afterEach, describe, expect, it, vi } from "vitest";
import { SURVEY_TOKEN_DAYS, signSurveyToken, surveySecret, verifySurveyToken } from "./survey-token";

const USER = "6f1d2a9c-3b4e-4f5a-8b6c-7d8e9f0a1b2c";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const DAY = 86_400_000;

afterEach(() => vi.unstubAllEnvs());

describe("survey tokens", () => {
  it("round-trips the user id", () => {
    const token = signSurveyToken(USER);
    expect(token.startsWith(`${USER}.`)).toBe(true);
    expect(verifySurveyToken(token)).toEqual({ userId: USER });
  });

  it("expires after SURVEY_TOKEN_DAYS", () => {
    const issued = new Date("2026-11-03T12:00:00Z");
    const token = signSurveyToken(USER, issued);
    expect(verifySurveyToken(token, new Date(issued.getTime() + (SURVEY_TOKEN_DAYS - 1) * DAY))).toEqual({ userId: USER });
    expect(verifySurveyToken(token, new Date(issued.getTime() + SURVEY_TOKEN_DAYS * DAY))).toBeNull();
  });

  it("refuses a tampered signature, user or expiry", () => {
    const token = signSurveyToken(USER);
    const [id, exp, sig] = token.split(".");
    const flipped = sig[0] === "0" ? "1" : "0";
    expect(verifySurveyToken(`${id}.${exp}.${flipped}${sig.slice(1)}`)).toBeNull();
    expect(verifySurveyToken(`${OTHER}.${exp}.${sig}`)).toBeNull();
    expect(verifySurveyToken(`${id}.${Number(exp) + 1}.${sig}`)).toBeNull();
  });

  it("signs different users differently", () => {
    const now = new Date();
    expect(signSurveyToken(USER, now)).not.toBe(signSurveyToken(OTHER, now));
  });

  it("refuses anything that is not the token shape", () => {
    for (const bad of ["", "garbage", USER, `${USER}.123`, `${USER}.abc.${"0".repeat(32)}`, `${USER.toUpperCase()}.1.${"0".repeat(32)}`, `${USER}.1.${"0".repeat(31)}`]) {
      expect(verifySurveyToken(bad)).toBeNull();
    }
  });
});

describe("the survey secret", () => {
  it("is SURVEY_SECRET; APP_SECRET plays no part", () => {
    vi.stubEnv("SURVEY_SECRET", "survey-secret-one");
    vi.stubEnv("APP_SECRET", "app-secret-one");
    const token = signSurveyToken(USER);
    vi.stubEnv("APP_SECRET", "app-secret-two");
    expect(verifySurveyToken(token)).toEqual({ userId: USER });
    vi.stubEnv("SURVEY_SECRET", "survey-secret-two");
    expect(verifySurveyToken(token)).toBeNull();
  });

  it("stands in with a fixed value locally and in tests, so a walkthrough works without one", () => {
    vi.stubEnv("SURVEY_SECRET", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(surveySecret()).toBe("development-only-survey-secret");
    expect(verifySurveyToken(signSurveyToken(USER))).toEqual({ userId: USER });
  });

  it("on a deployment without SURVEY_SECRET, signs nothing and verifies nothing", () => {
    vi.stubEnv("SURVEY_SECRET", "survey-secret-one");
    const token = signSurveyToken(USER);
    vi.stubEnv("SURVEY_SECRET", undefined);
    for (const env of ["production", "preview"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(surveySecret()).toBeNull();
      expect(verifySurveyToken(token)).toBeNull();
      expect(() => signSurveyToken(USER)).toThrow(/SURVEY_SECRET/);
    }
  });
});
