import { z } from "zod";
import { daysBetweenDates, easternDate, easternDayStart, nextDate } from "./dates";

/**
 * The admin's one date range, kept in the URL (?range=30d, or
 * ?range=custom&from=2026-10-01&to=2026-10-31) and read by every metric.
 * Ranges are whole Eastern days, `from` and `to` both included; the
 * previous period is the same number of days just before. Pure.
 */

export const RANGE_KEYS = ["7d", "30d", "semester", "cutover", "all", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const DEFAULT_RANGE: RangeKey = "30d";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  semester: "This semester",
  cutover: "Since cutover",
  all: "All time",
  custom: "Custom",
};

/** Cutover day (Eastern): the activity log and every new account start here. */
export const CUTOVER_DATE = "2026-10-09";
/** "All time" reaches back this far: before it there is only migrated data with no activity. */
const ALL_FROM = "2025-01-01";
/** A custom range is at most this long, so a typo can't ask for a decade of weekly buckets. */
const MAX_DAYS = 731;
/** Up to this many days a table by period (Mail sent) is daily; past it, weekly. Charts smooth their own way: src/lib/admin-trend.ts. */
const DAILY_MAX = 62;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d);

export const rangeParams = z.object({
  range: z.enum(RANGE_KEYS).catch(DEFAULT_RANGE).default(DEFAULT_RANGE),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
});
/** Straight from the URL: anything that isn't a known range or a real date falls back to the default. */
export interface RangeParams {
  range?: string;
  from?: string;
  to?: string;
}

export interface Period {
  /** First Eastern day, included. */
  from: string;
  /** Last Eastern day, included. */
  to: string;
  /** The instant `from` starts. */
  start: Date;
  /** The instant after `to` ends. */
  end: Date;
}

export interface ResolvedRange extends Period {
  key: RangeKey;
  label: string;
  days: number;
  /** The same number of days just before, or null (since cutover and all time have nothing before worth comparing). */
  prev: Period | null;
  bucket: "day" | "week";
  /** The first day a chart draws: never before cutover, when the log began. */
  chartFrom: string;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function period(from: string, to: string): Period {
  return { from, to, start: easternDayStart(from), end: easternDayStart(nextDate(to)) };
}

/**
 * The semester today falls in, by the calendar: Spring 1 Jan–15 May, Summer
 * 16 May–15 Aug, Fall 16 Aug–31 Dec. Semesters in the database carry no
 * dates, so this is the admin's own reading of "this semester".
 */
export function semesterStart(today: string): { from: string; name: string } {
  const y = today.slice(0, 4);
  const md = today.slice(5);
  if (md <= "05-15") return { from: `${y}-01-01`, name: `Spring ${y}` };
  if (md <= "08-15") return { from: `${y}-05-16`, name: `Summer ${y}` };
  return { from: `${y}-08-16`, name: `Fall ${y}` };
}

export function resolveRange(params: RangeParams, now: Date = new Date()): ResolvedRange {
  const p = rangeParams.parse(params);
  const today = easternDate(now);
  let key: RangeKey = p.range;
  let from: string;
  let to = today;
  let label = RANGE_LABELS[key];
  let compare = true;

  switch (key) {
    case "7d":
      from = addDays(today, -6);
      break;
    case "30d":
      from = addDays(today, -29);
      break;
    case "semester": {
      const s = semesterStart(today);
      from = s.from;
      label = s.name;
      break;
    }
    case "cutover":
      from = CUTOVER_DATE;
      compare = false;
      break;
    case "all":
      from = ALL_FROM;
      compare = false;
      break;
    case "custom": {
      const f = p.from;
      const t = p.to && p.to <= today ? p.to : today;
      if (!f || f > t || daysBetweenDates(f, t) + 1 > MAX_DAYS) {
        key = DEFAULT_RANGE;
        from = addDays(today, -29);
        label = RANGE_LABELS[key];
      } else {
        from = f;
        to = t;
        label = `${f} – ${t}`;
      }
      break;
    }
  }
  if (from > to) from = to;
  const days = daysBetweenDates(from, to) + 1;
  const prev = compare ? period(addDays(from, -days), addDays(from, -1)) : null;
  const chartFrom = from < CUTOVER_DATE ? (to < CUTOVER_DATE ? from : CUTOVER_DATE) : from;
  const chartDays = daysBetweenDates(chartFrom, to) + 1;
  return { key, label, days, prev, bucket: chartDays <= DAILY_MAX ? "day" : "week", chartFrom, ...period(from, to) };
}

/** The query string for a range ("range=30d", or the custom dates too), for links that keep it. */
export function rangeQuery(r: Pick<ResolvedRange, "key" | "from" | "to">): string {
  const q = new URLSearchParams({ range: r.key });
  if (r.key === "custom") {
    q.set("from", r.from);
    q.set("to", r.to);
  }
  return q.toString();
}

/** The Monday (Eastern calendar) of the week a date falls in: the weekly buckets' key. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Every bucket key from `from` to `to`: each day, or each week's Monday. */
export function bucketKeys(from: string, to: string, bucket: "day" | "week"): string[] {
  const out: string[] = [];
  if (bucket === "day") for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  else for (let d = weekStart(from); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}
