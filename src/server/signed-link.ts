import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Links that name something (an account, a listing) and work without a
 * sign-in: `<subject>.<expiry seconds>.<signature>`, the signature an HMAC
 * of `<purpose>:<subject>.<expiry>` under SURVEY_SECRET. The purpose keeps
 * one kind of link from passing as another. Used by the survey
 * (survey-token.ts) and the "still available?" email (outcome-token.ts).
 *
 * SURVEY_SECRET rather than APP_SECRET: the scripts that sign survey links
 * run locally with the deployment's value in .env.local, and APP_SECRET
 * (share links, actor keys) is never read back or rotated. A deployment
 * without it has no valid links at all; locally and in tests a fixed
 * stand-in keeps the walkthrough working.
 */
export const SIGNATURE_LENGTH = 32;

/** The signing secret, or null on a deployment (production or preview) that has none set. */
export function linkSecret(): string | null {
  const s = process.env.SURVEY_SECRET;
  if (s) return s;
  const deployed = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return deployed ? null : "development-only-survey-secret";
}

function signature(secret: string, purpose: string, subject: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`${purpose}:${subject}.${expiresAt}`).digest("hex").slice(0, SIGNATURE_LENGTH);
}

export function signLink(purpose: string, subject: string, days: number, now = new Date()): string {
  const secret = linkSecret();
  if (!secret) throw new Error("SURVEY_SECRET is not set");
  const expiresAt = Math.floor(now.getTime() / 1000) + days * 86_400;
  return `${subject}.${expiresAt}.${signature(secret, purpose, subject, expiresAt)}`;
}

/**
 * The subject a token names, or null when it is malformed (per `shape`, whose
 * groups are subject, expiry and signature), forged, past its expiry, or
 * there is no secret to check it against.
 */
export function verifyLink(purpose: string, shape: RegExp, token: string, now = new Date()): string | null {
  const secret = linkSecret();
  if (!secret) return null;
  const m = shape.exec(token);
  if (!m) return null;
  const [, subject, expiresText, given] = m;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now.getTime()) return null;
  const expected = Buffer.from(signature(secret, purpose, subject, expiresAt));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return subject;
}
