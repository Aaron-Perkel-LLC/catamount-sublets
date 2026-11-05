import { sql } from "drizzle-orm";
import { boolean, check, pgTable, serial, smallint, text, unique, uuid } from "drizzle-orm/pg-core";
import { SURVEY_LEJER, SURVEY_OUTCOME, SURVEY_SIGNIN, SURVEY_USED, SURVEY_USEFUL, SURVEY_VS_LEGACY } from "@/lib/survey";
import { user } from "./auth";
import { createdAt, inList, inListOrNull, subsetOf, updatedAt } from "./helpers";

/**
 * The feedback survey (November 2026): one row per account, written through
 * the signed link in the invitation (src/server/survey-token.ts), never from
 * a session. Answering again replaces the row. Typed columns rather than a
 * blob, so the database holds the vocabulary and the admin tallies are
 * plain counts. Goes with the account.
 */
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    used: text().notNull(),
    outcome: text(),
    overall: smallint().notNull(),
    useful: text().array().notNull().default([]),
    signin: text(),
    vsLegacy: text(),
    problems: text().notNull().default(""),
    missing: text().notNull().default(""),
    recommend: smallint(),
    lejer: text(),
    followup: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("survey_responses_user_id_key").on(t.userId),
    check("survey_responses_used_check", inList(t.used, SURVEY_USED)),
    check("survey_responses_outcome_check", inListOrNull(t.outcome, SURVEY_OUTCOME)),
    check("survey_responses_overall_check", sql`${t.overall} between 1 and 5`),
    check("survey_responses_useful_check", subsetOf(t.useful, SURVEY_USEFUL)),
    check("survey_responses_signin_check", inListOrNull(t.signin, SURVEY_SIGNIN)),
    check("survey_responses_vs_legacy_check", inListOrNull(t.vsLegacy, SURVEY_VS_LEGACY)),
    check("survey_responses_recommend_check", sql`${t.recommend} is null or ${t.recommend} between 1 and 5`),
    check("survey_responses_lejer_check", inListOrNull(t.lejer, SURVEY_LEJER)),
  ],
);
