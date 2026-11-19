/**
 * How a number moved against the previous equal period, for the admin's
 * tiles. With a few dozen listings the counts are small, so the change is
 * always the plain difference ("+3"); a percentage joins it only when the
 * previous period had at least MIN_FOR_PCT, where it means something.
 * Neutral on purpose: more views is good, more unsubscribes is not.
 */
export const MIN_FOR_PCT = 20;

export function deltaText(cur: number, prev: number | null): string | null {
  if (prev === null) return null;
  const diff = cur - prev;
  const abs = diff === 0 ? "±0" : diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
  if (prev < MIN_FOR_PCT || diff === 0) return abs;
  const pct = Math.round((diff / prev) * 100);
  return `${abs} (${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}%)`;
}

/** "12 of 40 (30%)", or "12 of 0" with no percentage. */
export function rate(n: number, of: number): string {
  return of > 0 ? `${n} of ${of} (${Math.round((n / of) * 100)}%)` : `${n} of ${of}`;
}
