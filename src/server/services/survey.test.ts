import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { listings, rateLimitBuckets, siteSettings, surveyResponses, user } from "@/db/schema";
import { signSurveyToken } from "@/server/survey-token";
import { submitSurvey, surveyPageState } from "./survey";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
let jordan: string;
let token: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await db.delete(surveyResponses);
  await db.delete(rateLimitBuckets);
  await db.delete(siteSettings);
  await db.delete(listings);
  await db.delete(user);
  const [u] = await db.insert(user).values({ email: "jordan@uvm.edu", name: "Jordan Nguyen", firstName: "Jordan", lastName: "Nguyen" }).returning({ id: user.id });
  jordan = u.id;
  token = signSurveyToken(jordan);
});

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ t: token, website: "", ...fields })) for (const one of [v].flat()) fd.append(k, one);
  return fd;
}

const GOOD = { used: "both", outcome: "found", overall: "4", useful: ["map", "filters"], signin: "easy", vsLegacy: "better", problems: "The map is slow.", recommend: "5", lejer: "would_try", followup: "on" };

describe("submitSurvey", () => {
  it("stores the answers for the account the link names, and replaces them on a second save", async () => {
    expect(await submitSurvey(db, form(GOOD), "203.0.113.5")).toEqual({ ok: true, replaced: false });
    const rows = await db.select().from(surveyResponses);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: jordan, used: "both", outcome: "found", overall: 4, useful: ["map", "filters"], signin: "easy", vsLegacy: "better", problems: "The map is slow.", missing: "", recommend: 5, lejer: "would_try", followup: true });

    expect(await submitSurvey(db, form({ ...GOOD, overall: "2", useful: [] }), "203.0.113.5")).toEqual({ ok: true, replaced: true });
    const again = await db.select().from(surveyResponses);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ overall: 2, useful: [] });
  });

  it("drops the usage answers for someone who has not used the site yet", async () => {
    expect((await submitSurvey(db, form({ ...GOOD, used: "not_yet" }), "203.0.113.5")).ok).toBe(true);
    const [row] = await db.select().from(surveyResponses);
    expect(row).toMatchObject({ used: "not_yet", outcome: null, useful: [], signin: null, vsLegacy: null, overall: 4, recommend: 5, lejer: "would_try" });
  });

  it("refuses a forged, expired or missing link and stores nothing", async () => {
    const [id, exp, sig] = token.split(".");
    const forged = `${id}.${exp}.${sig[0] === "0" ? "1" : "0"}${sig.slice(1)}`;
    const expired = signSurveyToken(jordan, new Date(Date.now() - 61 * 86_400_000));
    for (const t of [forged, expired, "", "garbage"]) {
      const r = await submitSurvey(db, form({ ...GOOD, t }), "203.0.113.5");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/isn't valid/);
    }
    expect(await db.select().from(surveyResponses)).toHaveLength(0);
  });

  it("refuses a link for a banned or deleted account the same way", async () => {
    await db.update(user).set({ banned: true });
    expect(await submitSurvey(db, form(GOOD), "203.0.113.5")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't valid/) });
    const gone = signSurveyToken(crypto.randomUUID());
    expect(await submitSurvey(db, form({ ...GOOD, t: gone }), "203.0.113.5")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't valid/) });
    expect(await db.select().from(surveyResponses)).toHaveLength(0);
  });

  it("says thanks to the honeypot and stores nothing", async () => {
    expect((await submitSurvey(db, form({ ...GOOD, website: "http://spam.example" }), "203.0.113.5")).ok).toBe(true);
    expect(await db.select().from(surveyResponses)).toHaveLength(0);
  });

  it("says which answers are wrong", async () => {
    const r = await submitSurvey(db, form({ ...GOOD, used: "", overall: "9" }), "203.0.113.5");
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["overall", "used"]);
    expect(await db.select().from(surveyResponses)).toHaveLength(0);
  });

  it("refuses the eleventh save from one address in an hour", async () => {
    for (let i = 0; i < 10; i++) expect((await submitSurvey(db, form(GOOD), "198.51.100.7")).ok).toBe(true);
    const r = await submitSurvey(db, form(GOOD), "198.51.100.7");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/lot of saves/) });
  });

  it("refuses while the site is read-only", async () => {
    await db.insert(siteSettings).values({ key: "read_only", value: { active: true, message: "Back soon." } });
    expect(await submitSurvey(db, form(GOOD), "203.0.113.5")).toMatchObject({ ok: false, error: "Back soon." });
  });
});

describe("surveyPageState", () => {
  it("opens for a good link, with the earlier answers once there are some", async () => {
    expect(await surveyPageState(db, token)).toEqual({ state: "open", firstName: "Jordan", existing: null });
    await submitSurvey(db, form(GOOD), "203.0.113.5");
    const page = await surveyPageState(db, token);
    expect(page.state === "open" && page.existing).toMatchObject({ used: "both", overall: 4, answeredAt: expect.any(Date) });
  });

  it("is invalid for anything else", async () => {
    expect(await surveyPageState(db, "")).toEqual({ state: "invalid" });
    expect(await surveyPageState(db, `${token}x`)).toEqual({ state: "invalid" });
    await db.update(user).set({ banned: true });
    expect(await surveyPageState(db, token)).toEqual({ state: "invalid" });
  });
});

describe("on a deployment without SURVEY_SECRET", () => {
  it("every link is invalid and nothing can be stored", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SURVEY_SECRET", undefined);
    expect(await surveyPageState(db, token)).toEqual({ state: "invalid" });
    expect(await submitSurvey(db, form(GOOD), "203.0.113.5")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't valid/) });
    expect(await db.select().from(surveyResponses)).toHaveLength(0);
  });
});
