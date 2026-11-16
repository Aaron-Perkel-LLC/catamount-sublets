import { signLink, verifyLink } from "./signed-link";

/**
 * The links in the "still available?" email: `/outcome?t=<listing id>.<expiry>.<signature>&a=<answer>`.
 * The token names the listing, not the person, and is signed with
 * SURVEY_SECRET under its own purpose (src/server/signed-link.ts), so it
 * never passes as a survey link or the other way round. The answer is not
 * signed: the poster picks it, and a different button is a different answer.
 *
 * Good for 90 days from the send: answers are expected after the semester
 * is archived and the listing is gone, and they are still recorded then.
 */
export const OUTCOME_TOKEN_DAYS = 90;
const PURPOSE = "outcome";
const TOKEN = /^([1-9][0-9]{0,9})\.([0-9]{1,12})\.([0-9a-f]{32})$/;

export function signOutcomeToken(listingId: number, now = new Date()): string {
  if (!Number.isSafeInteger(listingId) || listingId <= 0) throw new Error("not a listing id");
  return signLink(PURPOSE, String(listingId), OUTCOME_TOKEN_DAYS, now);
}

/** The listing the token names, or null when it is malformed, forged, past its expiry, or there is no secret. */
export function verifyOutcomeToken(token: string, now = new Date()): { listingId: number } | null {
  const subject = verifyLink(PURPOSE, TOKEN, token, now);
  if (!subject) return null;
  const listingId = Number(subject);
  return Number.isSafeInteger(listingId) && listingId <= 2_147_483_647 ? { listingId } : null;
}
