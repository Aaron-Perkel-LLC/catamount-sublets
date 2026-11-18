import { describe, expect, it } from "vitest";
import { assertIsoDate, daysBetweenDates, deadlineWords, easternClock, easternDate, easternGreeting, easternDayStart, easternDeadlinePassed, easternOffsetMinutes, nextDate, postedAgo, shortDate } from "./dates";

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

describe("Eastern deadlines", () => {
  it("runs a deadline to 23:59:59 Eastern on its day, not to UTC midnight", () => {
    // 2026-11-20 is in EST (UTC−5): the day ends at 2026-11-21 04:59:59Z.
    expect(easternDeadlinePassed("2026-11-20", new Date("2026-11-20T23:00:00Z"))).toBe(false);
    expect(easternDeadlinePassed("2026-11-20", new Date("2026-11-21T00:00:00Z"))).toBe(false); // UTC midnight, 7 pm Eastern
    expect(easternDeadlinePassed("2026-11-20", new Date("2026-11-21T04:59:59Z"))).toBe(false); // 23:59:59 Eastern
    expect(easternDeadlinePassed("2026-11-20", new Date("2026-11-21T05:00:00Z"))).toBe(true); // 00:00 Eastern on the 21st
  });

  it("words a deadline and refuses a non-date", () => {
    expect(deadlineWords("2026-11-20")).toEqual({ long: "Friday, November 20", short: "Nov 20" });
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
    expect(assertIsoDate("2026-11-20")).toBe("2026-11-20");
    expect(() => assertIsoDate("2026-11-31")).toThrow();
    expect(() => assertIsoDate("Nov 20")).toThrow();
  });
});

describe("easternClock", () => {
  it("gives the Eastern weekday and hour on both sides of DST", () => {
    expect(easternClock(new Date("2026-11-23T13:05:00Z"))).toEqual({ date: "2026-11-23", weekday: 1, hour: 8 }); // EST
    expect(easternClock(new Date("2027-07-05T12:05:00Z"))).toEqual({ date: "2027-07-05", weekday: 1, hour: 8 }); // EDT
    expect(easternClock(new Date("2026-11-23T04:59:00Z"))).toEqual({ date: "2026-11-22", weekday: 0, hour: 23 });
    expect(easternClock(new Date("2026-11-23T05:00:00Z"))).toEqual({ date: "2026-11-23", weekday: 1, hour: 0 });
  });
});

describe("easternGreeting", () => {
  const at = (iso: string) => new Date(iso);
  it.each([
    ["2026-11-18T09:59:00Z", "Good evening"], // 4:59 EST
    ["2026-11-18T10:00:00Z", "Good morning"], // 5:00
    ["2026-11-18T16:59:00Z", "Good morning"], // 11:59
    ["2026-11-18T17:00:00Z", "Good afternoon"], // 12:00
    ["2026-11-18T21:59:00Z", "Good afternoon"], // 16:59
    ["2026-11-18T22:00:00Z", "Good evening"], // 17:00
    ["2026-11-19T05:00:00Z", "Good evening"], // midnight
  ])("%s is %s", (iso, greeting) => {
    expect(easternGreeting(at(iso))).toBe(greeting);
  });

  it("follows the clock change in November", () => {
    expect(easternGreeting(at("2026-10-31T16:30:00Z"))).toBe("Good afternoon"); // 12:30 EDT
    expect(easternGreeting(at("2026-11-01T16:30:00Z"))).toBe("Good morning"); // 11:30 EST, the day the clocks go back
  });

  it("follows the clock change in March", () => {
    expect(easternGreeting(at("2027-03-13T16:30:00Z"))).toBe("Good morning"); // 11:30 EST
    expect(easternGreeting(at("2027-03-14T16:30:00Z"))).toBe("Good afternoon"); // 12:30 EDT, the day the clocks go forward
  });

  it("adds the first name when there is one", () => {
    expect(easternGreeting(at("2026-11-18T15:00:00Z"), "Ada")).toBe("Good morning, Ada");
    expect(easternGreeting(at("2026-11-18T19:00:00Z"), "  ")).toBe("Good afternoon");
    expect(easternGreeting(at("2026-11-18T19:00:00Z"), null)).toBe("Good afternoon");
  });
});
