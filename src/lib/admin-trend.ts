import { addDays, CUTOVER_DATE, type ResolvedRange } from "./admin-range";
import { dayLabel } from "./chart";

/**
 * How the admin's charts and sparklines smooth a range. Up to
 * TREND_DAILY_MAX days a point is a day. Past that a point is the total for
 * the TREND_WINDOW days ending that day: at this site's traffic a single day
 * is noise, calendar weeks leave four or five points and a part-finished
 * current week that always looks like a fall, and an average turns whole
 * people into fractions. A trailing total has none of those problems; what
 * it gives up is that the points no longer add up to the range's total,
 * which the big number beside the chart carries instead. Counts of events
 * are summed here; a count of distinct people over the window has to come
 * from the query (activitySeries' `window`). Pure.
 */
export const TREND_WINDOW = 7;
export const TREND_DAILY_MAX = 14;

export type TrendMode = "day" | "rolling";

export function trendMode(r: Pick<ResolvedRange, "days">): TrendMode {
  return r.days > TREND_DAILY_MAX ? "rolling" : "day";
}

/**
 * The range to ask the daily series for: daily buckets, starting a window
 * early when the chart is rolling so its first points are whole, but never
 * before the activity log began.
 */
export function trendRange(r: ResolvedRange): ResolvedRange {
  if (trendMode(r) === "day" || r.chartFrom < CUTOVER_DATE) return { ...r, bucket: "day" };
  const lead = addDays(r.chartFrom, -(TREND_WINDOW - 1));
  return { ...r, bucket: "day", chartFrom: lead < CUTOVER_DATE ? CUTOVER_DATE : lead };
}

/** For each position, the sum of the `window` values ending there (fewer at the very start). */
export function trailingTotals(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum);
  }
  return out;
}

export interface TrendPoint {
  /** "YYYY-MM-DD": the day, or the day the window ends on. */
  day: string;
  /** "Wed, Nov 18" or "7 days to Nov 18", for the tooltip and the table. */
  when: string;
  /** "Nov 18", for the axis. */
  tick: string;
}

/**
 * Daily rows (from trendRange's start) as chart points from the range's own
 * first day: each named series summed over the trailing window, or left
 * daily. A series in `windowed` is already per window (people counted once
 * across it, which a sum of days can't give), so it is taken as it comes.
 */
export function trendSeries<K extends string>(r: Pick<ResolvedRange, "days" | "chartFrom">, days: readonly ({ day: string } & Record<K, number>)[], keys: readonly K[], windowed: readonly K[] = []): { mode: TrendMode; points: TrendPoint[]; values: Record<K, number[]> } {
  const mode = trendMode(r);
  const keep = days.map((d) => d.day >= r.chartFrom);
  const values = {} as Record<K, number[]>;
  for (const k of keys) {
    const raw = days.map((d) => d[k]);
    values[k] = (mode === "rolling" && !windowed.includes(k) ? trailingTotals(raw, TREND_WINDOW) : raw).filter((_, i) => keep[i]);
  }
  const points = days.filter((_, i) => keep[i]).map((d) => ({ day: d.day, when: mode === "rolling" ? `${TREND_WINDOW} days to ${dayLabel(d.day)}` : dayLabel(d.day, true), tick: dayLabel(d.day) }));
  return { mode, points, values };
}

/**
 * A sparkline is worth drawing only with some shape to show: under three
 * non-zero points it is a flat line and a spike, and a series that never
 * gets past 2 is square steps.
 */
export function sparkWorthDrawing(values: readonly (number | null)[]): boolean {
  const v = values.map((x) => x ?? 0);
  return v.filter((x) => x > 0).length >= 3 && Math.max(...v) >= 3;
}
