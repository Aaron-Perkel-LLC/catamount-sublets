import { signLink, verifyLink } from "./signed-link";

/**
 * The weekly digest's unsubscribe link: `<user id>.<expiry>.<signature>`,
 * signed with SURVEY_SECRET under its own purpose (src/server/signed-link.ts),
 * so it never passes as a survey or "still available?" link, nor they as it.
 * It names the account; all it can do is turn that account's digest off.
 *
 * Good for a year: an old digest's unsubscribe must keep working long after
 * it was sent (RFC 8058 has no expiry, and mail clients keep the header).
 */
export const DIGEST_UNSUBSCRIBE_DAYS = 365;
const PURPOSE = "digest-unsubscribe";
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9]{1,12})\.([0-9a-f]{32})$/;

export function signDigestUnsubscribe(userId: string, now = new Date()): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)) throw new Error("not a user id");
  return signLink(PURPOSE, userId, DIGEST_UNSUBSCRIBE_DAYS, now);
}

/** The account the token names, or null when it is malformed, forged, expired, another kind of link, or there is no secret. */
export function verifyDigestUnsubscribe(token: unknown, now = new Date()): { userId: string } | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const subject = verifyLink(PURPOSE, TOKEN, token, now);
  return subject ? { userId: subject } : null;
}
