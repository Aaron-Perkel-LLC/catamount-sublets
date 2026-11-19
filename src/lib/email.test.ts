import { describe, expect, it } from "vitest";
import { audienceLabel, emailAudience, emailDraft, emailToSend, isGroup, linkify, paragraphsOf, replyBody, replySubject } from "./email";

const ok = { subject: "Hi", body: "Hello", audience: { kind: "address", email: "sam@example.org" } };

describe("the email schemas", () => {
  it("a draft may be half-written; sending needs a subject, a message and one valid address", () => {
    expect(emailDraft.safeParse({ subject: "", body: "", audience: { kind: "address", email: "sa" } }).success).toBe(true);
    const r = emailToSend.parse({ ...ok, audience: { kind: "address", email: " Sam@Example.ORG " }, body: "a\r\n\r\nb  " });
    expect(r).toMatchObject({ audience: { kind: "address", email: "sam@example.org" }, body: "a\n\nb" });
    for (const bad of [
      { audience: { kind: "address", email: "not-an-email" } },
      { audience: { kind: "address", email: "a@b.com, c@d.com" } },
      { audience: { kind: "address", email: "a@b.com c@d.com" } },
      { audience: { kind: "address", email: `${"a".repeat(250)}@b.com` } },
      { subject: "" },
      { subject: "x".repeat(201) },
      { subject: "two\nlines" },
      { body: "   " },
      { body: "x".repeat(10_001) },
    ]) {
      expect(emailToSend.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });
  it("knows a group from one address, and refuses an audience it doesn't know", () => {
    expect(isGroup({ kind: "address", email: "a@b.com" })).toBe(false);
    for (const a of [{ kind: "board" }, { kind: "everyone" }, { kind: "survey" }, { kind: "stale" }, { kind: "semester", code: "fall26" }, { kind: "people", userIds: ["00000000-0000-4000-8000-000000000001"] }] as const) {
      expect(isGroup(emailAudience.parse(a))).toBe(true);
    }
    expect(emailAudience.safeParse({ kind: "all" }).success).toBe(false);
    expect(emailAudience.safeParse({ kind: "people", userIds: ["nope"] }).success).toBe(false);
    expect(emailDraft.safeParse({ ...ok, resolve: "delete" }).success).toBe(false);
  });
  it("names each audience for the log", () => {
    expect(audienceLabel({ kind: "semester", code: "fall26" }, new Map([["fall26", "Fall 2026"]]))).toBe("Fall 2026 posters");
    expect(audienceLabel({ kind: "semester", code: "gone" })).toBe("gone posters");
    expect(audienceLabel({ kind: "people", userIds: ["a", "b"] })).toBe("2 hand-picked people");
    expect(audienceLabel({ kind: "address", email: "sam@example.org" })).toBe("sam@example.org");
    expect(audienceLabel({ kind: "stale" })).toBe("Posters who haven't signed in since the move");
  });
});

describe("paragraphsOf and linkify", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(paragraphsOf("\nHi,\n\nLine one\nLine two\n \n\nEnd\n")).toEqual([["Hi,"], ["Line one", "Line two"], ["End"]]);
  });
  it("links web and email addresses, leaving sentence punctuation outside", () => {
    expect(linkify("Go to https://example.org/a?b=1. Or www.example.org, or write a@example.org!")).toEqual([
      { kind: "text", text: "Go to " },
      { kind: "link", text: "https://example.org/a?b=1", href: "https://example.org/a?b=1" },
      { kind: "text", text: ". Or " },
      { kind: "link", text: "www.example.org", href: "https://www.example.org" },
      { kind: "text", text: ", or write " },
      { kind: "link", text: "a@example.org", href: "mailto:a@example.org" },
      { kind: "text", text: "!" },
    ]);
    expect(linkify("(see https://en.wikipedia.org/wiki/X_(y))")[1]).toEqual({ kind: "link", text: "https://en.wikipedia.org/wiki/X_(y)", href: "https://en.wikipedia.org/wiki/X_(y)" });
  });
  it("never makes a link out of markup or other schemes", () => {
    expect(linkify('<a href="javascript:alert(1)">x</a>').every((p) => p.kind === "text")).toBe(true);
    expect(linkify("javascript:alert(1)")).toEqual([{ kind: "text", text: "javascript:alert(1)" }]);
  });
});

describe("reply starters", () => {
  const req = { kind: "access", name: "Sam Rivera", email: "sam@example.org", school: null };
  it("greet by first name and name the address", () => {
    expect(replyBody(req, "approved")).toMatch(/^Hi Sam,\n\n[^]*sam@example\.org/);
    expect(replyBody(req, "declined")).toContain("sam@example.org");
    expect(replyBody(req, "blank")).toBe("Hi Sam,\n\n");
    expect(replyBody({ ...req, kind: "school", school: "Champlain College" }, "declined")).toContain("Champlain College");
    expect(replySubject(req)).toMatch(/access request/);
  });
});
