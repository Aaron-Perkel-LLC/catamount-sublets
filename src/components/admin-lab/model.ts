/**
 * The Overview mockups' view model: plain numbers and strings both directions
 * draw from, so the two layouts differ only in layout. Built on the server
 * (src/app/(app)/admin-lab/load.ts). Pure; safe on both sides.
 */

export type ChipTone = "good" | "bad" | "neutral";

export interface Chip {
  tone: ChipTone;
  /** "▲ 12%", "▼ 3 pts", or the plain difference ("+3") when the period before was too small for a percentage. */
  text: string;
  /** The same, in words, for a screen reader and the hover. */
  words: string;
}

/** Below this many in the period before, a percentage means nothing: the chip is grey and shows the difference. */
export const MIN_FOR_PCT = 20;

const signed = (n: number, unit = "") => (n === 0 ? `0${unit}` : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`);

/** How a count moved against the equal period before. Up is good; pass `neutral` where it isn't (people leaving). */
export function countChip(cur: number, prev: number | null, neutral = false): Chip | null {
  if (prev === null || (cur === 0 && prev === 0)) return null;
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : 0;
  if (prev < MIN_FOR_PCT || pct === 0) return { tone: "neutral", text: signed(diff), words: `${signed(diff)} against ${prev} in the period before` };
  return { tone: neutral ? "neutral" : diff > 0 ? "good" : "bad", text: `${diff > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, words: `${diff > 0 ? "Up" : "Down"} ${Math.abs(pct)}% from ${prev} in the period before` };
}

/** How a rate (0–100) moved, in percentage points; grey when the period before had too few people to divide by. */
export function rateChip(cur: number | null, prev: number | null, prevOf: number | null): Chip | null {
  if (cur === null || prev === null || prevOf === null) return null;
  const diff = Math.round(cur - prev);
  if (prevOf < MIN_FOR_PCT || diff === 0) return { tone: "neutral", text: signed(diff, " pts"), words: `${signed(diff)} points against ${Math.round(prev)}% in the period before` };
  return { tone: diff > 0 ? "good" : "bad", text: `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)} pts`, words: `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} points from ${Math.round(prev)}% in the period before` };
}

export type KpiKey = "views" | "contacts" | "rate" | "listings";

export interface Kpi {
  key: KpiKey;
  label: string;
  /** Already formatted: "1,204", "31%", "—". */
  value: string;
  chip: Chip | null;
  /** The explanation behind the ⓘ. */
  tip: string;
  /** One value per chart point (null: nothing to divide by). */
  series: (number | null)[];
  unit: "count" | "percent";
  /** Parts of the whole, for a thin two-tone bar. */
  split?: { label: string; n: number }[];
}

export interface Stat {
  label: string;
  value: string;
  /** Zero: drawn muted. */
  zero: boolean;
  chip?: Chip | null;
  tip?: string;
}

export interface StatGroup {
  title: string;
  stats: Stat[];
}

export interface ChartPointVm {
  /** "YYYY-MM-DD", the day the point ends on. */
  day: string;
  /** "Wed, Nov 18" or "7 days to Nov 18". */
  when: string;
  /** "Nov 18", for the axis. */
  tick: string;
  out: number;
  in: number;
}

export interface OverviewVm {
  range: { key: string; from: string; to: string; caption: string; captionTip: string };
  /** "day": each point is a day. "rolling": each point is the 7 days ending that day. */
  mode: "day" | "rolling";
  points: ChartPointVm[];
  kpis: Kpi[];
  groups: StatGroup[];
  funnel: { label: string; n: number; tip: string }[];
  sources: { label: string; n: number }[];
  targets: { label: string; n: number }[];
  attention: { total: number; href: string; rows: { id: number; label: string; href: string; flags: { short: string; long: string }[] }[] };
  nav: { waiting: number; query: string };
}
