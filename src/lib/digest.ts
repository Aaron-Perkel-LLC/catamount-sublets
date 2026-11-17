import { z } from "zod";
import { DIGEST } from "@/config/site";

/**
 * Vocabularies for saved searches and the weekly digest, shared by the
 * schema's CHECK constraints, the zod inputs and the admin's screen.
 */

/** pending: claimed, being sent; sent: Resend took it; empty: nothing matched, nothing sent; failed: Resend refused, or the send was interrupted and not retaken. */
export const DIGEST_SEND_STATUSES = ["pending", "sent", "empty", "failed"] as const;
export type DigestSendStatus = (typeof DIGEST_SEND_STATUSES)[number];

/** How the digest was last turned off: the Account toggle, or the email's unsubscribe link (page or one-click header). */
export const DIGEST_DISABLED_VIA = ["account", "link"] as const;
export type DigestDisabledVia = (typeof DIGEST_DISABLED_VIA)[number];

/** The longest browse query string a saved search may hold. */
export const SAVED_QUERY_MAX_CHARS = 1000;

export const savedSearchName = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(DIGEST.savedSearchNameMaxChars, `At most ${DIGEST.savedSearchNameMaxChars} characters.`);

/**
 * "Get alerts for this search": the browse query string as the page has it
 * (filterSearchParams), canonicalised by the server through the browse
 * parser before it is stored. `enableDigest` is the explicit opt-in on the
 * same press, when the weekly email is off.
 */
export const saveSearchInput = z.object({
  query: z.string().max(SAVED_QUERY_MAX_CHARS),
  name: savedSearchName,
  enableDigest: z.boolean(),
});
export type SaveSearchInput = z.infer<typeof saveSearchInput>;

export const renameSearchInput = z.object({ id: z.number().int().positive().max(2_147_483_647), name: savedSearchName });
export const deleteSearchInput = z.object({ id: z.number().int().positive().max(2_147_483_647) });
export const digestToggleInput = z.object({ enabled: z.boolean() });

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday morning": when the digest goes, in words, for the button and Account. */
export function digestWhen(): string {
  return `${WEEKDAY_NAMES[DIGEST.weekday]} ${DIGEST.hour < 12 ? "morning" : DIGEST.hour < 17 ? "afternoon" : "evening"}`;
}
