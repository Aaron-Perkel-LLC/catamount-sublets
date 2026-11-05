import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The link in a survey invitation: `/survey?t=<user id>.<expiry>.<signature>`.
 * It names the account so answers are tied to it without a sign-in (and so
 * without spending a sign-in code), and it is derived, not stored: the
 * send script signs one per person and a re-run signs the same person again.
 * Signed with SURVEY_SECRET, the survey's own secret rather than APP_SECRET:
 * the send script runs locally with the deployment's value in .env.local,
 * and APP_SECRET (share links, actor keys) is never read back or rotated.
 * A deployment without SURVEY_SECRET has no valid survey links at all;
 * locally and in tests a fixed stand-in keeps the walkthrough working.
 * The token says who, not whether they may answer: the service still checks
 * the account exists and is not banned.
 */
export const SURVEY_TOKEN_DAYS = 60;
const SIGNATURE_LENGTH = 32;
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9]{1,12})\.([0-9a-f]{32})$/;

/** The survey signing secret, or null on a deployment (production or preview) that has none set. */
export function surveySecret(): string | null {
  const s = process.env.SURVEY_SECRET;
  if (s) return s;
  const deployed = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return deployed ? null : "development-only-survey-secret";
}

function signature(secret: string, userId: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`survey:${userId}.${expiresAt}`).digest("hex").slice(0, SIGNATURE_LENGTH);
}

export function signSurveyToken(userId: string, now = new Date()): string {
  const secret = surveySecret();
  if (!secret) throw new Error("SURVEY_SECRET is not set");
  const expiresAt = Math.floor(now.getTime() / 1000) + SURVEY_TOKEN_DAYS * 86_400;
  return `${userId}.${expiresAt}.${signature(secret, userId, expiresAt)}`;
}

/** The account the token names, or null when it is malformed, forged, past its expiry, or there is no secret to check it against. */
export function verifySurveyToken(token: string, now = new Date()): { userId: string } | null {
  const secret = surveySecret();
  if (!secret) return null;
  const m = TOKEN.exec(token);
  if (!m) return null;
  const [, userId, expiresText, given] = m;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now.getTime()) return null;
  const expected = Buffer.from(signature(secret, userId, expiresAt));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { userId };
}
