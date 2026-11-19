import { describe, expect, it } from "vitest";
import { resolveRange } from "./admin-range";
import { barBucket, sparkWorthDrawing, trailingMeans, trailingTotals, trendMode, trendRange, trendSeries } from "./admin-trend";

const now = new Date("2026-11-18T17:00:00Z");

describe("trend", () => {
  it("is daily up to 14 days and rolling past it", () => {
    expect(trendMode(resolveRange({ range: "7d" }, now))).toBe("day");
    expect(trendMode(resolveRange({ range: "custom", from: "2026-11-05", to: "2026-11-18" }, now))).toBe("day");
    expect(trendMode(resolveRange({ range: "30d" }, now))).toBe("rolling");
  });

  it("draws a bar per day up to 90 days drawn, then a bar per week", () => {
    expect(barBucket(resolveRange({ range: "30d" }, now))).toBe("day");
    expect(barBucket(resolveRange({ range: "all" }, now))).toBe("day"); // drawn from cutover: 41 days
    const later = new Date("2027-03-01T17:00:00Z");
    expect(barBucket(resolveRange({ range: "custom", from: "2026-11-01", to: "2027-01-29" }, later))).toBe("day"); // 90 days
    expect(barBucket(resolveRange({ range: "custom", from: "2026-11-01", to: "2027-01-30" }, later))).toBe("week");
  });

  it("asks for daily bars six days early, never before the log began, and for weekly bars as they are", () => {
    expect(trendRange(resolveRange({ range: "30d" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-10-14" });
    expect(trendRange(resolveRange({ range: "7d" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-11-06" });
    expect(trendRange(resolveRange({ range: "cutover" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-10-09" });
    expect(trendRange(resolveRange({ range: "all" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-10-09" });
    expect(trendRange(resolveRange({ range: "custom", from: "2026-11-01", to: "2027-01-30" }, new Date("2027-03-01T17:00:00Z")))).toMatchObject({ bucket: "week", chartFrom: "2026-11-01" });
  });

  it("sums and averages the trailing window", () => {
    expect(trailingTotals([1, 2, 3, 4, 5], 3)).toEqual([1, 3, 6, 9, 12]);
    expect(trailingTotals([], 7)).toEqual([]);
    expect(trailingMeans([7, 7, 7, 0], 3)).toEqual([7, 7, 7, 4.7]);
    expect(trailingMeans([2, 4, 9], 7)).toEqual([2, 3, 5]); // over the days there are, at the very start
  });

  it("gives each day's own bar, the 7-day average over it and the sparkline's smoothed line", () => {
    const r = { days: 30, chartFrom: "2026-11-17", to: "2026-11-18" };
    const days = Array.from({ length: 8 }, (_, i) => ({ day: `2026-11-${String(11 + i).padStart(2, "0")}`, n: i === 7 ? 15 : 1 }));
    const t = trendSeries(r, days, ["n"]);
    expect(t.bucket).toBe("day");
    expect(t.bars.n).toEqual([1, 15]); // the lead days are dropped
    expect(t.avg?.n).toEqual([1, 3]); // (6 × 1 + 15) / 7
    expect(t.totals?.n).toEqual([7, 21]);
    expect(t.spark.n).toEqual([7, 21]); // trailing totals
    expect(t.points.map((p) => p.when)).toEqual(["Nov 17", "Nov 18"]);
    expect(trendSeries(r, days, ["n"], { n: [0, 0, 0, 0, 0, 0, 4, 5] }).spark.n).toEqual([4, 5]); // counted per window by the query: taken as it comes
    const short = trendSeries({ ...r, days: 7 }, days, ["n"], { n: [0, 0, 0, 0, 0, 0, 4, 5] });
    expect(short.spark.n).toEqual([1, 15]); // a short range's sparkline is the days themselves
    expect(short.avg?.n).toEqual([1, 3]);
  });

  it("gives weekly bars no average, and keeps a first week that starts before the range", () => {
    const r = { days: 120, chartFrom: "2026-11-01", to: "2027-02-28" };
    const weeks = [
      { day: "2026-10-26", n: 3 },
      { day: "2026-11-02", n: 9 },
    ];
    const t = trendSeries(r, weeks, ["n"]);
    expect(t).toMatchObject({ bucket: "week", avg: null, totals: null });
    expect(t.bars.n).toEqual([3, 9]);
    expect(t.spark.n).toEqual([3, 9]);
    expect(t.points[0]).toEqual({ day: "2026-10-26", when: "Week of Oct 26", tick: "Oct 26" });
  });

  it("draws a sparkline only with three non-zero points that get past 2", () => {
    expect(sparkWorthDrawing([0, 0, 0, 6])).toBe(false);
    expect(sparkWorthDrawing([0, 2, null, 6])).toBe(false);
    expect(sparkWorthDrawing([1, 1, 0, 1, 2, 1])).toBe(false);
    expect(sparkWorthDrawing([1, 2, 0, 6])).toBe(true);
    expect(sparkWorthDrawing([])).toBe(false);
  });
});
