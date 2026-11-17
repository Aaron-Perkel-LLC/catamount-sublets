import { describe, expect, it } from "vitest";
import { easternDate } from "./dates";
import { audienceMatches, noticeInput, noticeShownOn, safeBodyHref, safeCtaHref } from "./notices";

const out = { kind: "signed-out" } as const;
const student = { kind: "signed-in", userId: "u", hasListing: false } as const;
const poster = { kind: "signed-in", userId: "u", hasListing: true } as const;

describe("audienceMatches", () => {
  it("everyone takes in everyone; signed_in any account; posters only an account with a listing", () => {
    expect([out, student, poster].map((v) => audienceMatches("everyone", v))).toEqual([true, true, true]);
    expect([out, student, poster].map((v) => audienceMatches("signed_in", v))).toEqual([false, true, true]);
    expect([out, student, poster].map((v) => audienceMatches("posters", v))).toEqual([false, false, true]);
  });
});

describe("noticeShownOn", () => {
  it.each(["/", "/sign-in", "/sign-in?next=/post", "/welcome", "/admin", "/admin/email", "/s/abc123", "/survey", "/outcome", "/unsubscribe"])("never on %s", (p) => {
    expect(noticeShownOn(p)).toBe(false);
  });
  it.each(["/browse", "/map", "/listing/187", "/post", "/account", "/administer", "/surveys-and-more", "/sx"])("on %s", (p) => {
    expect(noticeShownOn(p)).toBe(true);
  });
});

describe("safeBodyHref", () => {
  it.each(["https://example.com/a", "http://example.com", "mailto:someone@example.com", "/browse", "/account#alerts", "/browse?price=900"])("keeps %s", (h) => {
    expect(safeBodyHref(h)).toBe(h);
  });
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "\\\\evil.example",
    "file:///etc/passwd",
    "ftp://example.com",
    "browse",
    "",
  ])("drops %j", (h) => {
    expect(safeBodyHref(h)).toBeNull();
  });
});

describe("safeCtaHref", () => {
  it("allows a path on this site or https only", () => {
    expect(safeCtaHref("/post")).toBe(true);
    expect(safeCtaHref("https://example.com")).toBe(true);
    expect(safeCtaHref("http://example.com")).toBe(false);
    expect(safeCtaHref("mailto:a@example.com")).toBe(false);
    expect(safeCtaHref("javascript:alert(1)")).toBe(false);
    expect(safeCtaHref("//evil.example")).toBe(false);
  });
});

describe("noticeInput", () => {
  const base = { title: "Heads up", bodyMd: "Hello", audience: "posters", ctaLabel: "", ctaHref: "", endsOn: "" };
  it("normalises empty optional fields to null", () => {
    expect(noticeInput.parse(base)).toEqual({ ...base, ctaLabel: null, ctaHref: null, endsOn: null });
  });
  it("wants a CTA's label and link together", () => {
    expect(noticeInput.safeParse({ ...base, ctaLabel: "Go" }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, ctaHref: "/post" }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, ctaLabel: "Go", ctaHref: "/post" }).success).toBe(true);
    expect(noticeInput.safeParse({ ...base, ctaLabel: "Go", ctaHref: "javascript:alert(1)" }).success).toBe(false);
  });
  it("limits lengths and audiences, and refuses a past or impossible end date", () => {
    expect(noticeInput.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, title: "x".repeat(81) }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, bodyMd: "x".repeat(4001) }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, audience: "admins" }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, endsOn: "2020-01-01" }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, endsOn: "2099-02-30" }).success).toBe(false);
    expect(noticeInput.safeParse({ ...base, endsOn: easternDate(new Date()) }).success).toBe(true);
  });
});
