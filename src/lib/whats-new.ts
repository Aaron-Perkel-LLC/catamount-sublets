import { daysBetweenDates } from "./dates";

/**
 * The rules behind /whats-new and the footer's "New" dot, safe on both sides.
 * Dates are Eastern calendar dates ("YYYY-MM-DD"), which compare as strings.
 */

/** localStorage: the newest entry this browser has seen on /whats-new, as a marker (see latestMarker). */
export const WHATS_NEW_SEEN_KEY = "whatsnew:seen";
/** With nothing stored (a first visit, or cleared storage), the dot shows while the newest entry is this fresh. */
export const FIRST_VISIT_DAYS = 14;

/** The entries due by `today`, newest first (same-day entries keep the file's order). */
export function shownEntries<T extends { date: string }>(entries: readonly T[], today: string): T[] {
  return entries.filter((e) => e.date <= today).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * The newest entry due by `today`, as "<date>#<entries on that date>", so a
 * second entry added on a day already seen still counts as new. Null when
 * nothing is due.
 */
export function latestMarker(entries: readonly { date: string }[], today: string): string | null {
  const shown = shownEntries(entries, today);
  if (shown.length === 0) return null;
  const date = shown[0].date;
  return `${date}#${shown.filter((e) => e.date === date).length}`;
}

const parse = (marker: string) => {
  const [date, n] = marker.split("#");
  return { date, n: Number(n) || 0 };
};

/** Whether marker `a` is newer than marker `b`. */
export function isNewer(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  return x.date > y.date || (x.date === y.date && x.n > y.n);
}

/**
 * Whether the footer shows the dot: an entry newer than the last one seen,
 * or, with none recorded, one under FIRST_VISIT_DAYS old.
 */
export function showNewDot(latest: string | null, today: string, seen: string | null): boolean {
  if (!latest) return false;
  if (seen) return isNewer(latest, seen);
  return daysBetweenDates(parse(latest).date, today) < FIRST_VISIT_DAYS;
}
