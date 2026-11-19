import { describe, expect, it } from "vitest";
import { resolveRange } from "./admin-range";
import { sparkWorthDrawing, trailingTotals, trendMode, trendRange, trendSeries } from "./admin-trend";

const now = new Date("2026-11-18T17:00:00Z");

describe("trend", () => {
  it("is daily up to 14 days and rolling past it", () => {
    expect(trendMode(resolveRange({ range: "7d" }, now))).toBe("day");
    expect(trendMode(resolveRange({ range: "custom", from: "2026-11-05", to: "2026-11-18" }, now))).toBe("day");
    expect(trendMode(resolveRange({ range: "30d" }, now))).toBe("rolling");
  });

  it("asks for the series six days early when rolling, never before the log began", () => {
    expect(trendRange(resolveRange({ range: "30d" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-10-14" });
    expect(trendRange(resolveRange({ range: "7d" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-11-12" });
    expect(trendRange(resolveRange({ range: "cutover" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-10-09" });
    expect(trendRange(resolveRange({ range: "all" }, now))).toMatchObject({ bucket: "day", chartFrom: "2026-10-09" });
  });

  it("sums the trailing window", () => {
    expect(trailingTotals([1, 2, 3, 4, 5], 3)).toEqual([1, 3, 6, 9, 12]);
    expect(trailingTotals([], 7)).toEqual([]);
  });

  it("drops the lead days and labels the rest", () => {
    const r = { days: 30, chartFrom: "2026-11-17" };
    const days = Array.from({ length: 8 }, (_, i) => ({ day: `2026-11-${String(11 + i).padStart(2, "0")}`, n: 1 }));
    const t = trendSeries(r, days, ["n"]);
    expect(t.mode).toBe("rolling");
    expect(t.values.n).toEqual([7, 7]);
    expect(t.points.map((p) => p.when)).toEqual(["7 days to Nov 17", "7 days to Nov 18"]);
    const daily = trendSeries({ days: 7, chartFrom: "2026-11-17" }, days, ["n"]);
    expect(daily.values.n).toEqual([1, 1]);
    expect(daily.points[1].when).toBe("Wed, Nov 18");
  });

  it("draws a sparkline only with three non-zero points that get past 2", () => {
    expect(sparkWorthDrawing([0, 0, 0, 6])).toBe(false);
    expect(sparkWorthDrawing([0, 2, null, 6])).toBe(false);
    expect(sparkWorthDrawing([1, 1, 0, 1, 2, 1])).toBe(false);
    expect(sparkWorthDrawing([1, 2, 0, 6])).toBe(true);
    expect(sparkWorthDrawing([])).toBe(false);
  });
});
