/**
 * Where the product says "a day" it means an Eastern day: the dedupe key on an
 * activity event, "posted N days ago", the activity chart's buckets. Vercel
 * runs in UTC, so every such calculation goes through here.
 */

export const SITE_TIME_ZONE = "America/New_York";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: SITE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-08" for the instant, in Eastern time. */
export function easternDate(instant: Date): string {
  return ymd.format(instant);
}

/** The Eastern calendar year, for the copyright line. */
export function easternYear(instant: Date = new Date()): number {
  return Number(easternDate(instant).slice(0, 4));
}

/** Days between two Eastern calendar dates ("YYYY-MM-DD"), b − a. */
export function daysBetweenDates(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: SITE_TIME_ZONE, month: "short", day: "numeric" });
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * "today", "yesterday", "3 days ago", "last week", "2 weeks ago", "Sep 14" or
 * "Mar 21, 2025" — counted in Eastern calendar days, so a span across a DST
 * change is still a whole number of days.
 */
export function postedAgo(postedAt: Date, now: Date = new Date()): string {
  const days = daysBetweenDates(easternDate(postedAt), easternDate(now));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "last week" : `${weeks} weeks ago`;
  }
  const sameYear = easternDate(postedAt).slice(0, 4) === easternDate(now).slice(0, 4);
  return sameYear ? monthDay.format(postedAt) : monthDayYear.format(postedAt);
}

/** The instant an Eastern calendar date starts, for range queries. */
export function easternDayStart(date: string): Date {
  // Find the UTC instant whose Eastern date is `date` at 00:00 by probing the offset.
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 5); // Eastern is UTC−4 or UTC−5
  const offsetMinutes = easternOffsetMinutes(new Date(guess));
  return new Date(Date.UTC(y, m - 1, d) - offsetMinutes * 60_000);
}

/** Eastern UTC offset in minutes at an instant (−240 in summer, −300 in winter). */
export function easternOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SITE_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** "Oct 9", or "Oct 9, 2025" outside the current year, for the instant in Eastern time. */
export function shortDate(instant: Date, now: Date = new Date()): string {
  const year = easternYear(instant) === easternYear(now) ? {} : { year: "numeric" as const };
  return instant.toLocaleDateString("en-US", { timeZone: SITE_TIME_ZONE, month: "short", day: "numeric", ...year });
}
