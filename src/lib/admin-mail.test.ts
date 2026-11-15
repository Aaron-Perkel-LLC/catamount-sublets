import { describe, expect, it } from "vitest";
import { adminMailContent, adminMailInput, linkify, paragraphsOf, replyBody, replySubject } from "./admin-mail";

const ok = { to: "sam@example.org", subject: "Hi", body: "Hello" };

describe("adminMailContent", () => {
  it("accepts one address, lowercased, and normalises line endings", () => {
    const r = adminMailContent.parse({ ...ok, to: " Sam@Example.ORG ", body: "a\r\n\r\nb  " });
    expect(r).toEqual({ to: "sam@example.org", subject: "Hi", body: "a\n\nb" });
  });
  it("refuses bad addresses, lists, and over-long or empty fields", () => {
    for (const bad of [
      { to: "not-an-email" },
      { to: "a@b.com, c@d.com" },
      { to: "a@b.com c@d.com" },
      { to: `${"a".repeat(250)}@b.com` },
      { subject: "" },
      { subject: "x".repeat(201) },
      { subject: "two\nlines" },
      { body: "   " },
      { body: "x".repeat(10_001) },
    ]) {
      expect(adminMailContent.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });
  it("lets only a reply resolve a request", () => {
    expect(adminMailInput.safeParse({ ...ok, resolve: "approve" }).success).toBe(false);
    expect(adminMailInput.safeParse({ ...ok, accessRequestId: 3, resolve: "approve" }).success).toBe(true);
    expect(adminMailInput.safeParse({ ...ok, accessRequestId: 3, resolve: "delete" }).success).toBe(false);
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
