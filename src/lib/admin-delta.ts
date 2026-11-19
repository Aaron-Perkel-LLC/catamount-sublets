/**
 * How a number moved against the previous equal period, for the admin's
 * delta chips. With a few dozen listings the counts are small, so a
 * percentage appears only when the previous period had at least MIN_FOR_PCT,
 * where it means something; below that the chip is grey and shows the plain
 * difference. Pure.
 */
export const MIN_FOR_PCT = 20;

export type ChipTone = "good" | "bad" | "neutral";

export interface Chip {
  tone: ChipTone;
  /** "▲ 12%", "▼ 3 pts", or the plain difference ("+3"). */
  text: string;
  /** The same in words, for a screen reader and the hover. */
  words: string;
}

const signed = (n: number, unit = "") => (n === 0 ? `0${unit}` : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`);

/**
 * A count against the period before. Up is good unless `neutral` (people
 * leaving, mail failing). Null with nothing to compare, or nothing in either period.
 */
export function countChip(cur: number, prev: number | null, neutral = false): Chip | null {
  if (prev === null || (cur === 0 && prev === 0)) return null;
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : 0;
  if (prev < MIN_FOR_PCT || pct === 0) return { tone: "neutral", text: signed(diff), words: `${signed(diff)} against ${prev} in the period before` };
  return { tone: neutral ? "neutral" : diff > 0 ? "good" : "bad", text: `${diff > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, words: `${diff > 0 ? "Up" : "Down"} ${Math.abs(pct)}% from ${prev} in the period before` };
}

/** A rate (0–100) against the period before, in percentage points; grey when that period had too few people (`prevOf`) to divide by. */
export function rateChip(cur: number | null, prev: number | null, prevOf: number | null): Chip | null {
  if (cur === null || prev === null || prevOf === null) return null;
  const diff = Math.round(cur - prev);
  if (prevOf < MIN_FOR_PCT || diff === 0) return { tone: "neutral", text: signed(diff, " pts"), words: `${signed(diff)} points against ${Math.round(prev)}% in the period before` };
  return { tone: diff > 0 ? "good" : "bad", text: `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)} pts`, words: `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} points from ${Math.round(prev)}% in the period before` };
}

/** "12 of 40 (30%)", or "12 of 0" with no percentage. */
export function rate(n: number, of: number): string {
  return of > 0 ? `${n} of ${of} (${Math.round((n / of) * 100)}%)` : `${n} of ${of}`;
}

/** n as a share of `of`, 0–100 unrounded; null with nothing to divide by. */
export function share(n: number, of: number): number | null {
  return of > 0 ? (n / of) * 100 : null;
}
