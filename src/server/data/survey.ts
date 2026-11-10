import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listings, surveyResponses, user } from "@/db/schema";
import { posterFirstName } from "@/lib/person-name";
import { type SurveyAnswers, type SurveySummary, type SurveyUsed, summariseSurvey } from "@/lib/survey";
import { isTestAddress } from "@/server/email/send";
import { posterColumns } from "./names";

/**
 * The feedback survey's rows. Writes take the account the signed link named
 * (the service verified it); there is no "acting user" beyond that, because
 * the survey is answered without a session. Readers return DTOs with first
 * names only; the email-bearing export is for the admin script alone.
 */

const answerColumns = {
  used: surveyResponses.used,
  outcome: surveyResponses.outcome,
  overall: surveyResponses.overall,
  useful: surveyResponses.useful,
  signin: surveyResponses.signin,
  vsLegacy: surveyResponses.vsLegacy,
  problems: surveyResponses.problems,
  missing: surveyResponses.missing,
  recommend: surveyResponses.recommend,
  lejer: surveyResponses.lejer,
  followup: surveyResponses.followup,
};

/** The columns are CHECKed against the same arrays the zod schema uses, so a row read back is a SurveyAnswers. */
type AnswerRow = {
  used: string;
  outcome: string | null;
  overall: number;
  useful: string[];
  signin: string | null;
  vsLegacy: string | null;
  problems: string;
  missing: string;
  recommend: number | null;
  lejer: string | null;
  followup: boolean;
};
const asAnswers = (r: AnswerRow) => r as SurveyAnswers;

/** Insert, or replace the person's earlier answers. `replaced` is true the second time. */
export async function upsertSurveyResponse(db: DbOrTx, userId: string, a: SurveyAnswers): Promise<{ id: number; replaced: boolean }> {
  const values = {
    used: a.used,
    outcome: a.outcome,
    overall: a.overall,
    useful: [...a.useful],
    signin: a.signin,
    vsLegacy: a.vsLegacy,
    problems: a.problems,
    missing: a.missing,
    recommend: a.recommend,
    lejer: a.lejer,
    followup: a.followup,
  };
  const [row] = await db
    .insert(surveyResponses)
    .values({ userId, ...values })
    // $onUpdate does not run on an upsert, so updatedAt is set here; the first insert leaves both timestamps at now().
    .onConflictDoUpdate({ target: surveyResponses.userId, set: { ...values, updatedAt: new Date() } })
    .returning({ id: surveyResponses.id, createdAt: surveyResponses.createdAt, updatedAt: surveyResponses.updatedAt });
  return { id: row.id, replaced: row.updatedAt.getTime() > row.createdAt.getTime() };
}

/** The person's answers so far, to fill the form in again; null before they have answered. */
export async function getSurveyResponse(db: DbOrTx, userId: string): Promise<(SurveyAnswers & { answeredAt: Date }) | null> {
  const [row] = await db
    .select({ ...answerColumns, answeredAt: surveyResponses.updatedAt })
    .from(surveyResponses)
    .where(eq(surveyResponses.userId, userId));
  if (!row) return null;
  const { answeredAt, ...answers } = row;
  return { ...asAnswers(answers), answeredAt };
}

export interface SurveyAudienceRow {
  id: string;
  email: string;
  /** For "Hi Sam,"; null means greet them without a name (never by their login). */
  firstName: string | null;
  migrated: boolean;
  posted: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * Who is invited: every account except banned ones, admins, test addresses
 * and people who asked for no email. The one definition, so the send script and the admin tab's
 * "N of M answered" agree. Most recently signed in first.
 */
export async function surveyAudience(db: DbOrTx): Promise<SurveyAudienceRow[]> {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      ...posterColumns,
      displayName: listings.displayName,
      listingId: listings.id,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .where(and(sql`coalesce(${user.banned}, false) = false`, sql`${user.role} is distinct from 'admin'`, eq(user.noEmail, false)))
    .orderBy(sql`${user.lastLoginAt} desc nulls last`, asc(user.createdAt));
  return rows
    .filter((r) => !isTestAddress(r.email))
    .map((r) => ({
      id: r.id,
      email: r.email,
      firstName: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }),
      migrated: r.legacyNetid !== null,
      posted: r.listingId !== null,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
    }));
}

/** The audience less everyone who has already answered: who a reminder goes to. */
export async function surveyUnanswered(db: DbOrTx): Promise<SurveyAudienceRow[]> {
  const answered = new Set((await db.select({ userId: surveyResponses.userId }).from(surveyResponses)).map((r) => r.userId));
  return (await surveyAudience(db)).filter((r) => !answered.has(r.id));
}

export async function surveySummary(db: DbOrTx): Promise<SurveySummary> {
  const rows = await db.select(answerColumns).from(surveyResponses);
  return summariseSurvey(rows.map(asAnswers));
}

/** One answer's free text and the context to read it in. First name only; the user id is for the People tab link. */
export interface SurveyTextDto {
  id: number;
  userId: string;
  firstName: string | null;
  posted: boolean;
  used: SurveyUsed;
  overall: number;
  problems: string;
  missing: string;
  followup: boolean;
  answeredAt: Date;
}

export async function listSurveyText(db: DbOrTx): Promise<SurveyTextDto[]> {
  const rows = await db
    .select({
      id: surveyResponses.id,
      userId: surveyResponses.userId,
      ...posterColumns,
      email: user.email,
      displayName: listings.displayName,
      listingId: listings.id,
      used: surveyResponses.used,
      overall: surveyResponses.overall,
      problems: surveyResponses.problems,
      missing: surveyResponses.missing,
      followup: surveyResponses.followup,
      answeredAt: surveyResponses.updatedAt,
    })
    .from(surveyResponses)
    .innerJoin(user, eq(user.id, surveyResponses.userId))
    .leftJoin(listings, eq(listings.userId, user.id))
    .orderBy(desc(surveyResponses.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    firstName: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }),
    posted: r.listingId !== null,
    used: r.used as SurveyUsed,
    overall: r.overall,
    problems: r.problems,
    missing: r.missing,
    followup: r.followup,
    answeredAt: r.answeredAt,
  }));
}

export type SurveyExportRow = SurveyAnswers & { id: number; email: string; firstName: string | null; migrated: boolean; posted: boolean; answeredAt: Date };

/** Every column plus the address: for the admin's CSV script only, never a page. */
export async function surveyExportRows(db: DbOrTx): Promise<SurveyExportRow[]> {
  const rows = await db
    .select({ id: surveyResponses.id, ...answerColumns, email: user.email, ...posterColumns, displayName: listings.displayName, listingId: listings.id, answeredAt: surveyResponses.updatedAt })
    .from(surveyResponses)
    .innerJoin(user, eq(user.id, surveyResponses.userId))
    .leftJoin(listings, eq(listings.userId, user.id))
    .orderBy(asc(surveyResponses.id));
  return rows.map((r) => {
    const { id, email, firstName, lastName, name, legacyNetid, displayName, listingId, answeredAt, ...answers } = r;
    return {
      ...asAnswers(answers),
      id,
      email,
      firstName: posterFirstName({ firstName, lastName, legacyNetid, email, legacyNames: [displayName, name] }),
      migrated: legacyNetid !== null,
      posted: listingId !== null,
      answeredAt,
    };
  });
}

/** Whether the account a survey link names may answer, and what to call them. Null when there is no such account. */
export async function getSurveyPerson(db: DbOrTx, userId: string): Promise<{ firstName: string | null; banned: boolean } | null> {
  const [row] = await db
    .select({ email: user.email, banned: user.banned, ...posterColumns, displayName: listings.displayName })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) return null;
  return { firstName: posterFirstName({ ...row, legacyNames: [row.displayName, row.name] }), banned: row.banned === true };
}
