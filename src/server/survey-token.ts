import { linkSecret, signLink, verifyLink } from "./signed-link";

/**
 * The link in a survey invitation: `/survey?t=<user id>.<expiry>.<signature>`.
 * It names the account so answers are tied to it without a sign-in (and so
 * without spending a sign-in code), and it is derived, not stored: the
 * send script signs one per person and a re-run signs the same person again.
 * Signed with SURVEY_SECRET (src/server/signed-link.ts) under the purpose
 * "survey", exactly as before that module existed, so links already sent
 * still verify. The token says who, not whether they may answer: the
 * service still checks the account exists and is not banned.
 */
export const SURVEY_TOKEN_DAYS = 60;
const PURPOSE = "survey";
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9]{1,12})\.([0-9a-f]{32})$/;

/** The survey signing secret, or null on a deployment (production or preview) that has none set. */
export const surveySecret = linkSecret;

export function signSurveyToken(userId: string, now = new Date()): string {
  return signLink(PURPOSE, userId, SURVEY_TOKEN_DAYS, now);
}

/** The account the token names, or null when it is malformed, forged, past its expiry, or there is no secret to check it against. */
export function verifySurveyToken(token: string, now = new Date()): { userId: string } | null {
  const userId = verifyLink(PURPOSE, TOKEN, token, now);
  return userId ? { userId } : null;
}
