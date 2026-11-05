import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import type { SurveyAnswers } from "@/lib/survey";
import { getSurveyResponse, listSurveyText, surveyAudience, surveyExportRows, surveySummary, upsertSurveyResponse } from "./survey";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

const ANSWERS: SurveyAnswers = {
  used: "both",
  outcome: "found",
  overall: 4,
  useful: ["map", "filters"],
  signin: "easy",
  vsLegacy: "better",
  problems: "The map is slow on my phone.",
  missing: "",
  recommend: 5,
  lejer: "would_try",
  followup: true,
};

async function person(email: string, extra: Partial<typeof s.user.$inferInsert> = {}): Promise<string> {
  const [u] = await db.insert(s.user).values({ email, name: email.split("@")[0], ...extra }).returning({ id: s.user.id });
  return u.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(s.surveyResponses);
  await db.delete(s.listings);
  await db.delete(s.user);
});

describe("upsertSurveyResponse", () => {
  it("stores once per account and replaces on the second save", async () => {
    const id = await person("jordan@uvm.edu", { firstName: "Jordan", lastName: "Nguyen" });
    const first = await upsertSurveyResponse(db, id, ANSWERS);
    expect(first.replaced).toBe(false);
    expect(await getSurveyResponse(db, id)).toMatchObject({ ...ANSWERS, answeredAt: expect.any(Date) });

    const second = await upsertSurveyResponse(db, id, { ...ANSWERS, overall: 2, useful: [], followup: false });
    expect(second).toEqual({ id: first.id, replaced: true });
    expect(await db.select().from(s.surveyResponses)).toHaveLength(1);
    expect(await getSurveyResponse(db, id)).toMatchObject({ overall: 2, useful: [], followup: false });
  });

  it("is null before anyone has answered", async () => {
    const id = await person("jordan@uvm.edu");
    expect(await getSurveyResponse(db, id)).toBeNull();
  });

  it("goes with the account", async () => {
    const id = await person("jordan@uvm.edu");
    await upsertSurveyResponse(db, id, ANSWERS);
    await db.delete(s.user);
    expect(await db.select().from(s.surveyResponses)).toHaveLength(0);
  });
});

describe("the CHECK constraints", () => {
  // Drizzle wraps the database error; the constraint name is on the cause.
  const refused = (p: Promise<unknown>, constraint: RegExp) =>
    p.then(
      () => {
        throw new Error("the insert was accepted");
      },
      (e: Error & { cause?: Error }) => expect(`${e.message} ${e.cause?.message ?? ""}`).toMatch(constraint),
    );
  it("refuse a key outside the vocabulary, an element outside it, and a score off the scale", async () => {
    const id = await person("jordan@uvm.edu");
    await refused(db.insert(s.surveyResponses).values({ userId: id, used: "nope", overall: 3 }), /survey_responses_used_check/);
    await refused(db.insert(s.surveyResponses).values({ userId: id, used: "both", overall: 3, useful: ["map", "nope"] }), /survey_responses_useful_check/);
    await refused(db.insert(s.surveyResponses).values({ userId: id, used: "both", overall: 6 }), /survey_responses_overall_check/);
    await refused(db.insert(s.surveyResponses).values({ userId: id, used: "both", overall: 3, recommend: 0 }), /survey_responses_recommend_check/);
  });
});

describe("surveyAudience", () => {
  it("is every account except banned, admin and test addresses, most recently signed in first", async () => {
    const posted = await person("sam@uvm.edu", { firstName: "Sam", lastName: "Rivera", legacyNetid: "srivera", lastLoginAt: new Date("2026-10-20T12:00:00Z") });
    await db.insert(s.listings).values({ userId: posted, price: 900, address: "x", lat: 44.47, lon: -73.2 });
    await person("never@uvm.edu", { name: "never" });
    await person("admin@uvm.edu", { role: "admin", lastLoginAt: new Date() });
    await person("banned@uvm.edu", { banned: true, lastLoginAt: new Date() });
    await person("seed1@uvm.edu", { lastLoginAt: new Date() });
    await person("someone@example.com", { lastLoginAt: new Date() });

    const audience = await surveyAudience(db);
    expect(audience.map((r) => r.email)).toEqual(["sam@uvm.edu", "never@uvm.edu"]);
    expect(audience[0]).toMatchObject({ firstName: "Sam", migrated: true, posted: true });
    // A name that is only the login is never used as a greeting.
    expect(audience[1]).toMatchObject({ firstName: null, migrated: false, posted: false, lastLoginAt: null });
  });
});

describe("readers", () => {
  it("summarise, list the free text without addresses, and export with them", async () => {
    const jordan = await person("jordan@uvm.edu", { firstName: "Jordan", lastName: "Nguyen" });
    const sam = await person("sam@uvm.edu", { firstName: "Sam", lastName: "Rivera" });
    await db.insert(s.listings).values({ userId: sam, price: 900, address: "x", lat: 44.47, lon: -73.2 });
    await upsertSurveyResponse(db, jordan, ANSWERS);
    await upsertSurveyResponse(db, sam, { ...ANSWERS, used: "not_yet", outcome: null, useful: [], signin: null, vsLegacy: null, overall: 3, recommend: null, followup: false, problems: "" });

    const summary = await surveySummary(db);
    expect(summary).toMatchObject({ answered: 2, notYet: 1, followup: 1 });
    expect(summary.used.find((t) => t.key === "both")).toMatchObject({ n: 1, pct: 50 });
    expect(summary.useful.find((t) => t.key === "map")).toMatchObject({ n: 1, pct: 100 });
    expect(summary.overall).toEqual({ counts: [0, 0, 1, 1, 0], answered: 2, average: 3.5 });
    expect(summary.recommend).toEqual({ counts: [0, 0, 0, 0, 1], answered: 1, average: 5 });

    const text = await listSurveyText(db);
    expect(text).toHaveLength(2);
    for (const t of text) expect(t).not.toHaveProperty("email");
    expect(text.find((t) => t.userId === jordan)).toMatchObject({ firstName: "Jordan", posted: false, used: "both", overall: 4, problems: ANSWERS.problems, followup: true });
    expect(text.find((t) => t.userId === sam)).toMatchObject({ firstName: "Sam", posted: true, used: "not_yet" });

    const rows = await surveyExportRows(db);
    expect(rows.map((r) => r.email)).toEqual(["jordan@uvm.edu", "sam@uvm.edu"]);
    expect(rows[0]).toMatchObject({ ...ANSWERS, firstName: "Jordan", migrated: false, posted: false });
  });
});
