import { addDays, CUTOVER_DATE, type ResolvedRange } from "./admin-range";
import { dayLabel } from "./chart";
import { daysBetweenDates } from "./dates";

/**
 * How the admin's charts and sparklines read a range.
 *
 * A chart draws a bar per Eastern day, that day's own count, with a thin line
 * over the bars for the average of the TREND_WINDOW days ending that day: the
 * bars are exact and the line says which way things are going, where a single
 * day at this site's traffic is noise. Past BARS_DAILY_MAX days drawn a bar is
 * a calendar week (Monday to Sunday) and there is no line.
 *
 * A KPI card's sparkline has no room for bars, so it stays a smoothed line:
 * a day per point up to TREND_DAILY_MAX days, then the total for the
 * TREND_WINDOW days ending each day. Counts of events are summed here; a
 * count of distinct people over a window has to come from the query
 * (activitySeries' `window`). Pure.
 */
export const TREND_WINDOW = 7;
export const TREND_DAILY_MAX = 14;
export const BARS_DAILY_MAX = 90;

export type TrendMode = "day" | "rolling";
export type BarBucket = "day" | "week";

/** How a sparkline smooths the range. */
export function trendMode(r: Pick<ResolvedRange, "days">): TrendMode {
  return r.days > TREND_DAILY_MAX ? "rolling" : "day";
}

/** What a bar is: a day, or a week once more than BARS_DAILY_MAX days would be drawn. */
export function barBucket(r: Pick<ResolvedRange, "chartFrom" | "to">): BarBucket {
  return daysBetweenDates(r.chartFrom, r.to) + 1 > BARS_DAILY_MAX ? "week" : "day";
}

/**
 * The range to ask the series for. Daily bars start a window early, so the
 * first days' average and trailing total are whole, but never before the
 * activity log began; weekly bars are asked for as they are.
 */
export function trendRange(r: ResolvedRange): ResolvedRange {
  if (barBucket(r) === "week") return { ...r, bucket: "week" };
  if (r.chartFrom < CUTOVER_DATE) return { ...r, bucket: "day" };
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

/** For each position, the mean of the `window` values ending there, over the values there are at the very start. To one decimal. */
export function trailingMeans(values: readonly number[], window: number): number[] {
  return trailingTotals(values, window).map((t, i) => Math.round((t / Math.min(window, i + 1)) * 10) / 10);
}

export interface TrendPoint {
  /** "YYYY-MM-DD": the day, or the Monday of the week. */
  day: string;
  /** "Nov 18" or "Week of Nov 16", for the tooltip and the table. */
  when: string;
  /** "Nov 18", for the axis. */
  tick: string;
}

export interface Trend<K extends string> {
  bucket: BarBucket;
  points: TrendPoint[];
  /** A bar per point: that day's (or week's) own count. */
  bars: Record<K, number[]>;
  /** The line: the mean of the TREND_WINDOW days ending on each. Null with weekly bars. */
  avg: Record<K, number[]> | null;
  /** The trailing totals the means come from, for a rate over the window (a ratio of sums). Null with weekly bars. */
  totals: Record<K, number[]> | null;
  /** A sparkline's smoothed line: see trendMode(). */
  spark: Record<K, number[]>;
}

/**
 * Rows from trendRange()'s start as chart points from the range's own first
 * day. `windowed` gives a series' sparkline its own per-window values where
 * a sum of days would be wrong (people counted once across the window),
 * one per row; it is used only when the sparkline is rolling.
 */
export function trendSeries<K extends string>(r: Pick<ResolvedRange, "days" | "chartFrom" | "to">, rows: readonly ({ day: string } & Record<K, number>)[], keys: readonly K[], windowed: Partial<Record<K, readonly number[]>> = {}): Trend<K> {
  const bucket = barBucket(r);
  const mode = trendMode(r);
  const daily = bucket === "day";
  // A week's bucket is keyed by its Monday, which can fall before the range's first day.
  const keep = rows.map((d) => !daily || d.day >= r.chartFrom);
  const kept = <T>(xs: readonly T[]) => xs.filter((_, i) => keep[i]);
  const bars = {} as Record<K, number[]>;
  const avg = {} as Record<K, number[]>;
  const totals = {} as Record<K, number[]>;
  const spark = {} as Record<K, number[]>;
  for (const k of keys) {
    const raw = rows.map((d) => d[k]);
    bars[k] = kept(raw);
    totals[k] = kept(trailingTotals(raw, TREND_WINDOW));
    avg[k] = kept(trailingMeans(raw, TREND_WINDOW));
    spark[k] = !daily || mode === "day" ? bars[k] : (windowed[k] ? kept(windowed[k]) : totals[k]);
  }
  const points = kept(rows).map((d) => ({ day: d.day, when: daily ? dayLabel(d.day) : `Week of ${dayLabel(d.day)}`, tick: dayLabel(d.day) }));
  return { bucket, points, bars, avg: daily ? avg : null, totals: daily ? totals : null, spark };
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
