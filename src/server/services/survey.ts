import type { DbOrTx } from "@/db";
import { type SurveyAnswers, parseSurvey } from "@/lib/survey";
import { assertWritable, ReadOnlyError } from "@/server/data/settings";
import { getSurveyPerson, getSurveyResponse, upsertSurveyResponse } from "@/server/data/survey";
import { log } from "@/server/log";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { verifySurveyToken } from "@/server/survey-token";

export interface SurveyState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** True when the save replaced earlier answers. */
  replaced?: boolean;
}

const INVALID_LINK = "This link isn't valid any more. Open the one in your email again, or reply to that email for a fresh one.";

/** The account a survey link names, if it may answer: the token is valid, the account exists and is not banned. */
async function personFor(db: DbOrTx, token: string): Promise<{ userId: string; firstName: string | null } | null> {
  const verified = verifySurveyToken(token);
  if (!verified) return null;
  const person = await getSurveyPerson(db, verified.userId);
  if (!person || person.banned) return null;
  return { userId: verified.userId, firstName: person.firstName };
}

export type SurveyPageState = { state: "invalid" } | { state: "open"; firstName: string | null; existing: (SurveyAnswers & { answeredAt: Date }) | null };

/** What /survey shows for a link: the form (filled in again if they answered before), or the "not valid" page. */
export async function surveyPageState(db: DbOrTx, token: string): Promise<SurveyPageState> {
  const person = await personFor(db, token);
  if (!person) return { state: "invalid" };
  return { state: "open", firstName: person.firstName, existing: await getSurveyResponse(db, person.userId) };
}

/**
 * A survey submission: the link's token says whose answers these are, the
 * schema checks them, then one row per account is written or replaced.
 * No session: the token is the whole authorisation, and a bad one gets the
 * same answer whether it is forged, expired, or for a banned account.
 */
export async function submitSurvey(db: DbOrTx, formData: FormData, ip: string): Promise<SurveyState> {
  const token = formData.get("t");
  const person = typeof token === "string" ? await personFor(db, token) : null;
  if (!person) return { ok: false, error: INVALID_LINK };

  const parsed = parseSurvey(formData);
  if (!parsed.ok) {
    // The honeypot gets a quiet "thanks": nothing stored, nothing to learn from.
    if (parsed.fieldErrors.website) return { ok: true };
    return { ok: false, error: "Check the answers marked below.", fieldErrors: parsed.fieldErrors };
  }
  try {
    await assertWritable(db);
  } catch (error) {
    if (error instanceof ReadOnlyError) return { ok: false, error: error.message };
    throw error;
  }

  const perIp = await takeRateLimit(db, RATE_LIMITS.surveyPerIp, ip);
  if (!perIp.allowed) {
    log.warn("survey.rate_limited", { ref: person.userId });
    return { ok: false, error: "That's a lot of saves in a short time. Try again in a little while." };
  }

  const { website: _website, ...answers } = parsed.data;
  void _website;
  const { id, replaced } = await upsertSurveyResponse(db, person.userId, answers);
  log.info("survey.submitted", { ref: id, replaced });
  return { ok: true, replaced };
}
