/** Axis arithmetic for the admin's charts. Pure; the drawing is in src/components/admin/DailyChart.tsx. */

/**
 * Clean y-axis ticks from 0 up to just past `max`, about `target` steps of
 * 1, 2 or 5 × a power of ten. Counts are whole people, so a step is never
 * below 1; an empty chart still gets an axis (0 and 1).
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** "Oct 5", or "Mon, Oct 5" with the weekday, for a calendar date "2026-10-05" (no time zone involved). */
export function dayLabel(day: string, withWeekday = false): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(withWeekday ? { weekday: "short" as const } : {}) });
}
