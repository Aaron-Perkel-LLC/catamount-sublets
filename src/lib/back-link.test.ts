import { describe, expect, it } from "vitest";
import { backHref, withFrom } from "./back-link";

describe("backHref", () => {
  it("keeps a path on this site, with its query", () => {
    expect(backHref("/map")).toBe("/map");
    expect(backHref("/browse?semester=spring-2027&max=900")).toBe("/browse?semester=spring-2027&max=900");
  });

  it("sends anything else to the front page", () => {
    for (const bad of [undefined, "", "map", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/\t/evil.example", ["/map", "/browse"], `/${"a".repeat(600)}`]) {
      expect(backHref(bad)).toBe("/");
    }
  });
});

describe("withFrom", () => {
  it("carries the current page and its query", () => {
    const href = withFrom("/whats-new", "/map", "semester=spring-2027");
    expect(href).toBe("/whats-new?from=%2Fmap%3Fsemester%3Dspring-2027");
    expect(backHref(new URL(href, "https://x.test").searchParams.get("from") ?? undefined)).toBe("/map?semester=spring-2027");
  });

  it("leaves the link alone from the front page or the page itself", () => {
    expect(withFrom("/whats-new", "/", "")).toBe("/whats-new");
    expect(withFrom("/privacy", "/privacy", "from=%2Fmap")).toBe("/privacy");
  });
});
