import { z } from "zod";

/**
 * A message a community account sends a poster through the site (the relay,
 * src/server/services/poster-message.ts). One schema for the form and the
 * Server Action. Links are refused outright: a poster can ask for one when
 * they reply, and a relay that carries no links is a poor tool for phishing.
 * Email addresses and phone numbers are fine.
 */

export const POSTER_MESSAGE_LIMITS = { minChars: 20, maxChars: 1500 } as const;
/** Messages are kept this long for abuse review, then deleted by the daily sweep (the privacy page says so). */
export const POSTER_MESSAGE_RETENTION_DAYS = 180;
export const POSTER_MESSAGE_STATUSES = ["pending", "sent", "failed"] as const;
export type PosterMessageStatus = (typeof POSTER_MESSAGE_STATUSES)[number];

const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Any scheme (https://, ftp://, javascript:// …) or "www.", checked on the raw text so user@host tricks (https://paypal.com@evil.store) can't hide it. */
const SCHEME_OR_WWW = /[a-z][a-z0-9+.-]*:\/\/|\bwww\./i;
/**
 * A bare domain a mail client would link: labels, a dot, and letters for a
 * top-level domain (any of them: .store, .live, .zip…), not followed by more
 * of a word. Over-strict on purpose: "St.John" is refused too, and the
 * refusal says to add a space after the period.
 */
const BARE_DOMAIN = /(?<![a-z0-9@.-])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}(?![a-z0-9-])/i;

/** True when the text holds something a mail client would make a link, email addresses aside. */
export function containsLink(text: string): boolean {
  const normalized = text.normalize("NFKC");
  if (SCHEME_OR_WWW.test(normalized)) return true;
  return BARE_DOMAIN.test(normalized.replace(EMAIL_ADDRESS, " "));
}

/** What the Message poster form shows: open, the poster turned it off, the relay can't send here, or nothing (not a listing they can see). */
export type RelayStatus = "open" | "not_accepting" | "unavailable" | "not_found";

export const LINK_REFUSAL = "Leave links out; the poster can ask for them when they reply. (If it isn't a link, add a space after the period.)";

export const posterMessageInput = z.object({
  listingId: z.number().int().positive(),
  body: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(POSTER_MESSAGE_LIMITS.minChars, `Write at least ${POSTER_MESSAGE_LIMITS.minChars} characters: say who you are and what you're asking.`)
        .max(POSTER_MESSAGE_LIMITS.maxChars, `Keep it under ${POSTER_MESSAGE_LIMITS.maxChars.toLocaleString("en-US")} characters.`)
        .refine((v) => !containsLink(v), LINK_REFUSAL),
    ),
  /** One per opened form, so a double tap or a retry is one message. */
  idempotencyKey: z.string().uuid(),
});
export type PosterMessageInput = z.input<typeof posterMessageInput>;
