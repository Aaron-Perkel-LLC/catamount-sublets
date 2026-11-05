import { describe, expect, it } from "vitest";
import { daysBetweenDates, easternDate, easternDayStart, easternOffsetMinutes, postedAgo, shortDate } from "./dates";

describe("easternDate", () => {
  it("uses the Eastern calendar day, not UTC", () => {
    // 01:30 UTC on 9 Oct is 21:30 EDT on 8 Oct.
    expect(easternDate(new Date("2026-10-09T01:30:00Z"))).toBe("2026-10-08");
    // 05:30 UTC on 9 Oct is 01:30 EDT on 9 Oct.
    expect(easternDate(new Date("2026-10-09T05:30:00Z"))).toBe("2026-10-09");
    // In winter the offset is five hours.
    expect(easternDate(new Date("2027-01-10T04:30:00Z"))).toBe("2027-01-09");
  });
});

describe("easternOffsetMinutes / easternDayStart", () => {
  it("knows daylight saving", () => {
    expect(easternOffsetMinutes(new Date("2026-07-01T12:00:00Z"))).toBe(-240);
    expect(easternOffsetMinutes(new Date("2026-01-01T12:00:00Z"))).toBe(-300);
    expect(easternDayStart("2026-10-08").toISOString()).toBe("2026-10-08T04:00:00.000Z");
    expect(easternDayStart("2026-12-25").toISOString()).toBe("2026-12-25T05:00:00.000Z");
  });
});

describe("postedAgo", () => {
  const now = new Date("2026-10-08T18:00:00Z"); // 2 pm EDT, 8 Oct

  it("counts Eastern calendar days", () => {
    expect(postedAgo(new Date("2026-10-08T06:00:00Z"), now)).toBe("today");
    expect(postedAgo(new Date("2026-10-08T03:59:00Z"), now)).toBe("yesterday"); // 11:59 pm EDT on the 7th
    expect(postedAgo(new Date("2026-10-05T12:00:00Z"), now)).toBe("3 days ago");
    expect(postedAgo(new Date("2026-10-01T12:00:00Z"), now)).toBe("last week");
    expect(postedAgo(new Date("2026-09-20T12:00:00Z"), now)).toBe("2 weeks ago");
    expect(postedAgo(new Date("2026-09-01T12:00:00Z"), now)).toBe("Sep 1");
    expect(postedAgo(new Date("2025-03-21T23:07:23Z"), now)).toBe("Mar 21, 2025");
  });

  it("is a whole number of days across a DST change", () => {
    // 1 Nov 2026 is the fall-back day; a span across it is 25 hours.
    expect(daysBetweenDates("2026-10-31", "2026-11-02")).toBe(2);
    expect(postedAgo(new Date("2026-10-31T16:00:00Z"), new Date("2026-11-02T16:00:00Z"))).toBe("2 days ago");
  });
});

describe("shortDate", () => {
  const now = new Date("2026-10-11T16:00:00Z");
  it("drops the year inside the current one and reads the Eastern day", () => {
    expect(shortDate(new Date("2026-10-09T12:00:00Z"), now)).toBe("Oct 9");
    // 02:00 UTC on the 10th is still the 9th in Burlington.
    expect(shortDate(new Date("2026-10-10T02:00:00Z"), now)).toBe("Oct 9");
  });
  it("keeps the year for an earlier one", () => {
    expect(shortDate(new Date("2025-04-02T12:00:00Z"), now)).toBe("Apr 2, 2025");
  });
});
