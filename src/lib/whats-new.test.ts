import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG } from "@/content/changelog";
import { isRelativePath } from "./notices";
import { isNewer, latestMarker, showNewDot, shownEntries } from "./whats-new";

const e = (date: string, title = date) => ({ date, title });

describe("shownEntries", () => {
  it("keeps entries due by today, newest first, same-day entries in file order", () => {
    const list = [e("2026-10-09", "a"), e("2026-11-21"), e("2026-10-09", "b"), e("2026-11-17")];
    expect(shownEntries(list, "2026-11-20").map((x) => x.title)).toEqual(["2026-11-17", "a", "b"]);
    expect(shownEntries(list, "2026-11-21")[0].title).toBe("2026-11-21");
  });
});

describe("latestMarker and showNewDot", () => {
  const entries = [e("2026-11-17"), e("2026-11-16"), e("2026-11-21")];
  it("marks the newest entry due, with how many share its date", () => {
    expect(latestMarker(entries, "2026-11-20")).toBe("2026-11-17#1");
    expect(latestMarker([...entries, e("2026-11-17", "second")], "2026-11-20")).toBe("2026-11-17#2");
    expect(latestMarker(entries, "2026-11-01")).toBeNull();
  });

  it("shows for an entry newer than the last one seen, and not otherwise", () => {
    expect(showNewDot("2026-11-17#1", "2026-11-20", "2026-11-16#1")).toBe(true);
    expect(showNewDot("2026-11-17#1", "2026-11-20", "2026-11-17#1")).toBe(false);
    expect(showNewDot("2026-11-17#2", "2026-11-20", "2026-11-17#1")).toBe(true); // a second entry that day
    expect(showNewDot("2026-11-21#1", "2026-11-21", "2026-11-17#1")).toBe(true);
    expect(isNewer("2026-11-16#3", "2026-11-17#1")).toBe(false);
  });

  it("on a first visit, shows while the newest entry is under 14 days old", () => {
    expect(showNewDot("2026-11-17#1", "2026-11-30", null)).toBe(true); // 13 days
    expect(showNewDot("2026-11-17#1", "2026-12-01", null)).toBe(false); // 14 days
  });

  it("no entries due, no dot", () => {
    expect(showNewDot(null, "2026-11-20", null)).toBe(false);
  });
});

describe("the changelog", () => {
  it("is newest first, with real dates, short titles and one to three sentences", () => {
    const dates = CHANGELOG.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const x of CHANGELOG) {
      expect(x.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${x.date}T12:00:00Z`))).toBe(false);
      expect(x.title.length).toBeGreaterThan(0);
      expect(x.title.length).toBeLessThanOrEqual(60);
      const sentences = x.body.split(/(?<=[.?!]["”]?)\s+(?=[A-Z"“])/).length;
      expect(sentences, x.title).toBeGreaterThanOrEqual(1);
      expect(sentences, x.title).toBeLessThanOrEqual(3);
    }
  });

  it("links only to pages on this site that exist", () => {
    const pages = path.join(process.cwd(), "src/app");
    const exists = (route: string) =>
      ["", "(app)", "(board)"].some((group) => existsSync(path.join(pages, group, route === "/" ? "" : route, "page.tsx")));
    for (const x of CHANGELOG) {
      if (!x.link) continue;
      expect(isRelativePath(x.link.href), x.link.href).toBe(true);
      expect(exists(x.link.href.split(/[?#]/)[0]), x.link.href).toBe(true);
      expect(x.link.label.length).toBeGreaterThan(0);
    }
  });
});
