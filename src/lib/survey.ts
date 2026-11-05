import { z } from "zod";
import { ALSO_BY, LEGACY, SITE } from "@/config/site";

/**
 * The feedback survey (November 2026). One schema for the form (inline
 * messages) and the Server Action (the truth), and one set of option keys
 * shared with the database CHECKs (src/db/schema/survey-responses.ts) and
 * the admin tallies, so none of them can disagree. Keys are what is stored;
 * labels are in SURVEY_QUESTIONS.
 */

export const SURVEY_USED = ["posted", "looked", "both", "browsed", "not_yet"] as const;
export const SURVEY_OUTCOME = ["found", "filled", "still_looking", "no_longer_needed", "too_early"] as const;
export const SURVEY_USEFUL = ["grid", "map", "filters", "photos", "share_link", "email_code", "contact_poster", "mobile"] as const;
export const SURVEY_SIGNIN = ["easy", "fine", "annoying", "could_not"] as const;
export const SURVEY_VS_LEGACY = ["better", "same", "worse", "never_used"] as const;
export const SURVEY_LEJER = ["would_try", "not_for_me", "already_use"] as const;

export type SurveyUsed = (typeof SURVEY_USED)[number];
export type SurveyOutcome = (typeof SURVEY_OUTCOME)[number];
export type SurveyUseful = (typeof SURVEY_USEFUL)[number];
export type SurveySignin = (typeof SURVEY_SIGNIN)[number];
export type SurveyVsLegacy = (typeof SURVEY_VS_LEGACY)[number];
export type SurveyLejer = (typeof SURVEY_LEJER)[number];

export const SURVEY_LIMITS = { text: 2000 } as const;

/** Someone who has not used the new site yet is not asked how using it went. */
export function skipsUsageQuestions(used: string | null | undefined): boolean {
  return used === "not_yet";
}

const SCALE_ENDS = { overall: ["Frustrating", "Great"], recommend: ["No way", "Definitely"] } as const;

/** Wording shared by the form and the admin tab. Product names come from config (hard rule 4). */
export const SURVEY_QUESTIONS = {
  used: {
    label: `How have you used ${SITE.name} this semester?`,
    options: { posted: "I posted a listing", looked: "I looked for a sublet", both: "Both", browsed: "I just looked around", not_yet: "I haven't used the new site yet" },
  },
  outcome: {
    label: "How did it turn out?",
    options: { found: "I found a place", filled: "I filled my sublet", still_looking: "Still looking, or still listed", no_longer_needed: "I didn't need it in the end", too_early: "Too early to say" },
  },
  overall: { label: "Overall, how was it?", ends: SCALE_ENDS.overall },
  useful: {
    label: "What was most useful?",
    help: "Pick any.",
    options: {
      grid: "Browsing the grid",
      map: "The map",
      filters: "The filters (price, semester, distance)",
      photos: "Photos",
      share_link: "Share links for a listing",
      email_code: "Signing in with an emailed code",
      contact_poster: "Contacting the poster directly",
      mobile: "Using it on my phone",
    },
  },
  signin: { label: "Signing in with an emailed code was…", options: { easy: "Easy", fine: "Fine", annoying: "Annoying", could_not: "I couldn't get in" } },
  vsLegacy: {
    label: `Compared with the old ${LEGACY.name} site, this one is…`,
    options: { better: "Better", same: "About the same", worse: "Worse", never_used: "I never used the old one" },
  },
  problems: { label: "What was annoying, confusing or broken?" },
  missing: { label: "What's missing, or what would bring you back next semester?" },
  recommend: { label: "Would you recommend it to a friend who needs a sublet?", ends: SCALE_ENDS.recommend },
  lejer: {
    section: "One more thing",
    intro: `Do you split rent or utilities with roommates? I built ${ALSO_BY.name} (${ALSO_BY.url}) for that: post a bill, everyone sees their share, and it keeps track of who has paid.`,
    label: "Would you try it?",
    options: { would_try: "I'd try it", not_for_me: "Not for me", already_use: "I already use something for this" },
  },
  followup: { label: "OK to email you about your answers?" },
} as const;

const SCALE_MESSAGE = "Pick a number from 1 to 5.";
const scale = () => z.number(SCALE_MESSAGE).int(SCALE_MESSAGE).min(1, SCALE_MESSAGE).max(5, SCALE_MESSAGE);
const freeText = () => z.string().trim().max(SURVEY_LIMITS.text, "Keep it under 2,000 characters.");

export const surveySchema = z
  .object({
    used: z.enum(SURVEY_USED, "Pick one."),
    outcome: z.enum(SURVEY_OUTCOME, "Pick one of the answers.").nullable(),
    overall: scale(),
    useful: z.array(z.enum(SURVEY_USEFUL, "Pick from the list.")),
    signin: z.enum(SURVEY_SIGNIN, "Pick one of the answers.").nullable(),
    vsLegacy: z.enum(SURVEY_VS_LEGACY, "Pick one of the answers.").nullable(),
    problems: freeText(),
    missing: freeText(),
    recommend: scale().nullable(),
    lejer: z.enum(SURVEY_LEJER, "Pick one of the answers.").nullable(),
    followup: z.boolean(),
    /** A field people never see; anything in it is a bot. */
    website: z.string().max(0, "Leave this empty."),
  })
  // The branch: the usage questions are hidden for "not yet", and whatever a stale or crafted form sends for them is dropped.
  .transform((v) => (skipsUsageQuestions(v.used) ? { ...v, outcome: null, useful: [], signin: null, vsLegacy: null } : v));

export type SurveyInput = z.infer<typeof surveySchema>;
/** What is stored: the input without the honeypot. */
export type SurveyAnswers = Omit<SurveyInput, "website">;

export type SurveyCheck = { ok: true; data: SurveyInput } | { ok: false; fieldErrors: Record<string, string> };

export function parseSurvey(fd: FormData): SurveyCheck {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const radio = (k: string) => str(k) || null;
  const number = (k: string) => (str(k) === "" ? null : Number(str(k)));
  const parsed = surveySchema.safeParse({
    used: str("used"),
    outcome: radio("outcome"),
    overall: number("overall") ?? undefined,
    useful: fd.getAll("useful").filter((v): v is string => typeof v === "string"),
    signin: radio("signin"),
    vsLegacy: radio("vsLegacy"),
    problems: str("problems"),
    missing: str("missing"),
    recommend: number("recommend"),
    lejer: radio("lejer"),
    followup: fd.has("followup"),
    website: str("website"),
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors };
}

/** One option's count, and its share of the people who answered that question. */
export interface Tally {
  key: string;
  label: string;
  n: number;
  pct: number;
}

export interface ScaleSummary {
  /** Index 0 is the number of 1s, index 4 the number of 5s. */
  counts: number[];
  answered: number;
  average: number | null;
}

export interface SurveySummary {
  answered: number;
  notYet: number;
  followup: number;
  used: Tally[];
  outcome: Tally[];
  useful: Tally[];
  signin: Tally[];
  vsLegacy: Tally[];
  lejer: Tally[];
  overall: ScaleSummary;
  recommend: ScaleSummary;
}

const pct = (n: number, base: number) => (base ? Math.round((n / base) * 100) : 0);

function tally(options: Readonly<Record<string, string>>, picks: (string | null)[][]): Tally[] {
  const base = picks.filter((p) => p.some((k) => k !== null)).length;
  return Object.entries(options).map(([key, label]) => {
    const n = picks.filter((p) => p.includes(key)).length;
    return { key, label, n, pct: pct(n, base) };
  });
}

function scaleSummary(values: (number | null)[]): ScaleSummary {
  const given = values.filter((v): v is number => v !== null);
  const counts = [1, 2, 3, 4, 5].map((point) => given.filter((v) => v === point).length);
  const average = given.length ? Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10 : null;
  return { counts, answered: given.length, average };
}

/** The admin tab's numbers, pure so the export script and the tests can use it too. */
export function summariseSurvey(rows: SurveyAnswers[]): SurveySummary {
  return {
    answered: rows.length,
    notYet: rows.filter((r) => skipsUsageQuestions(r.used)).length,
    followup: rows.filter((r) => r.followup).length,
    used: tally(SURVEY_QUESTIONS.used.options, rows.map((r) => [r.used])),
    outcome: tally(SURVEY_QUESTIONS.outcome.options, rows.map((r) => [r.outcome])),
    // "Pick any": the base is everyone who was asked, including those who ticked nothing.
    useful: tally(SURVEY_QUESTIONS.useful.options, rows.filter((r) => !skipsUsageQuestions(r.used)).map((r) => (r.useful.length ? [...r.useful] : [""]))),
    signin: tally(SURVEY_QUESTIONS.signin.options, rows.map((r) => [r.signin])),
    vsLegacy: tally(SURVEY_QUESTIONS.vsLegacy.options, rows.map((r) => [r.vsLegacy])),
    lejer: tally(SURVEY_QUESTIONS.lejer.options, rows.map((r) => [r.lejer])),
    overall: scaleSummary(rows.map((r) => r.overall)),
    recommend: scaleSummary(rows.map((r) => r.recommend)),
  };
}
