import { describe, expect, it } from "vitest";
import { type SurveyAnswers, parseSurvey, summariseSurvey } from "./survey";

function form(fields: Record<string, string | string[] | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  }
  return fd;
}

const GOOD = { used: "both", outcome: "found", overall: "4", useful: ["map", "filters"], signin: "easy", vsLegacy: "better", problems: " The map is slow. ", missing: "", recommend: "5", lejer: "would_try", followup: "on", website: "" };

describe("parseSurvey", () => {
  it("accepts a full form, trims text and reads the multi-select and the checkbox", () => {
    const r = parseSurvey(form(GOOD));
    expect(r).toEqual({
      ok: true,
      data: { used: "both", outcome: "found", overall: 4, useful: ["map", "filters"], signin: "easy", vsLegacy: "better", problems: "The map is slow.", missing: "", recommend: 5, lejer: "would_try", followup: true, website: "" },
    });
  });

  it("needs only how they used it and the overall score", () => {
    const r = parseSurvey(form({ used: "looked", overall: "3" }));
    expect(r).toEqual({ ok: true, data: { used: "looked", outcome: null, overall: 3, useful: [], signin: null, vsLegacy: null, problems: "", missing: "", recommend: null, lejer: null, followup: false, website: "" } });
    const missing = parseSurvey(form({}));
    expect(missing).toEqual({ ok: false, fieldErrors: { used: "Pick one.", overall: "Pick a number from 1 to 5." } });
  });

  it("skips the usage questions for someone who has not used the site yet, even if the form sends them", () => {
    const r = parseSurvey(form({ ...GOOD, used: "not_yet" }));
    expect(r.ok && r.data).toMatchObject({ used: "not_yet", outcome: null, useful: [], signin: null, vsLegacy: null, overall: 4, recommend: 5, lejer: "would_try", followup: true });
    expect(parseSurvey(form({ used: "not_yet", overall: "2" })).ok).toBe(true);
  });

  it("refuses values outside the vocabulary, scores off the scale, long text and the honeypot", () => {
    const bad = parseSurvey(form({ ...GOOD, used: "sometimes", useful: ["map", "teleport"], overall: "7", recommend: "x", problems: "a".repeat(2001), website: "http://spam" }));
    expect(bad).toEqual({
      ok: false,
      fieldErrors: { used: "Pick one.", useful: "Pick from the list.", overall: "Pick a number from 1 to 5.", recommend: "Pick a number from 1 to 5.", problems: "Keep it under 2,000 characters.", website: "Leave this empty." },
    });
  });
});

describe("summariseSurvey", () => {
  const base: SurveyAnswers = { used: "looked", outcome: "found", overall: 4, useful: ["map"], signin: "easy", vsLegacy: "better", problems: "", missing: "", recommend: 5, lejer: "would_try", followup: false };
  const rows: SurveyAnswers[] = [
    base,
    { ...base, used: "posted", outcome: "filled", overall: 2, useful: ["map", "photos"], signin: "annoying", vsLegacy: null, recommend: null, lejer: null, followup: true },
    { ...base, used: "not_yet", outcome: null, overall: 3, useful: [], signin: null, vsLegacy: null, recommend: 3, lejer: "not_for_me" },
    { ...base, used: "looked", overall: 5, useful: [], signin: "fine", followup: true },
  ];

  it("counts, shares and averages", () => {
    const s = summariseSurvey(rows);
    expect(s).toMatchObject({ answered: 4, notYet: 1, followup: 2 });
    expect(s.used.map((t) => [t.key, t.n, t.pct])).toEqual([["posted", 1, 25], ["looked", 2, 50], ["both", 0, 0], ["browsed", 0, 0], ["not_yet", 1, 25]]);
    // Shares of the people who answered that question: three gave an outcome.
    expect(s.outcome.find((t) => t.key === "found")).toMatchObject({ n: 2, pct: 67 });
    // "Pick any" counts everyone who was asked, including the one who ticked nothing; not the person who was not asked.
    expect(s.useful.find((t) => t.key === "map")).toMatchObject({ n: 2, pct: 67 });
    expect(s.useful.find((t) => t.key === "photos")).toMatchObject({ n: 1, pct: 33 });
    expect(s.vsLegacy.find((t) => t.key === "better")).toMatchObject({ n: 2, pct: 100 });
    expect(s.overall).toEqual({ counts: [0, 1, 1, 1, 1], answered: 4, average: 3.5 });
    expect(s.recommend).toEqual({ counts: [0, 0, 1, 0, 2], answered: 3, average: 4.3 });
  });

  it("is all zeros with no answers", () => {
    const s = summariseSurvey([]);
    expect(s.answered).toBe(0);
    expect(s.used.every((t) => t.n === 0 && t.pct === 0)).toBe(true);
    expect(s.overall).toEqual({ counts: [0, 0, 0, 0, 0], answered: 0, average: null });
  });
});
