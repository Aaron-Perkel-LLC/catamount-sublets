import { z } from "zod";

/**
 * How a listing ended, asked when the poster deletes it and in the email
 * that goes out before its semester is archived. One vocabulary for the
 * zod schemas, the CHECK constraints (src/db/schema/listing-outcomes.ts),
 * the buttons and the admin card.
 */
export const OUTCOMES = {
  through_site: "Filled through us",
  elsewhere: "Filled elsewhere",
  not_filled: "Not filled",
  still_available: "Still available",
  skipped: "Skipped",
} as const;
export type Outcome = keyof typeof OUTCOMES;
export const OUTCOME_VALUES = Object.keys(OUTCOMES) as Outcome[];

export const OUTCOME_SOURCES = ["delete", "email"] as const;
export type OutcomeSource = (typeof OUTCOME_SOURCES)[number];

/** The answers that say how it ended; "still available" and "skipped" do not. */
export const FINAL_OUTCOMES: readonly Outcome[] = ["through_site", "elsewhere", "not_filled"];

/** The question on My post's delete confirm, in its order. Each one deletes; Skip records only that the question was skipped. */
export const DELETE_ANSWERS = {
  through_site: "Yes, through this site",
  elsewhere: "Yes, somewhere else",
  not_filled: "No, just taking it down",
  skipped: "Skip",
} as const satisfies Partial<Record<Outcome, string>>;
export type DeleteAnswer = keyof typeof DELETE_ANSWERS;
export const DELETE_ANSWER_VALUES = Object.keys(DELETE_ANSWERS) as DeleteAnswer[];

/** The four links in the "still available?" email, in its order. `label` is the poster's words; OUTCOMES has the admin's. */
export const EMAIL_ANSWERS = {
  through_site: "Filled through us",
  elsewhere: "Filled elsewhere",
  still_available: "Still available",
  not_filled: "Taking it down",
} as const satisfies Partial<Record<Outcome, string>>;
export type EmailAnswer = keyof typeof EMAIL_ANSWERS;
export const EMAIL_ANSWER_VALUES = Object.keys(EMAIL_ANSWERS) as EmailAnswer[];

/** The delete action's argument. Absent means an old page that never asked; nothing is recorded. */
export const deleteAnswerSchema = z.enum(DELETE_ANSWER_VALUES).optional();

/** An answer from the email's link: the signed token and the button. Shared by the /outcome page and its action. */
export const emailAnswerSchema = z.object({
  t: z.string().min(1).max(200),
  a: z.enum(EMAIL_ANSWER_VALUES),
});
export type EmailAnswerInput = z.infer<typeof emailAnswerSchema>;

export interface OutcomeSummary {
  counts: Record<Outcome, number>;
  /** through_site + elsewhere + not_filled: the answers that say how a listing ended. */
  answered: number;
  /** through_site as a whole percentage of answered; null before anyone has answered. */
  throughSitePct: number | null;
  /** Listings sent the email, and how many of those have a final answer from any source. */
  asked: number;
  askedAnswered: number;
}

export function summarizeOutcomes(counts: Partial<Record<Outcome, number>>, asked: number, askedAnswered: number): OutcomeSummary {
  const full = Object.fromEntries(OUTCOME_VALUES.map((o) => [o, counts[o] ?? 0])) as Record<Outcome, number>;
  const answered = FINAL_OUTCOMES.reduce((n, o) => n + full[o], 0);
  return { counts: full, answered, throughSitePct: answered ? Math.round((full.through_site / answered) * 100) : null, asked, askedAnswered };
}
