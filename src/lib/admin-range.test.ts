import { describe, expect, it } from "vitest";
import { bucketKeys, CUTOVER_DATE, rangeQuery, resolveRange, semesterStart, weekStart } from "./admin-range";

// 18 Nov 2026, 9 pm Eastern (02:00 UTC on the 19th): the Eastern day is the 18th.
const NOW = new Date("2026-11-19T02:00:00Z");

describe("resolveRange", () => {
  it("defaults to the last 30 Eastern days, today included, with the 30 before as the previous period", () => {
    const r = resolveRange({}, NOW);
    expect(r).toMatchObject({ key: "30d", from: "2026-10-20", to: "2026-11-18", days: 30, bucket: "day" });
    expect(r.prev).toMatchObject({ from: "2026-09-20", to: "2026-10-19" });
    expect(r.start.toISOString()).toBe("2026-10-20T04:00:00.000Z"); // EDT midnight
    expect(r.end.toISOString()).toBe("2026-11-19T05:00:00.000Z"); // EST midnight after the 18th
    expect(r.prev!.end.getTime()).toBe(r.start.getTime());
  });

  it("7 days, and a bad range falls back to the default", () => {
    expect(resolveRange({ range: "7d" }, NOW)).toMatchObject({ from: "2026-11-12", to: "2026-11-18", days: 7 });
    expect(resolveRange({ range: "decade" as never }, NOW).key).toBe("30d");
  });

  it("this semester by the calendar, since cutover and all time (no previous period)", () => {
    expect(resolveRange({ range: "semester" }, NOW)).toMatchObject({ from: "2026-08-16", label: "Fall 2026", chartFrom: CUTOVER_DATE });
    const c = resolveRange({ range: "cutover" }, NOW);
    expect(c).toMatchObject({ from: CUTOVER_DATE, prev: null, bucket: "day" });
    const a = resolveRange({ range: "all" }, NOW);
    expect(a.prev).toBeNull();
    expect(a.chartFrom).toBe(CUTOVER_DATE);
  });

  it("custom: valid dates kept, the end clamped to today, nonsense back to the default", () => {
    expect(resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" }, NOW)).toMatchObject({ key: "custom", from: "2026-10-01", to: "2026-10-31", days: 31 });
    expect(resolveRange({ range: "custom", from: "2026-11-01", to: "2027-01-01" }, NOW).to).toBe("2026-11-18");
    expect(resolveRange({ range: "custom", from: "2026-11-10", to: "2026-11-01" }, NOW).key).toBe("30d");
    expect(resolveRange({ range: "custom", from: "2026-02-30" }, NOW).key).toBe("30d");
    expect(resolveRange({ range: "custom", from: "2020-01-01", to: "2026-11-18" }, NOW).key).toBe("30d");
  });

  it("goes weekly past about two months of chart", () => {
    // The chart starts at cutover, so a range reaching back before it draws only from there.
    expect(resolveRange({ range: "custom", from: "2026-01-01", to: "2026-11-18" }, NOW)).toMatchObject({ chartFrom: CUTOVER_DATE, bucket: "day" });
    expect(resolveRange({ range: "custom", from: "2026-10-10", to: "2027-01-20" }, new Date("2027-02-01T17:00:00Z")).bucket).toBe("week");
    expect(resolveRange({ range: "cutover" }, new Date("2027-03-01T17:00:00Z")).bucket).toBe("week");
  });

  it("spans a DST change in whole Eastern days", () => {
    const r = resolveRange({ range: "custom", from: "2026-10-31", to: "2026-11-02" }, NOW);
    expect(r.days).toBe(3);
    expect(r.start.toISOString()).toBe("2026-10-31T04:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-11-03T05:00:00.000Z");
  });
});

describe("helpers", () => {
  it("semesterStart", () => {
    expect(semesterStart("2027-01-01").name).toBe("Spring 2027");
    expect(semesterStart("2027-05-15").name).toBe("Spring 2027");
    expect(semesterStart("2027-05-16").name).toBe("Summer 2027");
    expect(semesterStart("2027-08-16").from).toBe("2027-08-16");
  });

  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-18")).toBe("2026-11-16"); // a Wednesday
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(bucketKeys("2026-11-12", "2026-11-18", "week")).toEqual(["2026-11-09", "2026-11-16"]);
    expect(bucketKeys("2026-11-16", "2026-11-18", "day")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("rangeQuery keeps custom dates only for custom", () => {
    expect(rangeQuery({ key: "7d", from: "x", to: "y" })).toBe("range=7d");
    expect(rangeQuery({ key: "custom", from: "2026-10-01", to: "2026-10-31" })).toBe("range=custom&from=2026-10-01&to=2026-10-31");
  });
});
