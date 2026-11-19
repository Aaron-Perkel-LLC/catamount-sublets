import { daysBetweenDates, easternDate } from "./dates";

/**
 * Open listings worth a look, by three rules. Pure, so the Overview and the
 * All listings table flag the same ones.
 *
 * - no-views: on the board, posted at least 3 days ago, and no views in the
 *   last 14 days (a listing posted yesterday has had no chance yet).
 * - unconfirmed: open, posted 60+ days ago, never confirmed available.
 * - no-contacts: on the board with 3+ views in the range and nobody got in
 *   touch (fewer views than that is too few to mean anything).
 */
export const ATTENTION = {
  "no-views": "No views in 14 days",
  unconfirmed: "60+ days, never confirmed",
  "no-contacts": "Views but no contacts",
} as const;
export type AttentionFlag = keyof typeof ATTENTION;
/** The same flags, short enough for a list row; the full wording is the hover. */
export const ATTENTION_SHORT: Record<AttentionFlag, string> = { "no-views": "No views", unconfirmed: "Unconfirmed", "no-contacts": "No contacts" };
/** The three rules in a line, for the ⓘ beside "Needs attention". */
export const ATTENTION_RULES = "No views in 14 days (posted 3+ days ago) · 60+ days old and never confirmed available · 3+ views in the range and no contacts.";

export interface AttentionInput {
  status: string;
  onBoard: boolean;
  postedAt: string;
  confirmedAvailableAt: string | null;
  views: number;
  contacts: number;
  views14: number;
}

export function attentionFlags(l: AttentionInput, now: Date = new Date()): AttentionFlag[] {
  const age = daysBetweenDates(easternDate(new Date(l.postedAt)), easternDate(now));
  const flags: AttentionFlag[] = [];
  if (l.onBoard && age >= 3 && l.views14 === 0) flags.push("no-views");
  if (l.status === "open" && age >= 60 && !l.confirmedAvailableAt) flags.push("unconfirmed");
  if (l.onBoard && l.views >= 3 && l.contacts === 0) flags.push("no-contacts");
  return flags;
}
