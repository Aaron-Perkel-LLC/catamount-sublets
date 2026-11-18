import { daysBetweenDates } from "./dates";

/**
 * The rules behind /whats-new and the footer's "New" dot, safe on both sides.
 * Dates are Eastern calendar dates ("YYYY-MM-DD"), which compare as strings.
 */

/** localStorage: the newest entry date this browser has seen on /whats-new. */
export const WHATS_NEW_SEEN_KEY = "whatsnew:seen";
/** With nothing stored (a first visit, or cleared storage), the dot shows while the newest entry is this fresh. */
export const FIRST_VISIT_DAYS = 14;

/** The entries due by `today`, newest first (same-day entries keep the file's order). */
export function shownEntries<T extends { date: string }>(entries: readonly T[], today: string): T[] {
  return entries.filter((e) => e.date <= today).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** The date of the newest entry due by `today`, or null. */
export function newestShown(dates: readonly string[], today: string): string | null {
  return dates.filter((d) => d <= today).reduce<string | null>((max, d) => (max === null || d > max ? d : max), null);
}

/**
 * Whether the footer shows the dot: an entry newer than the last one seen,
 * or, with none recorded, one under FIRST_VISIT_DAYS old.
 */
export function showNewDot(dates: readonly string[], today: string, seen: string | null): boolean {
  const newest = newestShown(dates, today);
  if (!newest) return false;
  if (seen) return newest > seen;
  return daysBetweenDates(newest, today) < FIRST_VISIT_DAYS;
}
